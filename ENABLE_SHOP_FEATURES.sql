-- FINAL FIX: Enable shop features for all users
-- All columns exist, just need to set them to TRUE

UPDATE ai_capabilities
SET 
    order_booking_enabled = TRUE,
    products_enabled = TRUE,
    shop_enabled = TRUE
WHERE user_id IS NOT NULL;

-- Verify the update
SELECT 
    user_id,
    order_booking_enabled,
    products_enabled,
    shop_enabled,
    appointment_booking_enabled
FROM ai_capabilities
LIMIT 5;

-- Expected: All should show TRUE for order_booking_enabled, products_enabled, shop_enabled
