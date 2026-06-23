# Phase 2 Pull-Forward — Redis + Async Checkout

Run this **before prod canary** when the capacity worksheet reports `L_safe ≤ 1`.

## Capacity gate

```bash
cd backend
python scripts/capacity_worksheet.py
```

Default placeholder values (`f_billing=0.30`, `W_total=5`, `T_p50=6s`) yield `L_safe=1` → Phase 2 is **required** before scaling onboarding traffic.

Replace env placeholders with Prometheus `_sum`-based measurements before sign-off:

```promql
f_billing = sum(rate(http_request_duration_seconds_sum{handler=~"/api/billing.*"}[1h]))
          / sum(rate(http_request_duration_seconds_sum[1h]))
```

## Deploy checklist

1. **Redis** — provision managed Redis (Render Redis or Upstash). Set:
   - `REDIS_URL=redis://...`
2. **Async checkout** — set on Flask service:
   - `ASYNC_SUBSCRIPTIONS=true`
   - `CHECKOUT_WORKER_ENABLED=true` (starts checkout worker thread in `app.py`)
3. **Celery worker** (optional if using Celery path):
   - Start worker consuming `subscription_worker` queue
4. **Runtime flags** (via admin RPC, not env-only):
   - `idempotency_reclaim_ttl_seconds` = `max(T_p99 × 2.5, 90)`
   - `billing_timeout_ms` = `max(T_p99 × 1500, 18000)`
5. **Load test** at `L_safe` concurrent checkouts before `canary_percent` ramp

## Rollback

| Action | Flag / env |
|--------|------------|
| Disable async | `ASYNC_SUBSCRIPTIONS=false` |
| Revert to sync-only | `CHECKOUT_WORKER_ENABLED=false` |
| Lower proxy timeout | `billing_timeout_ms` via admin RPC |

Rollback via Postgres flags takes ≤30s (30s cache TTL). Env redeploy is break-glass (5–15 min).
