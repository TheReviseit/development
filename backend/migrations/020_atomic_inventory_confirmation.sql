-- ============================================
-- ATOMIC CONFIRMATION RPC - FULLY TRANSACTIONAL
-- Run in Supabase SQL Editor
-- Fixes critical bug: stock deducted without order
-- ============================================
--
-- INVARIANT:
-- Stock MUST NOT be deducted unless a valid order exists.
-- If this invariant is violated, the system is in a corrupt state.
--
-- ============================================

-- DROP old function if exists (optional, for clean deployment)
-- DROP FUNCTION IF EXISTS confirm_reservations_atomic(UUID[], UUID, TEXT);

-- NEW: Truly atomic confirmation with order validation
-- All operations in single transaction: verify → update → deduct → log
CREATE OR REPLACE FUNCTION confirm_reservations_atomic(
    p_reservation_ids UUID[],
    p_order_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_reservation RECORD;
    v_already_processed BOOLEAN;
    v_confirmed_count INTEGER := 0;
    v_order_user_id TEXT;
BEGIN
    -- ========================================
    -- CRITICAL: All operations in single BEGIN/COMMIT block
    -- Any failure → automatic full rollback
    -- ========================================

    -- 1. Check idempotency FIRST
    SELECT EXISTS(
        SELECT 1 FROM inventory_events 
        WHERE idempotency_key = p_idempotency_key
    ) INTO v_already_processed;
    
    IF v_already_processed THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Already processed');
    END IF;
    
    -- 2. CRITICAL: Verify order EXISTS before any stock modification
    SELECT user_id INTO v_order_user_id
    FROM orders 
    WHERE id = p_order_id;
    
    IF v_order_user_id IS NULL THEN
        -- CRITICAL ALERT: This should NEVER happen in normal operation.
        -- If you see this error, there is a serious upstream bug where
        -- confirm_reservation was called with an order_id that doesn't exist.
        -- This MUST trigger an alert in your monitoring system.
        RAISE EXCEPTION 'ATOMIC_GUARD_VIOLATION: Order % does not exist. Stock deduction BLOCKED. Alert required.', p_order_id
            USING ERRCODE = 'P0002';  -- Custom error code for alerting
    END IF;
    
    -- 3. Process each reservation ATOMICALLY
    FOR v_reservation IN 
        SELECT * FROM stock_reservations 
        WHERE id = ANY(p_reservation_ids) AND status = 'reserved'
        FOR UPDATE  -- Lock rows to prevent concurrent modification
    LOOP
        -- 3a. Deduct actual stock based on variant/size configuration
        IF v_reservation.variant_id IS NOT NULL AND v_reservation.size IS NOT NULL THEN
            -- Size-level stock from variant's JSONB
            PERFORM deduct_size_stock(
                v_reservation.variant_id,
                v_reservation.user_id,
                v_reservation.size,
                v_reservation.quantity
            );
        ELSIF v_reservation.variant_id IS NOT NULL THEN
            -- Variant-level stock
            UPDATE product_variants
            SET stock_quantity = stock_quantity - v_reservation.quantity
            WHERE id = v_reservation.variant_id 
              AND user_id = v_reservation.user_id
              AND stock_quantity >= v_reservation.quantity;
              
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Insufficient stock for variant %', v_reservation.variant_id;
            END IF;
        ELSE
            -- Product-level stock
            UPDATE products
            SET stock_quantity = stock_quantity - v_reservation.quantity
            WHERE id = v_reservation.product_id
              AND user_id = v_reservation.user_id
              AND stock_quantity >= v_reservation.quantity;
              
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Insufficient stock for product %', v_reservation.product_id;
            END IF;
        END IF;
        
        -- 3b. Update reservation to confirmed
        UPDATE stock_reservations
        SET status = 'confirmed', 
            order_id = p_order_id, 
            confirmed_at = NOW()
        WHERE id = v_reservation.id;
        
        -- 3c. Log audit trail
        INSERT INTO inventory_audit_log (
            user_id, action, product_id, variant_id, size,
            quantity_change, reservation_id, order_id, source
        ) VALUES (
            v_reservation.user_id, 'stock_deducted', 
            v_reservation.product_id, v_reservation.variant_id, v_reservation.size,
            -v_reservation.quantity, v_reservation.id, p_order_id, v_reservation.source
        );
        
        v_confirmed_count := v_confirmed_count + 1;
    END LOOP;
    
    -- 4. Record idempotency marker (LAST, after all operations succeeded)
    INSERT INTO inventory_events (idempotency_key, action, user_id, quantity)
    VALUES (
        p_idempotency_key, 
        'confirm_atomic', 
        (SELECT user_id FROM stock_reservations WHERE id = p_reservation_ids[1]),
        (SELECT SUM(quantity) FROM stock_reservations WHERE id = ANY(p_reservation_ids))
    );
    
    -- 5. Return success
    RETURN jsonb_build_object(
        'success', true, 
        'confirmed_count', v_confirmed_count,
        'order_id', p_order_id
    );
    
    -- ========================================
    -- If ANY exception above → PostgreSQL auto-rollback
    -- Stock NEVER reduced without order existing
    -- ========================================
    
EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise with context for debugging
        RAISE EXCEPTION 'confirm_reservations_atomic failed: % (order_id: %)', SQLERRM, p_order_id
            USING ERRCODE = SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION confirm_reservations_atomic TO service_role;

-- ============================================
-- SAFETY NET: Repair orphaned confirmations
-- Run periodically to detect and fix any edge cases
-- ============================================
CREATE OR REPLACE FUNCTION repair_orphaned_confirmations()
RETURNS JSONB AS $$
DECLARE
    v_orphan RECORD;
    v_restored_count INTEGER := 0;
BEGIN
    -- Find confirmed reservations where order doesn't exist
    FOR v_orphan IN 
        SELECT sr.* FROM stock_reservations sr
        LEFT JOIN orders o ON sr.order_id = o.id
        WHERE sr.status = 'confirmed' 
          AND sr.order_id IS NOT NULL
          AND o.id IS NULL
        FOR UPDATE
    LOOP
        -- Restore stock
        IF v_orphan.variant_id IS NOT NULL AND v_orphan.size IS NOT NULL THEN
            PERFORM restore_size_stock(
                v_orphan.variant_id,
                v_orphan.user_id,
                v_orphan.size,
                v_orphan.quantity
            );
        ELSIF v_orphan.variant_id IS NOT NULL THEN
            UPDATE product_variants
            SET stock_quantity = stock_quantity + v_orphan.quantity
            WHERE id = v_orphan.variant_id AND user_id = v_orphan.user_id;
        ELSE
            UPDATE products
            SET stock_quantity = stock_quantity + v_orphan.quantity
            WHERE id = v_orphan.product_id AND user_id = v_orphan.user_id;
        END IF;
        
        -- Mark as orphan_restored
        UPDATE stock_reservations
        SET status = 'orphan_restored', 
            release_reason = 'order_not_found',
            released_at = NOW()
        WHERE id = v_orphan.id;
        
        -- Log audit
        INSERT INTO inventory_audit_log (
            user_id, action, product_id, variant_id, size,
            quantity_change, reservation_id, source, metadata
        ) VALUES (
            v_orphan.user_id, 'orphan_stock_restored', 
            v_orphan.product_id, v_orphan.variant_id, v_orphan.size,
            v_orphan.quantity, v_orphan.id, 'safety_net',
            jsonb_build_object('original_order_id', v_orphan.order_id)
        );
        
        v_restored_count := v_restored_count + 1;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'orphans_restored', v_restored_count
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION repair_orphaned_confirmations TO service_role;
