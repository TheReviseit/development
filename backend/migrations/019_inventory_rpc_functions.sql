-- ============================================
-- RPC FUNCTIONS FOR ATOMIC STOCK OPERATIONS
-- Run in Supabase SQL Editor after 018_stock_reservations.sql
-- ============================================

-- 1. DEDUCT SIZE STOCK (ATOMIC WITH SKIP LOCKED)
-- Used by inventory_repository for atomic JSONB updates
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
    -- Get current stock with row lock (SKIP LOCKED prevents deadlocks)
    SELECT (size_stocks->>p_size)::int
    INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id AND user_id = p_user_id
    FOR UPDATE SKIP LOCKED;
    
    -- Check if we got the lock
    IF v_current_stock IS NULL THEN
        RETURN FALSE;  -- Either doesn't exist or locked by another transaction
    END IF;
    
    -- Check sufficient stock
    IF v_current_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock: available=%, requested=%', v_current_stock, p_quantity;
    END IF;
    
    -- Calculate new stock
    v_new_stock := v_current_stock - p_quantity;
    
    -- Update atomically
    UPDATE product_variants
    SET size_stocks = jsonb_set(
        size_stocks,
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    )
    WHERE id = p_variant_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 2. RESTORE SIZE STOCK (For cancellations/refunds)
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
    -- Get current stock with row lock
    SELECT (size_stocks->>p_size)::int
    INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id AND user_id = p_user_id
    FOR UPDATE;
    
    IF v_current_stock IS NULL THEN
        v_current_stock := 0;
    END IF;
    
    v_new_stock := v_current_stock + p_quantity;
    
    UPDATE product_variants
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    )
    WHERE id = p_variant_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 3. GET EFFECTIVE AVAILABLE STOCK (Stock minus pending reservations)
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
    v_raw_stock INTEGER;
    v_reserved INTEGER;
BEGIN
    -- Get raw stock
    IF p_variant_id IS NOT NULL AND p_size IS NOT NULL THEN
        SELECT COALESCE((size_stocks->>p_size)::int, 0)
        INTO v_raw_stock
        FROM product_variants
        WHERE id = p_variant_id AND user_id = p_user_id;
    ELSIF p_variant_id IS NOT NULL THEN
        SELECT COALESCE(stock_quantity, 0)
        INTO v_raw_stock
        FROM product_variants
        WHERE id = p_variant_id AND user_id = p_user_id;
    ELSE
        SELECT COALESCE(stock_quantity, 0)
        INTO v_raw_stock
        FROM products
        WHERE id = p_product_id AND user_id = p_user_id;
    END IF;
    
    -- Get reserved quantity
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_reserved
    FROM stock_reservations
    WHERE user_id = p_user_id
      AND product_id = p_product_id
      AND (p_variant_id IS NULL OR variant_id = p_variant_id)
      AND (p_size IS NULL OR size = p_size)
      AND status = 'reserved';
    
    -- Return
    raw_stock := COALESCE(v_raw_stock, 0);
    reserved := v_reserved;
    effective := GREATEST(0, COALESCE(v_raw_stock, 0) - v_reserved);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 4. VALIDATE AND RESERVE BATCH (Single-query reservation for multiple items)
CREATE OR REPLACE FUNCTION reserve_stock_batch(
    p_user_id TEXT,
    p_session_id TEXT,
    p_source TEXT,
    p_items JSONB,  -- Array of {product_id, variant_id, size, quantity, name, color}
    p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_raw_stock INTEGER;
    v_reserved INTEGER;
    v_effective INTEGER;
    v_reservation_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_results JSONB := '[]'::jsonb;
    v_insufficient JSONB := '[]'::jsonb;
    v_all_valid BOOLEAN := true;
BEGIN
    v_expires_at := NOW() + (p_ttl_minutes || ' minutes')::interval;
    
    -- First pass: validate all items
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        SELECT raw_stock, reserved, effective
        INTO v_raw_stock, v_reserved, v_effective
        FROM get_effective_stock(
            p_user_id,
            (v_item->>'product_id')::uuid,
            (v_item->>'variant_id')::uuid,
            v_item->>'size'
        );
        
        IF v_effective < (v_item->>'quantity')::int THEN
            v_all_valid := false;
            v_insufficient := v_insufficient || jsonb_build_object(
                'product_id', v_item->>'product_id',
                'variant_id', v_item->>'variant_id', 
                'size', v_item->>'size',
                'name', v_item->>'name',
                'color', v_item->>'color',
                'requested', (v_item->>'quantity')::int,
                'available', v_effective
            );
        END IF;
    END LOOP;
    
    -- If any item insufficient, return error
    IF NOT v_all_valid THEN
        RETURN jsonb_build_object(
            'success', false,
            'insufficient_items', v_insufficient
        );
    END IF;
    
    -- Second pass: create reservations
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        -- Get current stock snapshot
        SELECT effective INTO v_effective
        FROM get_effective_stock(
            p_user_id,
            (v_item->>'product_id')::uuid,
            (v_item->>'variant_id')::uuid,
            v_item->>'size'
        );
        
        INSERT INTO stock_reservations (
            user_id, customer_session_id, product_id, variant_id, size, color,
            product_name, quantity, available_snapshot, status, source, expires_at
        ) VALUES (
            p_user_id, p_session_id, 
            (v_item->>'product_id')::uuid,
            (v_item->>'variant_id')::uuid,
            v_item->>'size',
            v_item->>'color',
            v_item->>'name',
            (v_item->>'quantity')::int,
            v_effective,
            'reserved',
            p_source,
            v_expires_at
        )
        RETURNING id INTO v_reservation_id;
        
        v_results := v_results || jsonb_build_object(
            'reservation_id', v_reservation_id,
            'product_id', v_item->>'product_id',
            'quantity', (v_item->>'quantity')::int
        );
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'reservations', v_results,
        'expires_at', v_expires_at
    );
END;
$$ LANGUAGE plpgsql;

-- 5. CONFIRM RESERVATION BATCH
CREATE OR REPLACE FUNCTION confirm_reservations_batch(
    p_reservation_ids UUID[],
    p_order_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_reservation RECORD;
    v_already_processed BOOLEAN;
BEGIN
    -- Check idempotency
    SELECT EXISTS(
        SELECT 1 FROM inventory_events 
        WHERE idempotency_key = p_idempotency_key
    ) INTO v_already_processed;
    
    IF v_already_processed THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true);
    END IF;
    
    -- Process each reservation
    FOR v_reservation IN 
        SELECT * FROM stock_reservations 
        WHERE id = ANY(p_reservation_ids) AND status = 'reserved'
        FOR UPDATE
    LOOP
        -- Deduct actual stock
        IF v_reservation.variant_id IS NOT NULL AND v_reservation.size IS NOT NULL THEN
            PERFORM deduct_size_stock(
                v_reservation.variant_id,
                v_reservation.user_id,
                v_reservation.size,
                v_reservation.quantity
            );
        ELSIF v_reservation.variant_id IS NOT NULL THEN
            UPDATE product_variants
            SET stock_quantity = stock_quantity - v_reservation.quantity
            WHERE id = v_reservation.variant_id 
              AND user_id = v_reservation.user_id
              AND stock_quantity >= v_reservation.quantity;
        ELSE
            UPDATE products
            SET stock_quantity = stock_quantity - v_reservation.quantity
            WHERE id = v_reservation.product_id
              AND user_id = v_reservation.user_id
              AND stock_quantity >= v_reservation.quantity;
        END IF;
        
        -- Update reservation
        UPDATE stock_reservations
        SET status = 'confirmed', 
            order_id = p_order_id, 
            confirmed_at = NOW()
        WHERE id = v_reservation.id;
        
        -- Log audit
        INSERT INTO inventory_audit_log (
            user_id, action, product_id, variant_id, size,
            quantity_change, reservation_id, order_id, source
        ) VALUES (
            v_reservation.user_id, 'stock_deducted', 
            v_reservation.product_id, v_reservation.variant_id, v_reservation.size,
            -v_reservation.quantity, v_reservation.id, p_order_id, v_reservation.source
        );
    END LOOP;
    
    -- Record idempotency
    INSERT INTO inventory_events (idempotency_key, action, user_id, quantity)
    VALUES (p_idempotency_key, 'confirm', 
            (SELECT user_id FROM stock_reservations WHERE id = p_reservation_ids[1]),
            (SELECT SUM(quantity) FROM stock_reservations WHERE id = ANY(p_reservation_ids)));
    
    RETURN jsonb_build_object('success', true, 'confirmed_count', array_length(p_reservation_ids, 1));
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION deduct_size_stock TO service_role;
GRANT EXECUTE ON FUNCTION restore_size_stock TO service_role;
GRANT EXECUTE ON FUNCTION get_effective_stock TO service_role;
GRANT EXECUTE ON FUNCTION reserve_stock_batch TO service_role;
GRANT EXECUTE ON FUNCTION confirm_reservations_batch TO service_role;
