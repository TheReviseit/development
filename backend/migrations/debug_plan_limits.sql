-- Check user's subscription and plan limits
-- Run this in Supabase SQL Editor

-- 1. Check user's active subscription
SELECT 
    s.id as subscription_id,
    s.user_id,
    u.firebase_uid,
    u.email,
    s.plan_id,
    pp.name as plan_name,
    pp.domain,
    s.status,
    s.amount,
    s.created_at
FROM subscriptions s
JOIN users u ON s.user_id = u.id
JOIN pricing_plans pp ON s.plan_id = pp.id
WHERE u.firebase_uid = '00KzWkOlnKern4CqquzBqptHdN72'
  AND s.status IN ('active', 'completed', 'processing')
ORDER BY s.created_at DESC
LIMIT 1;

-- 2. Check plan_features for the starter plan
SELECT 
    pf.feature_key,
    pf.hard_limit,
    pf.soft_limit,
    pf.is_unlimited,
    pp.name as plan_name,
    pp.domain
FROM plan_features pf
JOIN pricing_plans pp ON pf.plan_id = pp.id
WHERE pp.name = 'starter'
  AND pp.domain = 'shop'
  AND pf.feature_key = 'create_product';

-- 3. Check if plan_features even exists for starter/create_product
SELECT 
    pp.id,
    pp.name,
    pp.domain,
    COUNT(pf.id) as feature_count
FROM pricing_plans pp
LEFT JOIN plan_features pf ON pp.id = pf.plan_id
WHERE pp.name = 'starter' AND pp.domain = 'shop'
GROUP BY pp.id, pp.name, pp.domain;

-- 4. Check current usage counter
SELECT 
    uc.current_value,
    uc.domain,
    uc.feature_key,
    u.firebase_uid,
    u.email
FROM usage_counters uc
JOIN users u ON uc.user_id = u.id
WHERE u.firebase_uid = '00KzWkOlnKern4CqquzBqptHdN72'
  AND uc.domain = 'shop'
  AND uc.feature_key = 'create_product';

-- 5. Check actual product count
SELECT 
    COUNT(*) as actual_product_count,
    user_id
FROM products
WHERE user_id = '00KzWkOlnKern4CqquzBqptHdN72'
GROUP BY user_id;
