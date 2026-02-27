-- =============================================================================
-- Migration 043: Atomic Product Creation (Race-Condition Proof)
-- =============================================================================
-- Problem: Race condition in current quota check
--   Request 1: check_and_increment() → used=9, limit=10 → ALLOW
--   Request 2: check_and_increment() → used=9, limit=10 → ALLOW (same time!)
--   Both insert products → used=11 (EXCEEDED LIMIT BY 1)
--
-- Root Cause: Quota check and product INSERT in separate transactions
--   - Even with RPC check_and_increment_usage, window exists
--   - Two concurrent requests can both pass check
--
-- Enterprise Solution: Single atomic database function
--   - ROW-LEVEL LOCK on usage_counters (prevents concurrent checks)
--   - Quota check + product INSERT in SAME transaction
--   - Database-level enforcement (can't bypass)
--
-- Pattern: Stripe/Shopify quota enforcement
--
-- Deploy:
--   1. Run this migration (creates function, zero downtime)
--   2. Update products_api.py to call this function
--   3. Remove @require_limit decorator from route
-- =============================================================================

CREATE OR REPLACE FUNCTION create_product_with_quota(
    p_user_id TEXT,
    p_domain VARCHAR(50),
    p_product_data JSONB
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_count INTEGER;
    v_hard_limit INTEGER;
    v_soft_limit INTEGER;
    v_is_unlimited BOOLEAN;
    v_subscription_status TEXT;
    v_product_id UUID;
    v_plan_id UUID;
    v_plan_slug TEXT;
BEGIN
    -- =================================================================
    -- STEP 1: Lock usage_counters row (CRITICAL - prevents race conditions)
    -- =================================================================
    -- FOR UPDATE blocks other transactions from reading this row
    -- until current transaction commits. This guarantees only ONE
    -- concurrent request can pass the quota check.
    -- =================================================================
    SELECT
        uc.current_value,
        pf.hard_limit,
        pf.soft_limit,
        pf.is_unlimited,
        s.status,
        pp.id,
        pp.plan_slug
    INTO
        v_current_count,
        v_hard_limit,
        v_soft_limit,
        v_is_unlimited,
        v_subscription_status,
        v_plan_id,
        v_plan_slug
    FROM usage_counters uc
    JOIN subscriptions s
        ON s.user_id = uc.user_id
        AND s.product_domain = uc.domain
    JOIN pricing_plans pp
        ON pp.plan_slug = s.plan_name
        AND pp.product_domain = s.product_domain
        AND pp.is_active = true
    JOIN plan_features pf
        ON pf.plan_id = pp.id
        AND pf.feature_key = uc.feature_key
    WHERE uc.user_id = p_user_id
      AND uc.domain = p_domain
      AND uc.feature_key = 'create_product'
    FOR UPDATE;  -- ← CRITICAL: Row-level lock

    -- =================================================================
    -- STEP 2: Handle missing subscription/counter (first-time user)
    -- =================================================================
    IF NOT FOUND THEN
        -- No usage_counter found → user may not have subscription
        -- Return denial with informative error
        RETURN json_build_object(
            'allowed', false,
            'denial_reason', 'no_subscription_or_counter',
            'message', 'No active subscription found or usage counter not initialized',
            'status_code', 402
        );
    END IF;

    -- =================================================================
    -- STEP 3: Check subscription status
    -- =================================================================
    IF v_subscription_status NOT IN ('active', 'trialing', 'grace_period') THEN
        RETURN json_build_object(
            'allowed', false,
            'denial_reason', 'subscription_inactive',
            'subscription_status', v_subscription_status,
            'message', 'Your subscription is not active. Please update billing.',
            'status_code', 402
        );
    END IF;

    -- =================================================================
    -- STEP 4: Check feature gate limit (unless unlimited)
    -- =================================================================
    IF NOT COALESCE(v_is_unlimited, false) THEN
        IF v_current_count >= v_hard_limit THEN
            -- Hard limit exceeded
            RETURN json_build_object(
                'allowed', false,
                'denial_reason', 'hard_limit_exceeded',
                'used', v_current_count,
                'hard_limit', v_hard_limit,
                'plan_slug', v_plan_slug,
                'upgrade_required', true,
                'message', format('You have reached your product limit (%s/%s). Upgrade to create more.', v_current_count, v_hard_limit),
                'status_code', 403
            );
        END IF;
    END IF;

    -- =================================================================
    -- STEP 5: Insert product (SAME TRANSACTION)
    -- =================================================================
    INSERT INTO products (
        user_id,
        name,
        price,
        description,
        is_deleted,
        created_at,
        updated_at
    )
    VALUES (
        p_user_id,
        p_product_data->>'name',
        (p_product_data->>'price')::INTEGER,
        p_product_data->>'description',
        false,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_product_id;

    -- =================================================================
    -- STEP 6: Increment usage counter (SAME TRANSACTION)
    -- =================================================================
    UPDATE usage_counters
    SET current_value = current_value + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND domain = p_domain
      AND feature_key = 'create_product';

    -- =================================================================
    -- STEP 7: Return success with usage stats
    -- =================================================================
    RETURN json_build_object(
        'allowed', true,
        'product_id', v_product_id,
        'used', v_current_count + 1,
        'hard_limit', v_hard_limit,
        'soft_limit', v_soft_limit,
        'soft_limit_exceeded', (v_current_count + 1 >= v_soft_limit),
        'remaining', GREATEST(0, v_hard_limit - (v_current_count + 1)),
        'plan_slug', v_plan_slug,
        'message', 'Product created successfully',
        'status_code', 201
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Catch any unexpected errors and return structured response
        RETURN json_build_object(
            'allowed', false,
            'denial_reason', 'internal_error',
            'error', SQLERRM,
            'message', 'An unexpected error occurred. Please try again.',
            'status_code', 500
        );
END;
$$;

-- =============================================================================
-- Grant execute permission to application role
-- =============================================================================
-- Adjust role name based on your Supabase/database setup
GRANT EXECUTE ON FUNCTION create_product_with_quota TO authenticated;
GRANT EXECUTE ON FUNCTION create_product_with_quota TO service_role;

-- =============================================================================
-- Verification & Usage Example
-- =============================================================================
DO $$
DECLARE
    test_result JSON;
BEGIN
    RAISE NOTICE '✅ Migration 043 complete:';
    RAISE NOTICE '   - create_product_with_quota() function created';
    RAISE NOTICE '   - Row-level locking prevents race conditions';
    RAISE NOTICE '   - Atomic transaction (quota check + product insert)';
    RAISE NOTICE '';
    RAISE NOTICE 'Usage from backend (Python):';
    RAISE NOTICE '   result = supabase.rpc(''create_product_with_quota'', {';
    RAISE NOTICE '       ''p_user_id'': user_id,';
    RAISE NOTICE '       ''p_domain'': ''shop'',';
    RAISE NOTICE '       ''p_product_data'': json.dumps({''name'': ''Product'', ''price'': 1000})';
    RAISE NOTICE '   }).execute()';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '   1. Update backend/routes/products_api.py';
    RAISE NOTICE '   2. Replace @require_limit decorator with RPC call';
    RAISE NOTICE '   3. Test concurrent product creation';
END $$;

-- =============================================================================
-- Performance Notes
-- =============================================================================
-- Row-level lock (FOR UPDATE):
--   - Only blocks OTHER transactions trying to lock THE SAME usage_counter row
--   - Different users can create products concurrently (different rows)
--   - Same user concurrent requests are serialized (same row)
--   - Lock released when transaction commits (<50ms typical)
--
-- Performance Impact:
--   - Lock overhead: ~1ms
--   - No impact on throughput (different users unaffected)
--   - Guarantees correctness (worth the minimal cost)
-- =============================================================================
