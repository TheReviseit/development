-- ============================================================================= 
-- Migration: 045_reset_usage_counters.sql
-- Description: Reset usage counters to match actual product counts
-- Issue: Usage counters out of sync with actual products table
-- ============================================================================= 

-- STEP 1: Create a function to re-sync usage counters with actual counts
CREATE OR REPLACE FUNCTION resync_usage_counter_for_user(
    p_firebase_uid TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_supabase_uuid UUID;
    v_actual_count INTEGER;
    v_counter_count INTEGER;
    v_result JSONB;
BEGIN
    -- Get Supabase UUID from Firebase UID
    SELECT id INTO v_supabase_uuid
    FROM users
    WHERE firebase_uid = p_firebase_uid;
    
    IF v_supabase_uuid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found',
            'firebase_uid', p_firebase_uid
        );
    END IF;
    
    -- Count actual products (products.user_id uses Firebase UID)
    SELECT COUNT(*) INTO v_actual_count
    FROM products
    WHERE user_id = p_firebase_uid;
    
    -- Get current counter value (usage_counters.user_id uses Supabase UUID)
    SELECT current_value INTO v_counter_count
    FROM usage_counters
    WHERE user_id = v_supabase_uuid
      AND domain = 'shop'
      AND feature_key = 'create_product';
    
    -- If no counter exists, create it with actual count
    IF v_counter_count IS NULL THEN
        INSERT INTO usage_counters (user_id, domain, feature_key, current_value, period_start, reset_at)
        VALUES (
            v_supabase_uuid, 
            'shop', 
            'create_product', 
            v_actual_count,
            NOW(),
            NOW() + INTERVAL '1 month'
        );
        
        RETURN jsonb_build_object(
            'success', true,
            'action', 'created',
            'firebase_uid', p_firebase_uid,
            'supabase_uuid', v_supabase_uuid,
            'actual_products', v_actual_count,
            'counter_value', v_actual_count
        );
    END IF;
    
    -- Update existing counter to match actual count
    UPDATE usage_counters
    SET current_value = v_actual_count
    WHERE user_id = v_supabase_uuid
      AND domain = 'shop'
      AND feature_key = 'create_product';
    
    RETURN jsonb_build_object(
        'success', true,
        'action', 'updated',
        'firebase_uid', p_firebase_uid,
        'supabase_uuid', v_supabase_uuid,
        'actual_products', v_actual_count,
        'old_counter_value', v_counter_count,
        'new_counter_value', v_actual_count,
        'was_incorrect', v_counter_count != v_actual_count
    );
END;
$$;

-- STEP 2: Resync ALL usage counters for ALL users
-- This is safe to run multiple times (idempotent)
DO $$
DECLARE
    v_user RECORD;
    v_result JSONB;
    v_total_users INTEGER := 0;
    v_synced_users INTEGER := 0;
    v_errors INTEGER := 0;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'RESYNCING ALL PRODUCT USAGE COUNTERS';
    RAISE NOTICE '============================================================';
    
    FOR v_user IN 
        SELECT DISTINCT firebase_uid
        FROM users
        WHERE firebase_uid IS NOT NULL
    LOOP
        v_total_users := v_total_users + 1;
        
        BEGIN
            v_result := resync_usage_counter_for_user(v_user.firebase_uid);
            
            IF (v_result->>'success')::BOOLEAN THEN
                v_synced_users := v_synced_users + 1;
                
                IF (v_result->>'was_incorrect')::BOOLEAN THEN
                    RAISE NOTICE '✅ FIXED: % - Products: %, Old Counter: %, New Counter: %',
                        v_user.firebase_uid,
                        v_result->>'actual_products',
                        v_result->>'old_counter_value',
                        v_result->>'new_counter_value';
                END IF;
            ELSE
                v_errors := v_errors + 1;
                RAISE WARNING '❌ ERROR: % - %', 
                    v_user.firebase_uid, 
                    v_result->>'error';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_errors := v_errors + 1;
                RAISE WARNING '❌ EXCEPTION for %: %', v_user.firebase_uid, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'SYNC COMPLETE';
    RAISE NOTICE 'Total Users: %', v_total_users;
    RAISE NOTICE 'Synced: %', v_synced_users;
    RAISE NOTICE 'Errors: %', v_errors;
    RAISE NOTICE '============================================================';
END;
$$;

-- STEP 3: Create a public RPC function for users to check their own limits
-- This allows frontend to verify counter accuracy
CREATE OR REPLACE FUNCTION get_my_product_usage()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_firebase_uid TEXT;
    v_actual_count INTEGER;
    v_counter_count INTEGER;
    v_hard_limit INTEGER;
BEGIN
    -- Get user_id from auth context
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'Not authenticated'
        );
    END IF;
    
    -- Get Firebase UID
    SELECT firebase_uid INTO v_firebase_uid
    FROM users
    WHERE id = v_user_id;
    
    -- Count actual products
    SELECT COUNT(*) INTO v_actual_count
    FROM products
    WHERE user_id = v_firebase_uid;
    
    -- Get counter value
    SELECT current_value INTO v_counter_count
    FROM usage_counters
    WHERE user_id = v_user_id
      AND domain = 'shop'
      AND feature_key = 'create_product';
    
    -- Get hard limit from subscription
    SELECT pf.hard_limit INTO v_hard_limit
    FROM subscriptions s
    JOIN pricing_plans pp ON s.plan_id = pp.id
    JOIN plan_features pf ON pf.plan_id = pp.id
    WHERE s.user_id = v_user_id
      AND s.status IN ('active', 'completed', 'processing')
      AND pf.feature_key = 'create_product'
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    RETURN jsonb_build_object(
        'actual_products', v_actual_count,
        'counter_value', COALESCE(v_counter_count, 0),
        'hard_limit', v_hard_limit,
        'is_accurate', v_actual_count = COALESCE(v_counter_count, 0),
        'can_create_more', COALESCE(v_counter_count, 0) < COALESCE(v_hard_limit, 10)
    );
END;
$$;
