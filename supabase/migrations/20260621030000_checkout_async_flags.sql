-- Runtime flags for async checkout dispatch (504 fix v2)

INSERT INTO billing_runtime_flags (flag_key, flag_value) VALUES
  ('billing_sync_checkout', 'false'),
  ('checkout_bg_max_workers', '1')
ON CONFLICT (flag_key) DO UPDATE SET
  flag_value = EXCLUDED.flag_value,
  updated_at = NOW();
