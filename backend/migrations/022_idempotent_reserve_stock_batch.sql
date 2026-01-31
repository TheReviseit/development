-- ============================================
-- SEV-1 FIX: IDEMPOTENT STOCK RESERVATION
-- Migration: 022_idempotent_reserve_stock_batch.sql
-- 
-- This fixes duplicate key violations by using ON CONFLICT DO NOTHING
-- and returning existing reservations when duplicates are detected.
-- ============================================

-- Replace the reserve_stock_batch function with idempotent version
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
    v_existing_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_results JSONB := '[]'::jsonb;
    v_insufficient JSONB := '[]'::jsonb;
    v_all_valid BOOLEAN := true;
    v_reused_count INTEGER := 0;
    v_new_count INTEGER := 0;
BEGIN
    v_expires_at := NOW() + (p_ttl_minutes || ' minutes')::interval;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- PHASE 1: Check for existing active reservations for this session
    -- If found, return them immediately (IDEMPOTENT)
    -- ═══════════════════════════════════════════════════════════════════════
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        -- Check if reservation already exists for this exact SKU + session
        SELECT id INTO v_existing_id
        FROM stock_reservations
        WHERE customer_session_id = p_session_id
          AND product_id = (v_item->>'product_id')::uuid
          AND (variant_id = (v_item->>'variant_id')::uuid OR (variant_id IS NULL AND v_item->>'variant_id' IS NULL))
          AND (size = v_item->>'size' OR (size IS NULL AND v_item->>'size' IS NULL))
          AND status = 'reserved';
        
        IF v_existing_id IS NOT NULL THEN
            -- ♻️ REUSE: Reservation already exists
            v_reused_count := v_reused_count + 1;
            v_results := v_results || jsonb_build_object(
                'reservation_id', v_existing_id,
                'product_id', v_item->>'product_id',
                'quantity', (v_item->>'quantity')::int,
                'reused', true
            );
        END IF;
    END LOOP;
    
    -- If all items already have reservations, return immediately
    IF v_reused_count = jsonb_array_length(p_items) THEN
        RETURN jsonb_build_object(
            'success', true,
            'reservations', v_results,
            'expires_at', v_expires_at,
            'idempotent', true,
            'reused_count', v_reused_count,
            'message', 'Reservations already exist'
        );
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- PHASE 2: Validate stock for NEW items only
    -- ═══════════════════════════════════════════════════════════════════════
    v_results := '[]'::jsonb;  -- Reset results for fresh processing
    
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        -- Check if this item already has a reservation
        SELECT id INTO v_existing_id
        FROM stock_reservations
        WHERE customer_session_id = p_session_id
          AND product_id = (v_item->>'product_id')::uuid
          AND (variant_id = (v_item->>'variant_id')::uuid OR (variant_id IS NULL AND v_item->>'variant_id' IS NULL))
          AND (size = v_item->>'size' OR (size IS NULL AND v_item->>'size' IS NULL))
          AND status = 'reserved';
        
        IF v_existing_id IS NOT NULL THEN
            -- Already reserved, skip validation
            CONTINUE;
        END IF;
        
        -- Validate stock for new reservations only
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
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- PHASE 3: Create reservations with ON CONFLICT DO NOTHING
    -- This is the LAST LINE OF DEFENSE against duplicate inserts
    -- ═══════════════════════════════════════════════════════════════════════
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
        
        -- Insert with ON CONFLICT DO NOTHING (DB-level idempotency)
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
        ON CONFLICT (product_id, variant_id, size, customer_session_id) 
            WHERE status = 'reserved'
        DO NOTHING
        RETURNING id INTO v_reservation_id;
        
        -- Check if INSERT happened or if we hit a conflict
        IF v_reservation_id IS NOT NULL THEN
            -- New reservation created
            v_new_count := v_new_count + 1;
            v_results := v_results || jsonb_build_object(
                'reservation_id', v_reservation_id,
                'product_id', v_item->>'product_id',
                'quantity', (v_item->>'quantity')::int,
                'reused', false
            );
        ELSE
            -- Conflict - reservation already exists, fetch existing
            SELECT id INTO v_existing_id
            FROM stock_reservations
            WHERE customer_session_id = p_session_id
              AND product_id = (v_item->>'product_id')::uuid
              AND (variant_id = (v_item->>'variant_id')::uuid OR (variant_id IS NULL AND v_item->>'variant_id' IS NULL))
              AND (size = v_item->>'size' OR (size IS NULL AND v_item->>'size' IS NULL))
              AND status = 'reserved';
            
            v_reused_count := v_reused_count + 1;
            v_results := v_results || jsonb_build_object(
                'reservation_id', v_existing_id,
                'product_id', v_item->>'product_id',
                'quantity', (v_item->>'quantity')::int,
                'reused', true
            );
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'reservations', v_results,
        'expires_at', v_expires_at,
        'new_count', v_new_count,
        'reused_count', v_reused_count
    );
END;
$$ LANGUAGE plpgsql;

-- Ensure proper grants
GRANT EXECUTE ON FUNCTION reserve_stock_batch TO service_role;

-- Add a comment for future maintainers
COMMENT ON FUNCTION reserve_stock_batch IS 
'Idempotent stock reservation using ON CONFLICT DO NOTHING. 
SEV-1 FIX: Prevents duplicate key violations even under race conditions.
Returns existing reservations when duplicates are detected.';
