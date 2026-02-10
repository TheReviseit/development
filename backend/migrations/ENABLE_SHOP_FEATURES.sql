-- Quick Fix: Enable Shop Features for All Users
-- Run this in Supabase SQL Editor to enable order booking and products catalog

-- Enable order booking and products for all users
UPDATE ai_capabilities
SET 
    order_booking_enabled = TRUE,
    products_enabled = TRUE
WHERE user_id IS NOT NULL;

-- Verify the changes
SELECT 
    user_id,
    shop_enabled,
    order_booking_enabled,
    products_enabled,
    appointment_booking_enabled
FROM ai_capabilities
LIMIT 10;

-- Expected result: All users should have:
-- shop_enabled = TRUE
-- order_booking_enabled = TRUE  
-- products_enabled = TRUE
