# Prometheus Alerting Rules — Billing & Payment

## Source of Truth

These alert definitions live in `docs/ALERTING_RULES.md` and MUST be mirrored
in your Prometheus/Alertmanager configuration. When updating a rule, update
this file first (doc-as-config).

## Rule Set

### Rule 1: Checkout Open Success Rate Collapsed

```yaml
# ─────────────────────────────────────────────────────────────────
# If zero successful checkout opens in 5 minutes → P1
# Indicates: Razorpay SDK broken, popup blocker policy changed,
#            or frontend deployment broke the synchronous path.
# ─────────────────────────────────────────────────────────────────
alert: CheckoutOpenSuccessRateZero
expr: |
  rate(checkout_open_total{status="success"}[5m]) == 0
  and
  rate(checkout_open_total{status="failure"}[5m]) > 0
for: 5m
labels:
  severity: p1
  team: billing
annotations:
  summary: "No successful checkout opens in the last 5 minutes ({{ $value.value }} failures/min)"
  description: >
    All checkout attempts are failing. Check Razorpay SDK CDN
    (https://checkout.razorpay.com/v1/checkout.js), frontend deployment,
    and browser popup policy.
  runbook: "https://opencode.ai/runbooks/checkout-failure"
```

### Rule 2: Popup Blocker Rate Exceeded

```yaml
# ─────────────────────────────────────────────────────────────────
# If > 5 popup-blocked events per minute → P0
# Indicates: Browser popup blocker is blocking all checkouts,
#            iframe sandbox misconfiguration, or CSP violation.
# ─────────────────────────────────────────────────────────────────
alert: RazorpayPopupBlockedRateHigh
expr: |
  rate(payment_popup_blocked_total[1m]) > 5
for: 2m
labels:
  severity: p0
  team: billing
annotations:
  summary: "Popup blocker rate > 5/min ({{ $value.value }}/min)"
  description: >
    Popup blocker is preventing checkout opens at high rate.
    If the onboarding runs in an iframe, verify sandbox="allow-popups
    allow-popups-to-escape-sandbox" attributes.
    Check for recent CSP changes or browser update.
  runbook: "https://opencode.ai/runbooks/popup-blocked"
```

### Rule 3: Circuit Breaker Open

```yaml
# ─────────────────────────────────────────────────────────────────
# If circuit breaker opens → P0
# Indicates: Razorpay API is unreachable, misconfigured, or
#            returning excessive errors.
# ─────────────────────────────────────────────────────────────────
alert: BillingCircuitBreakerOpen
expr: |
  billing_circuit_breaker_open == 1
for: 1m
labels:
  severity: p0
  team: billing
annotations:
  summary: "Billing circuit breaker is OPEN"
  description: >
    The Redis-backed circuit breaker has tripped for Razorpay API calls.
    All checkout creation requests will fail-fast without hitting Razorpay.
    Check Razorpay API status (https://status.razorpay.com) and backend
    RAZORPAY_KEY_SECRET configuration.
  runbook: "https://opencode.ai/runbooks/circuit-breaker"
```

## Metric Sources

| Metric | Source | Type |
|--------|--------|------|
| `checkout_open_total` | Backend `billing_api.py` Prometheus counter (labels: `path`, `status`, `plan_id`) | Counter |
| `payment_popup_blocked_total` | Frontend analytics → backend Prometheus counter or GA4 | Derived |
| `billing_circuit_breaker_open` | Backend `circuit_breaker_redis.py` Prometheus gauge | Gauge |

## Grafana Dashboard Query Examples

```promql
# Checkout open success rate (last 30m)
sum(rate(checkout_open_total{status="success"}[5m])) / 
sum(rate(checkout_open_total[5m])) * 100

# SDK load latency p95 (last 1h)
histogram_quantile(0.95,
  sum(rate(razorpay_sdk_load_latency_ms_bucket[1h])) by (le)
)

# Checkout success by path (sync vs async)
sum by (path) (rate(checkout_open_total{status="success"}[30m]))
```

## Silencing Rules

| Alert | Silence Duration | Reason |
|-------|-----------------|--------|
| CheckoutOpenSuccessRateZero | 15m | Deploy window — frontend redeploy shows brief zero rate |
| RazorpayPopupBlockedRateHigh | 30m | Known browser bug (Chrome 132 blocked popup regression) |
| BillingCircuitBreakerOpen | 10m | Deploy window — backend restart clears circuit breaker |
