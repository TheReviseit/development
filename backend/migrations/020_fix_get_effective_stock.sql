-- ============================================
-- ENTERPRISE-GRADE INVENTORY MANAGEMENT SYSTEM
-- Migration: 020_comprehensive_inventory_fix.sql
-- Handles ALL 6 product/variant inventory scenarios
-- Run in Supabase SQL Editor
-- ============================================

-- ============================================
-- SCENARIO MATRIX (Amazon/Flipkart Level)
-- ============================================
-- Case 1: No variants, no sizes    → products.stock_quantity
-- Case 2: No variants, has sizes   → products.size_stocks[size]
-- Case 3: Has variants, no sizes   → product_variants.stock_quantity
-- Case 4: Has variants, has sizes  → product_variants.size_stocks[size]
-- ============================================

-- ============================================
-- 1. GET EFFECTIVE STOCK (All 4 Cases)
-- ============================================
CREATE OR REPLACE FUNCTION get_effective_stock(
    p_user_id TEXT,
    p_product_id UUID,
    p_variant_id UUID DEFAULT NULL,
    p_size TEXT DEFAULT NULL
)
RETURNS TABLE(
    raw_stock INTEGER,
    reserved INTEGER,
    effective INTEGER
) AS $$
DECLARE
    v_raw_stock INTEGER := 0;
    v_reserved INTEGER := 0;
BEGIN
    -- CASE 1: Variant + Size → product_variants.size_stocks[size]
    IF p_variant_id IS NOT NULL AND p_size IS NOT NULL THEN
        SELECT COALESCE((pv.size_stocks->>p_size)::int, 0)
        INTO v_raw_stock
        FROM product_variants pv
        WHERE pv.id = p_variant_id 
          AND pv.user_id = p_user_id
          AND (pv.is_deleted = false OR pv.is_deleted IS NULL);
          
    -- CASE 2: Variant only → product_variants.stock_quantity
    ELSIF p_variant_id IS NOT NULL THEN
        SELECT COALESCE(pv.stock_quantity, 0)
        INTO v_raw_stock
        FROM product_variants pv
        WHERE pv.id = p_variant_id 
          AND pv.user_id = p_user_id
          AND (pv.is_deleted = false OR pv.is_deleted IS NULL);
          
    -- CASE 3: Product + Size (no variant) → products.size_stocks[size]
    ELSIF p_size IS NOT NULL THEN
        SELECT COALESCE((p.size_stocks->>p_size)::int, 0)
        INTO v_raw_stock
        FROM products p
        WHERE p.id = p_product_id 
          AND p.user_id = p_user_id
          AND (p.is_deleted = false OR p.is_deleted IS NULL);
          
    -- CASE 4: Product only → products.stock_quantity
    ELSE
        SELECT COALESCE(p.stock_quantity, 0)
        INTO v_raw_stock
        FROM products p
        WHERE p.id = p_product_id 
          AND p.user_id = p_user_id
          AND (p.is_deleted = false OR p.is_deleted IS NULL);
    END IF;
    
    -- Get reserved quantity from active reservations
    SELECT COALESCE(SUM(sr.quantity), 0)
    INTO v_reserved
    FROM stock_reservations sr
    WHERE sr.user_id = p_user_id
      AND sr.product_id = p_product_id
      AND (p_variant_id IS NULL OR sr.variant_id = p_variant_id)
      AND (p_size IS NULL OR sr.size = p_size)
      AND sr.status = 'reserved'
      AND sr.expires_at > NOW();
    
    -- Return effective stock
    raw_stock := COALESCE(v_raw_stock, 0);
    reserved := COALESCE(v_reserved, 0);
    effective := GREATEST(0, raw_stock - reserved);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 2. DEDUCT FROM PRODUCT_VARIANTS.SIZE_STOCKS
-- ============================================
CREATE OR REPLACE FUNCTION deduct_size_stock(
    p_variant_id UUID,
    p_user_id TEXT,
    p_size TEXT,
    p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    -- Atomic read with row lock
    SELECT COALESCE((size_stocks->>p_size)::int, 0)
    INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id AND user_id = p_user_id
    FOR UPDATE SKIP LOCKED;
    
    IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Variant % not found or locked', p_variant_id;
    END IF;
    
    IF v_current_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock: variant=%, size=%, available=%, requested=%', 
            p_variant_id, p_size, v_current_stock, p_quantity;
    END IF;
    
    v_new_stock := v_current_stock - p_quantity;
    
    UPDATE product_variants
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    ),
    updated_at = NOW()
    WHERE id = p_variant_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. DEDUCT FROM PRODUCTS.SIZE_STOCKS (NEW!)
-- For products WITH sizes but WITHOUT variants
-- ============================================
CREATE OR REPLACE FUNCTION deduct_product_size_stock(
    p_product_id UUID,
    p_user_id TEXT,
    p_size TEXT,
    p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    -- Atomic read with row lock
    SELECT COALESCE((size_stocks->>p_size)::int, 0)
    INTO v_current_stock
    FROM products
    WHERE id = p_product_id AND user_id = p_user_id
    FOR UPDATE SKIP LOCKED;
    
    IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Product % not found or locked', p_product_id;
    END IF;
    
    IF v_current_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock: product=%, size=%, available=%, requested=%', 
            p_product_id, p_size, v_current_stock, p_quantity;
    END IF;
    
    v_new_stock := v_current_stock - p_quantity;
    
    UPDATE products
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    ),
    updated_at = NOW()
    WHERE id = p_product_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. RESTORE VARIANT SIZE STOCK (Refunds/Cancels)
-- ============================================
CREATE OR REPLACE FUNCTION restore_size_stock(
    p_variant_id UUID,
    p_user_id TEXT,
    p_size TEXT,
    p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    SELECT COALESCE((size_stocks->>p_size)::int, 0)
    INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id AND user_id = p_user_id
    FOR UPDATE;
    
    v_new_stock := COALESCE(v_current_stock, 0) + p_quantity;
    
    UPDATE product_variants
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    ),
    updated_at = NOW()
    WHERE id = p_variant_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. RESTORE PRODUCT SIZE STOCK (Refunds/Cancels)
-- ============================================
CREATE OR REPLACE FUNCTION restore_product_size_stock(
    p_product_id UUID,
    p_user_id TEXT,
    p_size TEXT,
    p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    SELECT COALESCE((size_stocks->>p_size)::int, 0)
    INTO v_current_stock
    FROM products
    WHERE id = p_product_id AND user_id = p_user_id
    FOR UPDATE;
    
    v_new_stock := COALESCE(v_current_stock, 0) + p_quantity;
    
    UPDATE products
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    ),
    updated_at = NOW()
    WHERE id = p_product_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. CONFIRM RESERVATIONS BATCH (All 4 Cases!)
-- This is the CRITICAL function that deducts stock
-- ============================================
CREATE OR REPLACE FUNCTION confirm_reservations_batch(
    p_reservation_ids UUID[],
    p_order_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_reservation RECORD;
    v_already_processed BOOLEAN;
    v_confirmed_count INTEGER := 0;
BEGIN
    -- Idempotency check
    SELECT EXISTS(
        SELECT 1 FROM inventory_events 
        WHERE idempotency_key = p_idempotency_key
    ) INTO v_already_processed;
    
    IF v_already_processed THEN
        RETURN jsonb_build_object(
            'success', true, 
            'idempotent', true,
            'message', 'Already processed'
        );
    END IF;
    
    -- Process each reservation with row lock
    FOR v_reservation IN 
        SELECT * FROM stock_reservations 
        WHERE id = ANY(p_reservation_ids) 
          AND status = 'reserved'
        FOR UPDATE SKIP LOCKED
    LOOP
        -- CASE 1: Variant + Size → deduct from product_variants.size_stocks
        IF v_reservation.variant_id IS NOT NULL AND v_reservation.size IS NOT NULL THEN
            PERFORM deduct_size_stock(
                v_reservation.variant_id,
                v_reservation.user_id,
                v_reservation.size,
                v_reservation.quantity
            );
            
        -- CASE 2: Variant only → deduct from product_variants.stock_quantity
        ELSIF v_reservation.variant_id IS NOT NULL THEN
            UPDATE product_variants
            SET stock_quantity = GREATEST(0, stock_quantity - v_reservation.quantity),
                updated_at = NOW()
            WHERE id = v_reservation.variant_id 
              AND user_id = v_reservation.user_id;
              
        -- CASE 3: Product + Size (NO VARIANT) → deduct from products.size_stocks
        -- THIS IS THE CRITICAL FIX for products with sizes but no variants!
        ELSIF v_reservation.size IS NOT NULL THEN
            PERFORM deduct_product_size_stock(
                v_reservation.product_id,
                v_reservation.user_id,
                v_reservation.size,
                v_reservation.quantity
            );
            
        -- CASE 4: Product only → deduct from products.stock_quantity
        ELSE
            UPDATE products
            SET stock_quantity = GREATEST(0, stock_quantity - v_reservation.quantity),
                updated_at = NOW()
            WHERE id = v_reservation.product_id
              AND user_id = v_reservation.user_id;
        END IF;
        
        -- Update reservation to confirmed
        UPDATE stock_reservations
        SET status = 'confirmed', 
            order_id = p_order_id, 
            confirmed_at = NOW()
        WHERE id = v_reservation.id;
        
        -- Audit log
        INSERT INTO inventory_audit_log (
            user_id, action, product_id, variant_id, size,
            quantity_change, reservation_id, order_id, source
        ) VALUES (
            v_reservation.user_id, 
            'stock_deducted', 
            v_reservation.product_id, 
            v_reservation.variant_id, 
            v_reservation.size,
            -v_reservation.quantity, 
            v_reservation.id, 
            p_order_id, 
            v_reservation.source
        );
        
        v_confirmed_count := v_confirmed_count + 1;
    END LOOP;
    
    -- Record idempotency event
    IF v_confirmed_count > 0 THEN
        INSERT INTO inventory_events (idempotency_key, action, user_id, quantity)
        VALUES (
            p_idempotency_key, 
            'confirm', 
            (SELECT user_id FROM stock_reservations WHERE id = p_reservation_ids[1]),
            (SELECT SUM(quantity) FROM stock_reservations WHERE id = ANY(p_reservation_ids))
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true, 
        'confirmed_count', v_confirmed_count,
        'order_id', p_order_id
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION get_effective_stock TO service_role;
GRANT EXECUTE ON FUNCTION deduct_size_stock TO service_role;
GRANT EXECUTE ON FUNCTION deduct_product_size_stock TO service_role;
GRANT EXECUTE ON FUNCTION restore_size_stock TO service_role;
GRANT EXECUTE ON FUNCTION restore_product_size_stock TO service_role;
GRANT EXECUTE ON FUNCTION confirm_reservations_batch TO service_role;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Enterprise Inventory System Updated!';
    RAISE NOTICE '   • get_effective_stock: All 4 cases supported';
    RAISE NOTICE '   • deduct_product_size_stock: NEW - for products with sizes, no variants';
    RAISE NOTICE '   • confirm_reservations_batch: Fixed CASE 3 for product size_stocks';
    RAISE NOTICE '   • restore functions: Added for refunds/cancellations';
END $$;
