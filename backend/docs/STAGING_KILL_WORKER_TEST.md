# Staging Kill-Worker Test — Async Checkout Backstop

Manual test required before production canary ramp. Documents webhook + poll authority when dispatch pool thread dies on deploy.

## Preconditions

- Staging environment with Razorpay sandbox
- `billing_sync_checkout=false` (async default)
- `checkout_bg_max_workers=1`
- Webhook endpoint reachable from Razorpay

## Steps

1. Start a checkout from onboarding embedded (plan = pro).
2. Confirm POST `/api/billing/create-subscription` returns **202** in under 2 seconds.
3. While poll shows `status=processing`, send **SIGTERM** to the Gunicorn worker handling the request (or redeploy).
4. Wait for Razorpay webhook `subscription.authenticated` / `subscription.activated`.
5. Continue polling `GET /api/billing/checkout-status/{token}`.

## Pass criteria

| Check | Expected |
|-------|----------|
| POST init | 202 with `checkout_token` |
| Poll after worker kill | Eventually `status=completed` with `subscription_id` |
| Stuck forever | Must NOT remain `processing` > reclaim TTL (90s) without resolution |
| Idempotency row | `COMPLETE` or reconciliation detects orphan |
| Razorpay | Exactly one subscription for idempotency key |

## Failure remediation

```bash
python backend/scripts/reconcile_stuck_subscriptions.py --dry-run
python backend/scripts/reconcile_stuck_subscriptions.py --apply  # after review
```

Rollback: set `billing_sync_checkout=true` via admin RPC (≤30s) only if async path regresses.
