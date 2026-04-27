# Auth Sync “Final 5%” Hardening (Production-Grade)

This document is the canonical plan/spec for hardening `POST /api/auth/sync` to be:

- **Lock-safe** under concurrency (idempotency claim-first)
- **Operationally reliable** (durable jobs with retries + dead-letter)
- **Abuse-resistant** (per-IP and per-user throttles)
- **Traceable end-to-end** (W3C `traceparent` + OpenTelemetry export)

Status: **Implemented** (see migration + code paths below).

---

## 1) Idempotency (claim-first, lock-safe)

### Data model
Table: `auth_sync_idempotency`

- `idempotency_key` (PK)
- `status`: `processing | completed | failed`
- `response_body`, `status_code`, `error_code`
- `locked_by`, `locked_at`, `expires_at`

### RPCs
- `auth_sync_claim(p_idempotency_key, p_locked_by, p_ttl_seconds)` → returns `{ claimed, status, response_body, status_code, ... }`
- `auth_sync_get(p_idempotency_key)` → returns current row snapshot
- `auth_sync_complete(p_idempotency_key, p_locked_by, ...)` → stores final response for replay

### Request behavior
1. Verify Firebase token (idempotency key includes token `iat`).
2. Compute key: `sha256(firebaseUid + product + allowCreate + tokenIat)` → `as_<32hex>`.
3. **Claim first**:
   - If claimed: this request is the owner → do provisioning and side effects.
   - If not claimed:
     - If already completed: return cached response.
     - If processing: wait/poll up to 5s; if still not completed → return `202 SYNC_IN_PROGRESS` with `Retry-After: 1`.

Implementation: `frontend/app/api/auth/sync/route.ts`

---

## 2) Provisioning (single RPC round-trip)

RPC: `provision_user_with_membership(...) RETURNS jsonb`

Returns:
- `user`: full `users` row
- `membership`: `user_products` row (current product when available)
- `created`: boolean
- `has_access`: boolean (based on membership status + trial expiry)

The API route uses this RPC so it does not need an extra “RPC then SELECT user again” round trip.

Implementation:
- SQL: `supabase/migrations/20260423000000_auth_sync_final_hardening.sql`
- TS wrapper: `frontend/lib/auth/provisioning.server.ts`

---

## 3) Durable background jobs (retries + dead-letter)

Tables:
- `background_jobs`
  - `next_attempt_at`, `locked_by`, `locked_until`, `last_error`
  - `traceparent`, `request_id` for correlation
- `background_jobs_dead_letter`

Retry policy:
- On failure: `attempts += 1`, `next_attempt_at = now + (2^attempts) minutes` with ±20% jitter
- If `attempts >= max_attempts`: move/copy to dead-letter and mark job `dead_lettered`

Worker:
- Celery beat task polls claimable jobs and processes them with lock/reclaim.

Implementation:
- Worker: `backend/tasks/auth_sync_jobs.py`
- Celery schedule: `backend/celery_app.py`

Current job types:
- `SEND_WELCOME_EMAIL`
- `START_TRIAL` (uses pricing plan lookup + TrialEngine)

---

## 4) Rate limiting / abuse protection (Upstash Redis)

Two independent limits:
- **Per-IP** (before token verification): 60/min
- **Per-user** (after token verification): 20/min

On limit:
- HTTP `429`
- Body includes `requestId` (+ `traceId` when available)
- Header `Retry-After: <seconds>`

Implementation:
- `frontend/lib/server/rateLimit.ts`
- `frontend/app/api/auth/sync/route.ts`

---

## 5) Tracing (OpenTelemetry + W3C propagation)

Headers:
- Incoming `traceparent` is accepted and echoed back when present.
- Response always sets `x-request-id`.

Next.js OpenTelemetry exporter:
- `frontend/instrumentation.ts`
- Exports to OTLP endpoint when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

Background jobs:
- Store `traceparent` in `background_jobs.traceparent`
- Worker optionally exports spans to OTLP when configured.

---

## Required configuration (env)

Frontend (Next.js):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (optional, enables tracing export)
- `OTEL_SERVICE_NAME` (optional)
- `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` (already required)

Backend (Celery worker):
- `RESEND_API_KEY` (for `SEND_WELCOME_EMAIL`)
- `RESEND_FROM_EMAIL` (optional)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (optional)
- `OTEL_SERVICE_NAME` (optional)

---

## Acceptance tests (manual / integration)

- **Concurrency**: two simultaneous `/api/auth/sync` with same token/product/allowCreate → one owner, one follower returns cached or `202`.
- **Idempotency**: repeat same request → identical response (no duplicate side effects).
- **Rate limiting**: exceed IP/user limits → `429` with `Retry-After`.
- **Jobs**: simulate job failure → `attempts` increments, `next_attempt_at` advances; after `max_attempts`, job appears in dead-letter.
- **Tracing**: a request containing `traceparent` produces correlated logs and (when configured) OTLP traces for API + job execution.

