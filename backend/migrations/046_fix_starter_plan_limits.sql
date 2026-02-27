-- Fix: Insert plan_features for starter plan if missing
-- This ensures the starter plan has proper product limits

-- First, get the starter plan ID
DO $$
DECLARE
    v_starter_plan_id UUID;
BEGIN
    -- Get starter plan ID for shop domain (using correct column names!)
    SELECT id INTO v_starter_plan_id
    FROM pricing_plans
    WHERE plan_slug = 'starter' AND product_domain = 'shop'
      AND is_active = true
      AND effective_to IS NULL
    LIMIT 1;
    
    IF v_starter_plan_id IS NULL THEN
        RAISE EXCEPTION 'Starter plan not found for shop domain';
    END IF;
    
    RAISE NOTICE 'Starter Plan ID: %', v_starter_plan_id;
    
    -- Insert create_product feature limit for starter plan
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
    VALUES (
        v_starter_plan_id,
        'create_product',
        10,  -- Hard limit: 10 products
        8,   -- Soft limit: warn at 8 products
        false
    )
    ON CONFLICT (plan_id, feature_key) 
    DO UPDATE SET
        hard_limit = 10,
        soft_limit = 8,
        is_unlimited = false;
    
    RAISE NOTICE '✅ plan_features updated for starter/create_product: hard_limit=10';
    
    -- Also add products feature (boolean, for catalog enabled/disabled)
    INSERT INTO plan_features (plan_id, feature_key, hard_limit, soft_limit, is_unlimited)
    VALUES (
        v_starter_plan_id,
        'products',
        NULL,  -- NULL = boolean feature (just enabled/disabled)
        NULL,
        false
    )
    ON CONFLICT (plan_id, feature_key) 
    DO NOTHING;
    
    RAISE NOTICE '✅ plan_features updated for starter/products (catalog access)';
END $$;

-- Verify the fix
SELECT 
    pp.display_name as plan_name,
    pp.product_domain,
    pp.plan_slug,
    pf.feature_key,
    pf.hard_limit,
    pf.soft_limit,
    pf.is_unlimited
FROM plan_features pf
JOIN pricing_plans pp ON pf.plan_id = pp.id
WHERE pp.plan_slug = 'starter' 
  AND pp.product_domain = 'shop'
  AND pf.feature_key IN ('create_product', 'products')
ORDER BY pf.feature_key;
