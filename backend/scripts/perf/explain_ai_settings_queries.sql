-- AI Settings save — Supabase SQL editor
-- 1) Replace REPLACE_WITH_FIREBASE_UID with your real Firebase UID
-- 2) Run ONE block at a time (highlight one block, then Run)

-- ---------------------------------------------------------------------------
-- Q1: Slug enforcement read (shop_business.py ~334)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT url_slug, business_name
FROM businesses
WHERE user_id = 'REPLACE_WITH_FIREBASE_UID';

-- ---------------------------------------------------------------------------
-- Q2: Duplicate business check (shop_business.py ~477)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, updated_at
FROM businesses
WHERE user_id = 'REPLACE_WITH_FIREBASE_UID';

-- ---------------------------------------------------------------------------
-- Q3: JSONB merge read (shop_business.py ~517)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ecommerce_policies
FROM businesses
WHERE user_id = 'REPLACE_WITH_FIREBASE_UID';

-- ---------------------------------------------------------------------------
-- Q4: Slug collision check
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT user_id
FROM businesses
WHERE url_slug_lower = lower('sample-store-slug')
  AND user_id <> 'REPLACE_WITH_FIREBASE_UID'
LIMIT 1;

-- ---------------------------------------------------------------------------
-- Q5: Feature gate — users lookup
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, firebase_uid
FROM users
WHERE firebase_uid = 'REPLACE_WITH_FIREBASE_UID'
LIMIT 1;

-- ---------------------------------------------------------------------------
-- Q6: Upsert (staging only — use BEGIN; ... ROLLBACK; if you test a real write)
-- ---------------------------------------------------------------------------
-- BEGIN;
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- INSERT INTO businesses (user_id, brand_voice, updated_at)
-- VALUES ('REPLACE_WITH_FIREBASE_UID', '{"tone":"friendly"}'::jsonb, now())
-- ON CONFLICT (user_id) DO UPDATE
-- SET brand_voice = EXCLUDED.brand_voice,
--     updated_at = EXCLUDED.updated_at;
-- ROLLBACK;

-- ---------------------------------------------------------------------------
-- Q7: Feature gate — subscription (use users.id from Q5 as the UUID)
-- ---------------------------------------------------------------------------
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT plan_name, status, pricing_plan_id, plan_version
-- FROM subscriptions
-- WHERE user_id = 'REPLACE_WITH_SUPABASE_UUID'
--   AND domain = 'shop'
-- ORDER BY created_at DESC
-- LIMIT 1;

-- ---------------------------------------------------------------------------
-- Helper: find your Firebase UID if you don't have it
-- ---------------------------------------------------------------------------
-- SELECT user_id, business_name, url_slug FROM businesses LIMIT 10;
