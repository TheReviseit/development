#!/usr/bin/env python3
"""
Capacity worksheet helper — prints Little's Law values from env or Prometheus hints.

Phase 0g BLOCKER: replace placeholders with measured Prometheus values before prod deploy.

Prometheus queries (worker-time fraction uses _sum not _count):
  f_billing = sum(rate(http_request_duration_seconds_sum{handler=~"/api/billing.*"}[1h]))
            / sum(rate(http_request_duration_seconds_sum[1h]))
  T_http_p99 = histogram_quantile(0.99, rate(billing_subscription_creation_duration_seconds_bucket[1h]))
  T_bg_p99 = histogram_quantile(0.99, rate(checkout_dispatch_duration_seconds_bucket[1h]))
  poll_rps = sum(rate(flask_http_request_duration_seconds_count{path=~"/api/billing/checkout-status.*"}[1h]))
"""

import os


def main():
    w_total = int(os.getenv('GUNICORN_WORKERS', '5'))
    f_billing = float(os.getenv('CAPACITY_F_BILLING', '0.30'))
    t_http_p99 = float(os.getenv('CAPACITY_T_HTTP_P99_SECONDS', '1'))
    t_bg_p99 = float(os.getenv('CAPACITY_T_BG_P99_SECONDS', '12'))
    poll_interval = float(os.getenv('CAPACITY_POLL_INTERVAL_SECONDS', '1'))

    w_effective = w_total * f_billing
    l_bg = max(1, int(w_effective * 0.7))
    poll_rps = l_bg * (1.0 / poll_interval) if poll_interval > 0 else 0
    lambda_max = w_effective / t_http_p99 if t_http_p99 > 0 else 0
    reclaim_ttl = max(t_bg_p99 * 2.5, 90)
    billing_timeout_ms = max(int(t_bg_p99 * 1500), 18000)

    print('=== Billing Capacity Worksheet (async 202) ===')
    print(f'W_total={w_total} f_billing={f_billing} (use Prometheus _sum)')
    print(f'T_http_p99={t_http_p99}s (POST create-subscription init)')
    print(f'T_bg_p99={t_bg_p99}s (checkout_dispatch_duration_seconds)')
    print(f'W_effective={w_effective:.2f}')
    print(f'lambda_max~={lambda_max:.3f} init req/s')
    print(f'L_bg={l_bg} → checkout_bg_max_workers flag')
    print(f'poll_rps~={poll_rps:.2f} (L_bg / poll_interval)')
    print(f'reclaim_ttl_seconds={reclaim_ttl:.0f}')
    print(f'billing_timeout_ms={billing_timeout_ms}')
    if l_bg <= 1:
        print('WARNING: L_bg<=1 -> monitor pool saturation (429) before canary ramp')
    else:
        print('OK: Background pool has headroom at current measured load')


if __name__ == '__main__':
    main()
