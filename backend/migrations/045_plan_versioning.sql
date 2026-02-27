-- =============================================================================
-- Migration 045: Plan Versioning (Immutable Plan Snapshots)
-- =============================================================================
-- Problem: Changing plan limits hurts existing customers
--   - Admin reduces starter plan from 10 → 5 products
--   - ALL existing starter customers instantly drop to 5 limit
--   - Customer complaint: "Why did my limit decrease?"
--   - Legal risk: Breach of contract if original plan promised 10
--
-- Stripe/Shopify Behavior: Plans are immutable snapshots
--   - Changing a plan creates a NEW version
--   - Existing subscriptions remain on old version (grandfathered)
--   - New subscriptions get updated plan
--
-- Enterprise Solution: Snapshot plan features at subscription time
--   - Store plan_features_snapshot in subscriptions table (JSONB)
--   - FeatureGateEngine reads snapshot (not live plan_features)
--   - Protects customers from retroactive limit reductions
--
-- Deploy:
--   1. Run this migration (adds columns + trigger, zero downtime)
--   2. Update FeatureGateEngine to read snapshot first
--   3. Existing subscriptions without snapshot use live plan_features (fallback)
-- =============================================================================

-- =============================================================================
-- Step 1: Add Versioning Columns to subscriptions Table
-- =============================================================================
DO $$
BEGIN
    -- Add plan_version column (tracks pricing_plans.pricing_version)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'plan_version'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN plan_version INTEGER DEFAULT 1;
        RAISE NOTICE 'Added plan_version column to subscriptions';
    ELSE
        RAISE NOTICE 'plan_version column already exists (skipped)';
    END IF;

    -- Add plan_features_snapshot column (JSONB array of features)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'plan_features_snapshot'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN plan_features_snapshot JSONB;
        RAISE NOTICE 'Added plan_features_snapshot column to subscriptions';
    ELSE
        RAISE NOTICE 'plan_features_snapshot column already exists (skipped)';
    END IF;
END $$;

-- =============================================================================
-- Step 2: Create Trigger Function to Snapshot Plan Features
-- =============================================================================
CREATE OR REPLACE FUNCTION snapshot_plan_features()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_id UUID;
    v_features JSONB;
    v_pricing_version INTEGER;
BEGIN
    -- =================================================================
    -- Get plan ID from pricing_plans table
    -- =================================================================
    SELECT id, pricing_version
    INTO v_plan_id, v_pricing_version
    FROM pricing_plans
    WHERE plan_slug = NEW.plan_name
      AND product_domain = NEW.product_domain
      AND is_active = true
    LIMIT 1;

    -- If plan not found, skip snapshot (will use live plan_features as fallback)
    IF v_plan_id IS NULL THEN
        RAISE WARNING 'Plan not found: % for domain %. Skipping snapshot.', NEW.plan_name, NEW.product_domain;
        RETURN NEW;
    END IF;

    -- =================================================================
    -- Snapshot ALL features for this plan (JSONB array)
    -- =================================================================
    -- Format: [
    --   {"feature_key": "create_product", "hard_limit": 10, "soft_limit": 8, "is_unlimited": false},
    --   {"feature_key": "custom_domain", "hard_limit": null, "soft_limit": null, "is_unlimited": false},
    --   ...
    -- ]
    -- =================================================================
    SELECT jsonb_agg(
        jsonb_build_object(
            'feature_key', feature_key,
            'hard_limit', hard_limit,
            'soft_limit', soft_limit,
            'is_unlimited', is_unlimited
        )
    )
    INTO v_features
    FROM plan_features
    WHERE plan_id = v_plan_id;

    -- =================================================================
    -- Store snapshot in subscription row
    -- =================================================================
    NEW.plan_features_snapshot := v_features;
    NEW.plan_version := COALESCE(v_pricing_version, 1);

    RAISE NOTICE 'Snapshotted % features for plan % (version %)',
        jsonb_array_length(v_features), NEW.plan_name, NEW.plan_version;

    RETURN NEW;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't block subscription creation
        RAISE WARNING 'snapshot_plan_features failed: %. Subscription will use live plan_features.', SQLERRM;
        RETURN NEW;
END;
$$;

-- =============================================================================
-- Step 3: Attach Trigger to subscriptions Table
-- =============================================================================
DO $$
BEGIN
    -- Drop existing trigger if it exists (idempotency)
    DROP TRIGGER IF EXISTS trigger_snapshot_plan_features ON subscriptions;

    -- Create trigger (fires BEFORE INSERT or UPDATE of plan_name)
    CREATE TRIGGER trigger_snapshot_plan_features
    BEFORE INSERT OR UPDATE OF plan_name ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION snapshot_plan_features();

    RAISE NOTICE '✅ Trigger attached to subscriptions table';
END $$;

-- =============================================================================
-- Step 4: Backfill Existing Subscriptions (Optional - can skip if large table)
-- =============================================================================
-- Uncomment to backfill existing subscriptions with snapshots
--
-- UPDATE subscriptions s
-- SET plan_features_snapshot = snapshot.features,
--     plan_version = COALESCE(pp.pricing_version, 1)
-- FROM (
--     SELECT
--         pp.plan_slug,
--         pp.product_domain,
--         pp.pricing_version,
--         jsonb_agg(jsonb_build_object(
--             'feature_key', pf.feature_key,
--             'hard_limit', pf.hard_limit,
--             'soft_limit', pf.soft_limit,
--             'is_unlimited', pf.is_unlimited
--         )) AS features
--     FROM pricing_plans pp
--     JOIN plan_features pf ON pf.plan_id = pp.id
--     WHERE pp.is_active = true
--     GROUP BY pp.plan_slug, pp.product_domain, pp.pricing_version
-- ) AS snapshot
-- JOIN pricing_plans pp ON pp.plan_slug = s.plan_name AND pp.product_domain = s.product_domain
-- WHERE s.plan_features_snapshot IS NULL;

-- =============================================================================
-- Verification & Usage
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 045 complete:';
    RAISE NOTICE '   - plan_version column added to subscriptions';
    RAISE NOTICE '   - plan_features_snapshot column added to subscriptions';
    RAISE NOTICE '   - Trigger will snapshot plan on INSERT/UPDATE';
    RAISE NOTICE '';
    RAISE NOTICE 'Customer Protection:';
    RAISE NOTICE '   ✅ Plan changes dont retroactively reduce limits';
    RAISE NOTICE '   ✅ Legal compliance: honor original plan terms';
    RAISE NOTICE '   ✅ Versioned pricing: can offer legacy plans';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '   1. Update FeatureGateEngine._get_plan_feature()';
    RAISE NOTICE '   2. Check subscription.plan_features_snapshot first';
    RAISE NOTICE '   3. Fallback to plan_features table if NULL';
    RAISE NOTICE '';
    RAISE NOTICE 'Example usage in FeatureGateEngine:';
    RAISE NOTICE '   if subscription.get(''plan_features_snapshot''):';
    RAISE NOTICE '       features = json.loads(subscription[''plan_features_snapshot''])';
    RAISE NOTICE '       return next(f for f in features if f[''feature_key''] == feature_key)';
END $$;

-- =============================================================================
-- Performance Notes
-- =============================================================================
-- JSONB snapshot size:
--   - ~30 features × 100 bytes each = ~3KB per subscription
--   - Negligible storage cost
--   - Faster than JOIN to plan_features table
--
-- Trigger overhead:
--   - Only fires on INSERT or plan_name UPDATE
--   - Does NOT fire on status updates, payment updates, etc.
--   - <5ms overhead (acceptable for subscription operations)
-- =============================================================================
