-- ============================================================
-- Migration: Add order_id column to orders table
-- ============================================================
-- This adds a short, human-readable order ID (e.g., "28C2CF22")
-- Generated from the first 8 characters of the UUID, uppercase
-- ============================================================

-- Step 1: Add the order_id column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Step 2: Populate existing orders with generated order_id from id
UPDATE orders 
SET order_id = UPPER(LEFT(id::text, 8))
WHERE order_id IS NULL;

-- Step 3: Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);

-- Step 4: Optional - Add unique constraint if desired
-- ALTER TABLE orders ADD CONSTRAINT unique_order_id UNIQUE (order_id);

-- ============================================================
-- VERIFICATION: Run after migration
-- ============================================================
-- SELECT id, order_id, customer_name FROM orders LIMIT 10;
