# Billing Capacity Worksheet (Phase 0g) — Post-Async Update

**Status:** Must re-measure after async 202 + bounded dispatch ships. Prior sync-based inputs are **invalid** for HTTP hold time.

## What changed

| Metric | Sync (old) | Async 202 (new) |
|--------|------------|-----------------|
| POST create-subscription HTTP hold | 6–30s | ~100ms–1s |
| Razorpay work | On HTTP thread | Background pool (`checkout_dispatch_duration_seconds`) |
| Poll traffic | None | ~1 req/s per active checkout |

## Re-measure (Prometheus)

```promql
# HTTP init (should drop to ~1s p99)
histogram_quantile(0.99, rate(billing_subscription_creation_duration_seconds_bucket[1h]))

# Background pool job
histogram_quantile(0.99, rate(checkout_dispatch_duration_seconds_bucket[1h]))

# Poll load
sum(rate(flask_http_request_duration_seconds_count{path=~"/api/billing/checkout-status.*"}[1h]))
```

## Updated capacity model

```
T_http_p99   ≈ 1s
T_bg_p99     ≈ 12–30s (Razorpay — unchanged total work, decoupled from HTTP)
L_bg         = floor(W_effective × 0.7)   → set flag checkout_bg_max_workers
poll_rps     ≈ L_bg × (1 / poll_interval)  # ~1/s at 1s interval
```

## Flag wiring

Set via admin RPC after measurement:

- `checkout_bg_max_workers` = L_bg (placeholder: **1** until Prometheus confirms)
- `billing_sync_checkout` = **false** (default)

## Gate

Do not raise `canary_percent` until this worksheet is updated with measured values.

```bash
cd backend
python scripts/capacity_worksheet.py
```

See also [STAGING_KILL_WORKER_TEST.md](./STAGING_KILL_WORKER_TEST.md).
