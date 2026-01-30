-- ============================================
-- ENTERPRISE-GRADE INVENTORY RESERVATION SYSTEM
-- Migration: 018_stock_reservations.sql
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. STOCK RESERVATIONS TABLE
-- Implements Reserve → Confirm → Release pattern
CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,  -- Linked after confirmation
    user_id TEXT NOT NULL,  -- Business owner ID
    customer_session_id TEXT,  -- For WhatsApp/checkout session tracking
    
    -- Product reference
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    size TEXT,  -- Size from size_stocks JSONB
    color TEXT,  -- For reference/logging
    product_name TEXT,  -- Denormalized for quick access
    
    -- Quantity tracking
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    available_snapshot INTEGER NOT NULL,  -- Stock at reservation time (for audits)
    
    -- Status management
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'confirmed', 'released', 'expired')),
    source TEXT NOT NULL DEFAULT 'website'
        CHECK (source IN ('website', 'whatsapp', 'admin', 'api')),
    
    -- TTL management
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    release_reason TEXT  -- 'timeout', 'payment_failed', 'cancelled', 'user_abandoned'
);

-- 2. UNIQUE CONSTRAINT: One active reservation per item per session
-- Prevents double reservations for same item in same checkout
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_reservation
ON stock_reservations (product_id, variant_id, size, customer_session_id)
WHERE status = 'reserved';

-- 3. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_reservations_status 
    ON stock_reservations(status) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS idx_reservations_expires 
    ON stock_reservations(expires_at) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS idx_reservations_user_id 
    ON stock_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_order_id 
    ON stock_reservations(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_session 
    ON stock_reservations(customer_session_id);

-- 4. INVENTORY EVENTS TABLE (Idempotency)
-- Prevents double-processing of reserve/confirm/release operations
CREATE TABLE IF NOT EXISTS inventory_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    idempotency_key TEXT UNIQUE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('reserve', 'confirm', 'release', 'cleanup')),
    reservation_id UUID REFERENCES stock_reservations(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL,
    
    -- Event details
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    size TEXT,
    quantity INTEGER,
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_idempotency 
    ON inventory_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_events_reservation 
    ON inventory_events(reservation_id);

-- 5. INVENTORY AUDIT LOG (Observability)
-- Tracks all stock movements for debugging and analytics
CREATE TABLE IF NOT EXISTS inventory_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- What changed
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    size TEXT,
    
    -- Action details
    action TEXT NOT NULL CHECK (action IN (
        'reservation_created', 'reservation_confirmed', 
        'reservation_released', 'reservation_expired',
        'stock_deducted', 'stock_restored', 'stock_adjusted'
    )),
    
    -- Quantity changes
    quantity_change INTEGER NOT NULL,  -- Negative for deductions
    stock_before INTEGER,
    stock_after INTEGER,
    
    -- References
    reservation_id UUID REFERENCES stock_reservations(id),
    order_id UUID REFERENCES orders(id),
    
    -- Context
    source TEXT,
    correlation_id TEXT,
    metadata JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON inventory_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON inventory_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON inventory_audit_log(action);

-- 6. DB-LEVEL SAFETY: Non-negative stock constraint
-- Last line of defense - prevents bugs from creating negative stock
-- Note: This uses a trigger since CHECK constraints can't query JSONB values easily

CREATE OR REPLACE FUNCTION validate_size_stocks_non_negative()
RETURNS TRIGGER AS $$
DECLARE
    size_key TEXT;
    size_value INTEGER;
BEGIN
    -- Check each size_stocks value is >= 0
    IF NEW.size_stocks IS NOT NULL THEN
        FOR size_key, size_value IN 
            SELECT key, value::int FROM jsonb_each_text(NEW.size_stocks)
        LOOP
            IF size_value < 0 THEN
                RAISE EXCEPTION 'Stock cannot be negative: size % has value %', size_key, size_value;
            END IF;
        END LOOP;
    END IF;
    
    -- Check stock_quantity is >= 0
    IF NEW.stock_quantity < 0 THEN
        RAISE EXCEPTION 'Stock quantity cannot be negative: %', NEW.stock_quantity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_non_negative_stock ON product_variants;
CREATE TRIGGER enforce_non_negative_stock
    BEFORE INSERT OR UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION validate_size_stocks_non_negative();

-- Also for products table
CREATE OR REPLACE FUNCTION validate_product_stock_non_negative()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity < 0 THEN
        RAISE EXCEPTION 'Product stock quantity cannot be negative: %', NEW.stock_quantity;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_non_negative_product_stock ON products;
CREATE TRIGGER enforce_non_negative_product_stock
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION validate_product_stock_non_negative();

-- 7. DERIVED BASE STOCK: Auto-update products.stock_quantity from variants
CREATE OR REPLACE FUNCTION update_product_stock_from_variants()
RETURNS TRIGGER AS $$
DECLARE
    total_stock INTEGER;
BEGIN
    -- Calculate total stock from all variants
    SELECT COALESCE(SUM(
        COALESCE(v.stock_quantity, 0) +
        COALESCE((
            SELECT COALESCE(SUM(value::int), 0) 
            FROM jsonb_each_text(v.size_stocks)
        ), 0)
    ), 0)
    INTO total_stock
    FROM product_variants v
    WHERE v.product_id = COALESCE(NEW.product_id, OLD.product_id)
      AND (v.is_deleted = false OR v.is_deleted IS NULL);
    
    -- Update parent product stock (only if it differs to avoid trigger loops)
    UPDATE products 
    SET stock_quantity = total_stock,
        stock_status = CASE 
            WHEN total_stock = 0 THEN 'out_of_stock'
            WHEN total_stock <= COALESCE(low_stock_threshold, 5) THEN 'low_stock'
            ELSE 'in_stock'
        END
    WHERE id = COALESCE(NEW.product_id, OLD.product_id)
      AND stock_quantity IS DISTINCT FROM total_stock;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_product_stock ON product_variants;
CREATE TRIGGER sync_product_stock
    AFTER INSERT OR UPDATE OF stock_quantity, size_stocks, is_deleted OR DELETE
    ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_product_stock_from_variants();

-- 8. ROW LEVEL SECURITY
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS
CREATE POLICY "reservations_deny_all" ON stock_reservations 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "events_deny_all" ON inventory_events 
    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "audit_deny_all" ON inventory_audit_log 
    FOR ALL TO anon, authenticated USING (false);

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE stock_reservations IS 'Temporary stock holds with Reserve→Confirm→Release pattern';
COMMENT ON TABLE inventory_events IS 'Idempotency store for inventory operations';
COMMENT ON TABLE inventory_audit_log IS 'Complete audit trail of all stock movements';
COMMENT ON COLUMN stock_reservations.available_snapshot IS 'Stock level at time of reservation for audit purposes';
COMMENT ON COLUMN stock_reservations.expires_at IS 'Auto-release reservation after this time';
