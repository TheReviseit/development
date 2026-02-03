-- =============================================================================
-- Revenue Analytics Migration
-- Adds total_amount column for revenue calculations and analytics indexes
-- =============================================================================

-- 1. Add total_amount column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) DEFAULT 0;

-- 2. Backfill total_amount for existing orders from items JSONB
-- Each item has price and quantity fields
UPDATE orders 
SET total_amount = COALESCE(
    (SELECT SUM(
        COALESCE((item->>'price')::decimal, 0) * 
        COALESCE((item->>'quantity')::int, 1)
    )
    FROM jsonb_array_elements(items::jsonb) AS item
    ),
    0
)
WHERE total_amount = 0 OR total_amount IS NULL;

-- 3. Create trigger to auto-calculate total_amount on insert/update
CREATE OR REPLACE FUNCTION calculate_order_total_amount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_amount := COALESCE(
        (SELECT SUM(
            COALESCE((item->>'price')::decimal, 0) * 
            COALESCE((item->>'quantity')::int, 1)
        )
        FROM jsonb_array_elements(NEW.items::jsonb) AS item
        ),
        0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_order_total ON orders;
CREATE TRIGGER trigger_calculate_order_total
BEFORE INSERT OR UPDATE OF items ON orders
FOR EACH ROW
EXECUTE FUNCTION calculate_order_total_amount();

-- 4. Composite index for revenue analytics queries (user + date + status)
CREATE INDEX IF NOT EXISTS idx_orders_revenue_analytics 
ON orders(user_id, created_at DESC, status) 
WHERE status IN ('completed', 'confirmed', 'processing');

-- 5. Index for date-based aggregation queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at_revenue
ON orders(created_at)
WHERE total_amount > 0;

-- 6. Add currency column if not exists (for multi-currency support)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON COLUMN orders.total_amount IS 'Total order amount calculated from items. Used for revenue analytics.';
COMMENT ON COLUMN orders.currency IS 'Currency code for the order (e.g., INR, USD). Default: INR';
COMMENT ON FUNCTION calculate_order_total_amount() IS 'Trigger function to auto-calculate total_amount from items JSONB';

-- =============================================================================
-- Verification Queries (run manually after migration)
-- =============================================================================
-- Verify backfill worked:
-- SELECT COUNT(*) AS total_orders, COUNT(CASE WHEN total_amount > 0 THEN 1 END) AS with_amount FROM orders;

-- Sample revenue check:
-- SELECT id, customer_name, total_amount, items FROM orders WHERE total_amount > 0 LIMIT 5;
