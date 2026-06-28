# Structured Error Classification — Billing & Payment

## Taxonomy

Every error in the payment system belongs to exactly one of six categories.
Each category has a numeric prefix and subcodes scoped to that category.

```
NETW  → Network / Transport
VAL   → Validation / Input
AUTH  → Authentication / Authorization
SDK   → Client SDK / Browser
GW    → Payment Gateway (Razorpay)
WH    → Webhook / Server Processing
```

---

## 1. Network / Transport (`NETW`) — Client-side

Triggered when the HTTP request fails before reaching the application layer.

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `NETW_TIMEOUT` | 504 | Request exceeded timeout (AbortController) | Auto-retry with backoff (idempotency-safe) |
| `NETW_ABORTED` | 499 | Client disconnected mid-request | Auto-retry once |
| `NETW_FAILED` | 0 | fetch() threw (CORS, DNS, offline) | Auto-retry with backoff |
| `NETW_PAYLOAD_TOO_LARGE` | 413 | Request body exceeds server limit (1 MB) | Do not retry — fix client |

## 2. Validation / Input (`VAL`) — Client + Server

Triggered when the request payload is structurally invalid.

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `VAL_MISSING_FIELD` | 400 | Required field absent (email, plan_name, etc.) | Show field-level error, let user fix |
| `VAL_INVALID_PLAN` | 400 | plan_name not in {starter, business, pro} | Show available plans |
| `VAL_INVALID_EMAIL` | 400 | Email format invalid | Show field-level error |
| `VAL_INVALID_AMOUNT` | 400 | Amount/mismatch with pricing config | Do not retry — backend misconfig |
| `VAL_DOMAIN_REQUIRED` | 400 | X-Product-Domain header missing | Reload page to re-detect domain |

## 3. Authentication / Authorization (`AUTH`) — Server

Triggered when the caller lacks valid credentials or permissions.

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `AUTH_TOKEN_MISSING` | 401 | No Authorization header | Redirect to login |
| `AUTH_TOKEN_EXPIRED` | 401 | Firebase ID token expired | Refresh token silently, retry once |
| `AUTH_TOKEN_INVALID` | 401 | Token verification failed | Redirect to login |
| `AUTH_INSUFFICIENT` | 403 | Token valid but lacks permission | Show "contact support" |

## 4. Client SDK / Browser (`SDK`) — Frontend only

Triggered when the browser or Razorpay SDK prevents checkout from opening.

| Code | Description | Recovery |
|------|-------------|----------|
| `SDK_NOT_LOADED` | Razorpay checkout.js not yet loaded | Preload SDK on pricing mount; fallback to window.open |
| `SDK_LOAD_FAILED` | Razorpay CDN script onerror fired | Retry load once; show manual payment link |
| `SDK_INSTANTIATION_ERROR` | `new Razorpay()` threw (corrupted SDK state) | Fallback to window.open path |
| `SDK_OPEN_ERROR` | `rzp.open()` threw | Show error with retry button |
| `SDK_POPUP_BLOCKED` | Browser blocked popup from rzp.open() | Show manual payment link |
| `SDK_POPUP_TEST_FAILED` | `window.open('', 'test')` returned null | Show "please enable popups" message |
| `SDK_IFRAME_BLOCKED` | `window !== window.top` and postMessage failed | Show manual payment link |

## 5. Payment Gateway (`GW`) — Razorpay / Bank

Triggered by Razorpay API or downstream bank.

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `GW_SUBSCRIPTION_CREATE_FAILED` | 502 | Razorpay subscription.create returned error | Circuit breaker: fail-fast for 30s, then retry |
| `GW_SUBSCRIPTION_NOT_FOUND` | 404 | Razorpay subscription.fetch returned 404 | Log + alert; subscription may not exist |
| `GW_BAD_REQUEST` | 400 | Razorpay rejected request (invalid plan_id, etc.) | Do not retry — fix config |
| `GW_RATE_LIMITED` | 429 | Razorpay rate limit hit (10 req/s for test mode) | Backoff with jitter |
| `GW_SERVER_ERROR` | 502 | Razorpay 5xx upstream error | Circuit breaker: fail-fast |
| `GW_PAYMENT_DECLINED` | — | Card declined, insufficient funds (payment.failed callback) | Show Razorpay error_description, offer retry |
| `GW_PAYMENT_FAILED` | — | Generic payment failure | Show Razorpay error_description |

## 6. Webhook / Server Processing (`WH`) — Backend internal

Triggered by internal processing failures, not the client's fault.

| Code | HTTP | Description | Recovery |
|------|------|-------------|----------|
| `WH_SIGNATURE_INVALID` | 401 | HMAC-SHA256 mismatch on webhook | Log + alert (possible replay or misconfig) |
| `WH_SIGNATURE_MISSING` | 401 | No X-Razorpay-Signature header | Log + alert |
| `WH_TIMESTAMP_REJECTED` | 400 | Event older than 300s or in the future | Log (replay prevention) |
| `WH_EVENT_TOO_OLD` | 400 | created_at exceeds tolerance window | Log (replay protection) |
| `WH_LOCK_CONTENTION` | 200¹ | Distributed lock held by verify endpoint | Outbox worker resolves; return 200 to Razorpay |
| `WH_ACTIVATION_FAILED` | 500 | SubscriptionLifecycleEngine.handle_payment_success() failed | Razorpay retries; DLQ after 5 retries |
| `WH_SUBSCRIPTION_NOT_FOUND` | 200¹ | No subscription matches razorpay_subscription_id | Defer to outbox (30s), then retry; DLQ if persists |
| `WH_PAYLOAD_TOO_LARGE` | 413 | Webhook body exceeds 1 MB | Reject, log, alert |
| `WH_DATABASE_ERROR` | 500 | Supabase query failed | Razorpay retries |
| `WH_DLQ_EXHAUSTED` | — | Outbox retries exhausted (3 attempts) | DLQ entry created; operator must replay |
| `WH_UNHANDLED_EVENT` | 200¹ | Unknown event_type (e.g. subscription.pending) | Log, mark processed, do nothing |

¹ Returns 200 HTTP status because the event is handled (deferred or skipped), 
  not a true error. Razorpay should NOT retry.

---

## Error Response Format

All API error responses follow this schema:

```json
{
  "success": false,
  "error": "Human-readable message for the end user",
  "error_code": "CATEGORY_REASON",
  "request_id": "req_abc123",
  "retryable": true
}
```

- `error_code` — Machine-readable, structured as `CATEGORY_REASON` (uppercase with underscores)
- `error` — End-user-safe message (can be shown in UI)
- `retryable` — Boolean: whether the client should retry the same request
- `request_id` — Correlation ID for log tracing

### Webhook-only response fields

Webhook processor returns these additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `action` | string | What the processor did (e.g. `lock_contention`, `subscription_activated`, `skipped_duplicate`) |
| `processed` | boolean | Whether the event was successfully processed |
| `duplicate` | boolean | Whether this was a duplicate event |
| `request_id` | string | Correlation ID from X-Request-Id header |

---

## Client-Side Retry Logic

The frontend `createSubscriptionWithRetry()` implements this retry matrix:

```
                                        ┌─ Non-retryable: ───────────────────────┐
                                        │  VAL_*, AUTH_TOKEN_INVALID,           │
                                        │  GW_SUBSCRIPTION_NOT_FOUND,           │
                                        │  GW_BAD_REQUEST, WH_SIGNATURE_INVALID │
                                        └─────────── throw immediately ─────────┘

                                        ┌─ Retryable: ───────────────────────────┐
                                        │  NETW_*, AUTH_TOKEN_EXPIRED,          │
                                        │  AUTH_INSUFFICIENT,                    │
                                        │  GW_SERVER_ERROR, GW_RATE_LIMITED,     │
                                        │  WH_DATABASE_ERROR, WH_ACTIVATION_FAILED│
                                        │  SERVICE_UNAVAILABLE                   │
                                        └── exponential backoff 1s, 2s, 4s ─────┘
```

---

## Prometheus Alert Mapping

| Alert Rule | Error Codes | Severity |
|-----------|-------------|----------|
| `CheckoutOpenSuccessRateZero` | `SDK_*`, `NETW_*` | P1 |
| `RazorpayPopupBlockedRateHigh` | `SDK_POPUP_BLOCKED`, `SDK_POPUP_TEST_FAILED` | P0 |
| `BillingCircuitBreakerOpen` | `GW_SUBSCRIPTION_CREATE_FAILED`, `GW_SERVER_ERROR` | P0 |
| `BillingVerifyErrorsHigh` | `WH_SIGNATURE_INVALID`, `WH_SIGNATURE_MISSING` | P1 |
| `WebhookDlqEntriesSpiking` | `WH_DLQ_EXHAUSTED` | P2 |

---

## Implementation Requirements

1. Every `except` that returns an error response MUST set `error_code`
2. Every `error_code` MUST belong to exactly one category above
3. The `retryable` field MUST be set correctly — false positives cause infinite retry storms
4. New error codes MUST be added to this document before being used in code
5. Frontend error codes are emitted as analytics event params, not API responses
