-- Alternative: Enable features for JUST YOUR USER
-- Replace 'YOUR_USER_ID' with your actual user_id from Supabase auth.users table

-- Find your user_id first (Firebase UID)
SELECT id, email FROM auth.users WHERE email = 'rajaraman5262@gmail.com';
-- Copy the 'id' value from the result

-- Then run this (replace YOUR_USER_ID with the id from above):
UPDATE ai_capabilities
SET 
    order_booking_enabled = TRUE,
    products_enabled = TRUE,
    shop_enabled = TRUE
WHERE user_id = 'YOUR_USER_ID';  -- Replace with your actual user_id

-- Verify
SELECT * FROM ai_capabilities WHERE user_id = 'YOUR_USER_ID';
