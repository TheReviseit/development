-- ============================================================================
-- Migration 051: Add Performance Indexes for 1M+ User Scale
-- ============================================================================
-- These indexes address the most expensive queries found in the codebase audit.
-- All indexes use IF NOT EXISTS so they are safe to re-run.

-- 1. User lookups (Firebase UID → Supabase UUID resolution)
-- Used by: supabase_client.resolve_user_id(), every authenticated request
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

-- 2. Business lookups by owner (Firebase UID in user_id column)
-- Used by: shop_business.py, feature_gate_engine, store page SSR
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);

-- 3. Slug resolution (case-insensitive store URL lookup)
-- Used by: slug_resolver.py, store/[username]/page.tsx SSR, getStoreBySlug()
CREATE INDEX IF NOT EXISTS idx_businesses_url_slug_lower ON businesses(url_slug_lower);

-- 4. Subscription lookups (user + domain composite — the primary gate query)
-- Used by: feature_gate_engine._get_subscription() on EVERY feature check
-- NOTE: Column was renamed domain → product_domain in migration 034.
-- This creates both variants — the one matching your schema will succeed,
-- the other will no-op (column not found is safe with IF NOT EXISTS).
DO $$
BEGIN
    -- Try product_domain first (post-migration 034)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'product_domain'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain ON subscriptions(user_id, product_domain)';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'domain'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain ON subscriptions(user_id, domain)';
    END IF;
END $$;

-- 5. Product listing by owner
-- Used by: /api/products GET, store page product loading
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

-- 6. Order listing by owner + time (covering index for common list query)
-- Used by: /api/orders/<user_id> — most expensive list endpoint
CREATE INDEX IF NOT EXISTS idx_orders_user_created
ON orders(user_id, created_at DESC);

-- 7. Usage counters composite (feature gate check path)
-- Used by: feature_gate_engine._get_usage_counter()
-- NOTE: usage_counters uses 'domain' (not 'product_domain')
CREATE INDEX IF NOT EXISTS idx_usage_counters_composite
ON usage_counters(user_id, domain, feature_key);

-- 8. Plan features by plan (feature diff calculations, feature checks)
-- Used by: upgrade_engine._get_plan_features_batch(), feature_gate_engine
CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id ON plan_features(plan_id);

-- 9. Analytics daily aggregation (dashboard analytics queries)
-- Used by: analytics.py overview endpoint
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user_date
ON analytics_daily(user_id, date);

-- 10. WhatsApp credential chain (webhook processing hot path)
-- Used by: supabase_client.get_credentials_by_phone_number_id()
CREATE INDEX IF NOT EXISTS idx_connected_phones_user_active
ON connected_phone_numbers(user_id, is_active) WHERE is_active = true;

-- 11. Feature flags lookup (global, small table but queried per feature check)
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(feature_key);

-- 12. Subscription addons (addon limit calculations)
CREATE INDEX IF NOT EXISTS idx_subscription_addons_sub_status
ON subscription_addons(subscription_id, status) WHERE status = 'active';
