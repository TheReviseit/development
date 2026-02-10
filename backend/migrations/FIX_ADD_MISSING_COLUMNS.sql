-- CRITICAL FIX: Add missing columns to ai_capabilities table
-- This is the REAL issue - the migration added shop_enabled but not order_booking_enabled/products_enabled

-- First, check what columns currently exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ai_capabilities'
ORDER BY ordinal_position;

-- Add order_booking_enabled if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_capabilities' AND column_name = 'order_booking_enabled'
    ) THEN
        ALTER TABLE ai_capabilities 
        ADD COLUMN order_booking_enabled BOOLEAN DEFAULT FALSE;
        
        RAISE NOTICE 'Added order_booking_enabled column';
    ELSE
        RAISE NOTICE 'order_booking_enabled column already exists';
    END IF;
END $$;

-- Add products_enabled if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_capabilities' AND column_name = 'products_enabled'
    ) THEN
        ALTER TABLE ai_capabilities 
        ADD COLUMN products_enabled BOOLEAN DEFAULT FALSE;
        
        RAISE NOTICE 'Added products_enabled column';
    ELSE
        RAISE NOTICE 'products_enabled column already exists';
    END IF;
END $$;

-- NOW enable them for all users
UPDATE ai_capabilities
SET 
    order_booking_enabled = TRUE,
    products_enabled = TRUE,
    shop_enabled = TRUE  -- Make sure this is also TRUE
WHERE user_id IS NOT NULL;

-- Verify the result
SELECT 
    user_id,
    appointment_booking_enabled,
    order_booking_enabled,
    products_enabled,
    shop_enabled,
    created_at
FROM ai_capabilities
LIMIT 10;

-- Expected output: All users should have:
-- order_booking_enabled = TRUE
-- products_enabled = TRUE
-- shop_enabled = TRUE
