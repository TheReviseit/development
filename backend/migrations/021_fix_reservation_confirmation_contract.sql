-- ============================================
-- AMAZON-GRADE INVENTORY CONFIRMATION FIX
-- Migration: 021_fix_reservation_confirmation_contract.sql
-- 
-- CORE LAW: Stock is a promise. Once promised (reserved),
-- it MUST be honored — no revalidation, no excuses.
--
-- Run in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. SCHEMA ENHANCEMENTS FOR IMMUTABLE CONTRACTS
-- ============================================

-- Add reserved_snapshot column to store the IMMUTABLE contract
-- This is what confirmation trusts — forever
ALTER TABLE stock_reservations 
ADD COLUMN IF NOT EXISTS reserved_snapshot JSONB;

-- Add effective_stock_at_reserve for quick audits
ALTER TABLE stock_reservations 
ADD COLUMN IF NOT EXISTS effective_stock_at_reserve INTEGER;

-- Add invariant version for future schema migrations
ALTER TABLE stock_reservations 
ADD COLUMN IF NOT EXISTS invariant_version INTEGER DEFAULT 1;

-- Update inventory_events action constraint to include new actions
ALTER TABLE inventory_events 
DROP CONSTRAINT IF EXISTS inventory_events_action_check;

ALTER TABLE inventory_events 
ADD CONSTRAINT inventory_events_action_check 
CHECK (action IN ('reserve', 'confirm', 'release', 'cleanup', 'confirm_atomic', 'anomaly_detected'));

-- ============================================
-- 2. INVENTORY ANOMALIES TABLE (Enterprise Safety Net)
-- Tracks oversells, admin edits, sync drift, etc.
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES stock_reservations(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    
    -- Context
    user_id TEXT NOT NULL,  -- Business owner
    size TEXT,
    
    -- Stock state at anomaly time
    requested INTEGER NOT NULL,
    available INTEGER NOT NULL,
    
    -- Classification
    anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
        'CONFIRM_OVERSOLD',         -- Confirmed with insufficient live stock
        'ADMIN_STOCK_REDUCTION',    -- Admin reduced stock below reservations
        'EXTERNAL_SYNC_DRIFT',      -- External system caused stock mismatch
        'NEGATIVE_STOCK_CLAMPED',   -- Stock would have gone negative
        'ORPHAN_RESERVATION',       -- Reservation without valid order
        'DOUBLE_CONFIRM_BLOCKED',   -- Duplicate confirmation attempt
        'EXPIRED_CONFIRM_ATTEMPT'   -- Attempted to confirm expired reservation
    )),
    
    -- Severity for ops prioritization (nice-to-have #1)
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    
    -- Audit & Resolution workflow (nice-to-have #2)
    metadata JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add severity column if table already exists (for existing deployments)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_anomalies' AND column_name = 'severity'
    ) THEN
        ALTER TABLE inventory_anomalies 
        ADD COLUMN severity TEXT NOT NULL DEFAULT 'warning' 
        CHECK (severity IN ('info', 'warning', 'critical'));
        
        RAISE NOTICE 'Added severity column to existing inventory_anomalies table';
    END IF;
END $$;

-- Indexes for anomaly queries
CREATE INDEX IF NOT EXISTS idx_anomalies_order_id ON inventory_anomalies(order_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON inventory_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved ON inventory_anomalies(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_anomalies_created ON inventory_anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON inventory_anomalies(severity) WHERE resolved = FALSE;

-- ============================================
-- 3. UNCONDITIONAL DEDUCTION FUNCTIONS
-- These NEVER check stock - they trust the reservation
-- ============================================

-- Deduct from product_variants.size_stocks (UNCONDITIONAL)
CREATE OR REPLACE FUNCTION deduct_size_stock_unconditional(
    p_variant_id UUID,
    p_user_id TEXT,
    p_size TEXT,
    p_quantity INTEGER,
    p_reservation_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_anomaly_logged BOOLEAN := FALSE;
BEGIN
    -- Get current stock (no validation, just read)
    SELECT COALESCE((size_stocks->>p_size)::int, 0)
    INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id AND user_id = p_user_id
    FOR UPDATE;  -- Lock row
    
    -- Calculate new stock (clamp to 0)
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
    
    -- LOG ANOMALY if overselling (but DO NOT FAIL)
    IF v_current_stock < p_quantity THEN
        INSERT INTO inventory_anomalies (
            order_id, reservation_id, variant_id, user_id, size,
            requested, available, anomaly_type, severity, metadata
        ) VALUES (
            p_order_id, p_reservation_id, p_variant_id, p_user_id, p_size,
            p_quantity, v_current_stock, 'CONFIRM_OVERSOLD',
            CASE WHEN (p_quantity - v_current_stock) > 5 THEN 'critical' ELSE 'warning' END,
            jsonb_build_object(
                'deficit', p_quantity - v_current_stock,
                'clamped_to', v_new_stock,
                'timestamp', NOW()
            )
        );
        v_anomaly_logged := TRUE;
    END IF;
    
    -- UNCONDITIONAL UPDATE (THE KEY FIX)
    UPDATE product_variants
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    ),
    updated_at = NOW()
    WHERE id = p_variant_id AND user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'anomaly_logged', v_anomaly_logged
    );
END;
$$ LANGUAGE plpgsql;

-- Deduct from products.size_stocks (UNCONDITIONAL)
CREATE OR REPLACE FUNCTION deduct_product_size_stock_unconditional(
    p_product_id UUID,
    p_user_id TEXT,
    p_size TEXT,
    p_quantity INTEGER,
    p_reservation_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_anomaly_logged BOOLEAN := FALSE;
BEGIN
    -- Get current stock
    SELECT COALESCE((size_stocks->>p_size)::int, 0)
    INTO v_current_stock
    FROM products
    WHERE id = p_product_id AND user_id = p_user_id
    FOR UPDATE;
    
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
    
    -- Log anomaly if overselling
    IF v_current_stock < p_quantity THEN
        INSERT INTO inventory_anomalies (
            order_id, reservation_id, product_id, user_id, size,
            requested, available, anomaly_type, severity, metadata
        ) VALUES (
            p_order_id, p_reservation_id, p_product_id, p_user_id, p_size,
            p_quantity, v_current_stock, 'CONFIRM_OVERSOLD',
            CASE WHEN (p_quantity - v_current_stock) > 5 THEN 'critical' ELSE 'warning' END,
            jsonb_build_object(
                'deficit', p_quantity - v_current_stock,
                'clamped_to', v_new_stock,
                'timestamp', NOW()
            )
        );
        v_anomaly_logged := TRUE;
    END IF;
    
    -- UNCONDITIONAL UPDATE
    UPDATE products
    SET size_stocks = jsonb_set(
        COALESCE(size_stocks, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(v_new_stock)
    ),
    updated_at = NOW()
    WHERE id = p_product_id AND user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'anomaly_logged', v_anomaly_logged
    );
END;
$$ LANGUAGE plpgsql;

-- Deduct from product_variants.stock_quantity (UNCONDITIONAL)
CREATE OR REPLACE FUNCTION deduct_variant_stock_unconditional(
    p_variant_id UUID,
    p_user_id TEXT,
    p_quantity INTEGER,
    p_reservation_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_anomaly_logged BOOLEAN := FALSE;
BEGIN
    SELECT COALESCE(stock_quantity, 0)
    INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id AND user_id = p_user_id
    FOR UPDATE;
    
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
    
    IF v_current_stock < p_quantity THEN
        INSERT INTO inventory_anomalies (
            order_id, reservation_id, variant_id, user_id,
            requested, available, anomaly_type, severity, metadata
        ) VALUES (
            p_order_id, p_reservation_id, p_variant_id, p_user_id,
            p_quantity, v_current_stock, 'CONFIRM_OVERSOLD',
            CASE WHEN (p_quantity - v_current_stock) > 5 THEN 'critical' ELSE 'warning' END,
            jsonb_build_object('deficit', p_quantity - v_current_stock)
        );
        v_anomaly_logged := TRUE;
    END IF;
    
    UPDATE product_variants
    SET stock_quantity = v_new_stock,
        updated_at = NOW()
    WHERE id = p_variant_id AND user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'anomaly_logged', v_anomaly_logged
    );
END;
$$ LANGUAGE plpgsql;

-- Deduct from products.stock_quantity (UNCONDITIONAL)
CREATE OR REPLACE FUNCTION deduct_product_stock_unconditional(
    p_product_id UUID,
    p_user_id TEXT,
    p_quantity INTEGER,
    p_reservation_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_anomaly_logged BOOLEAN := FALSE;
BEGIN
    SELECT COALESCE(stock_quantity, 0)
    INTO v_current_stock
    FROM products
    WHERE id = p_product_id AND user_id = p_user_id
    FOR UPDATE;
    
    v_new_stock := GREATEST(0, v_current_stock - p_quantity);
    
    IF v_current_stock < p_quantity THEN
        INSERT INTO inventory_anomalies (
            order_id, reservation_id, product_id, user_id,
            requested, available, anomaly_type, severity, metadata
        ) VALUES (
            p_order_id, p_reservation_id, p_product_id, p_user_id,
            p_quantity, v_current_stock, 'CONFIRM_OVERSOLD',
            CASE WHEN (p_quantity - v_current_stock) > 5 THEN 'critical' ELSE 'warning' END,
            jsonb_build_object('deficit', p_quantity - v_current_stock)
        );
        v_anomaly_logged := TRUE;
    END IF;
    
    UPDATE products
    SET stock_quantity = v_new_stock,
        updated_at = NOW()
    WHERE id = p_product_id AND user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'anomaly_logged', v_anomaly_logged
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. FIXED confirm_reservations_atomic (THE HEART)
-- 
-- GOLDEN RULE: Confirmation must NEVER fail due to stock
-- Only allowed failures:
--   - Reservation expired
--   - Reservation released  
--   - Already confirmed
--   - Order does not exist
-- ============================================

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
    v_anomaly_count INTEGER := 0;
    v_order_user_id TEXT;
    v_deduct_result JSONB;
    v_status_check RECORD;
BEGIN
    -- ========================================
    -- STEP 1: Lock reservations FIRST (prevent race conditions)
    -- ========================================
    PERFORM 1 FROM stock_reservations 
    WHERE id = ANY(p_reservation_ids)
    FOR UPDATE;
    
    -- ========================================
    -- STEP 2: Idempotency check
    -- ========================================
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
    
    -- ========================================
    -- STEP 3: ATOMIC_GUARD - Order must exist
    -- ========================================
    SELECT user_id INTO v_order_user_id
    FROM orders 
    WHERE id = p_order_id;
    
    IF v_order_user_id IS NULL THEN
        -- CRITICAL: This should never happen in production
        -- Log this as a critical alert
        RAISE EXCEPTION 'ATOMIC_GUARD_VIOLATION: Order % does not exist. Stock deduction BLOCKED.', p_order_id
            USING ERRCODE = 'P0002';
    END IF;
    
    -- ========================================
    -- STEP 4: Check if any reservations exist and their states
    -- ========================================
    SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'reserved') AS pending,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS already_confirmed,
        COUNT(*) FILTER (WHERE status = 'expired') AS expired,
        COUNT(*) FILTER (WHERE status = 'released') AS released
    INTO v_status_check
    FROM stock_reservations
    WHERE id = ANY(p_reservation_ids);
    
    -- Handle edge cases with proper error semantics
    IF v_status_check.total = 0 THEN
        RAISE EXCEPTION 'RESERVATION_NOT_FOUND: No reservations found for IDs provided'
            USING ERRCODE = 'P0003';
    END IF;
    
    IF v_status_check.pending = 0 THEN
        IF v_status_check.already_confirmed > 0 THEN
            -- Idempotent: already confirmed
            RETURN jsonb_build_object(
                'success', true, 
                'already_confirmed', true,
                'message', 'Reservations already confirmed'
            );
        ELSIF v_status_check.expired > 0 THEN
            -- Log anomaly and fail
            INSERT INTO inventory_anomalies (
                order_id, user_id, anomaly_type, severity, requested, available, metadata
            ) VALUES (
                p_order_id, v_order_user_id, 'EXPIRED_CONFIRM_ATTEMPT', 'info', 0, 0,
                jsonb_build_object('reservation_ids', p_reservation_ids)
            );
            RAISE EXCEPTION 'RESERVATION_EXPIRED: Reservations have expired'
                USING ERRCODE = 'P0004';
        ELSIF v_status_check.released > 0 THEN
            RAISE EXCEPTION 'RESERVATION_RELEASED: Reservations have been released'
                USING ERRCODE = 'P0005';
        END IF;
    END IF;
    
    -- ========================================
    -- STEP 5: Process each reservation - TRUST THE CONTRACT
    -- NO STOCK VALIDATION - Reservations are the source of truth
    -- ========================================
    FOR v_reservation IN 
        SELECT * FROM stock_reservations 
        WHERE id = ANY(p_reservation_ids) 
          AND status = 'reserved'
        ORDER BY created_at  -- Consistent ordering
    LOOP
        -- CASE 1: Variant + Size → deduct from product_variants.size_stocks
        IF v_reservation.variant_id IS NOT NULL AND v_reservation.size IS NOT NULL THEN
            v_deduct_result := deduct_size_stock_unconditional(
                v_reservation.variant_id,
                v_reservation.user_id,
                v_reservation.size,
                v_reservation.quantity,
                v_reservation.id,
                p_order_id
            );
            
        -- CASE 2: Variant only → deduct from product_variants.stock_quantity
        ELSIF v_reservation.variant_id IS NOT NULL THEN
            v_deduct_result := deduct_variant_stock_unconditional(
                v_reservation.variant_id,
                v_reservation.user_id,
                v_reservation.quantity,
                v_reservation.id,
                p_order_id
            );
            
        -- CASE 3: Product + Size → deduct from products.size_stocks
        ELSIF v_reservation.size IS NOT NULL THEN
            v_deduct_result := deduct_product_size_stock_unconditional(
                v_reservation.product_id,
                v_reservation.user_id,
                v_reservation.size,
                v_reservation.quantity,
                v_reservation.id,
                p_order_id
            );
            
        -- CASE 4: Product only → deduct from products.stock_quantity
        ELSE
            v_deduct_result := deduct_product_stock_unconditional(
                v_reservation.product_id,
                v_reservation.user_id,
                v_reservation.quantity,
                v_reservation.id,
                p_order_id
            );
        END IF;
        
        -- Track anomalies
        IF (v_deduct_result->>'anomaly_logged')::boolean THEN
            v_anomaly_count := v_anomaly_count + 1;
        END IF;
        
        -- ========================================
        -- STEP 5b: Mark reservation as confirmed
        -- ========================================
        UPDATE stock_reservations
        SET status = 'confirmed', 
            order_id = p_order_id, 
            confirmed_at = NOW()
        WHERE id = v_reservation.id;
        
        -- ========================================
        -- STEP 5c: Audit log
        -- ========================================
        INSERT INTO inventory_audit_log (
            user_id, action, product_id, variant_id, size,
            quantity_change, reservation_id, order_id, source,
            stock_before, stock_after, metadata
        ) VALUES (
            v_reservation.user_id, 
            'stock_deducted', 
            v_reservation.product_id, 
            v_reservation.variant_id, 
            v_reservation.size,
            -v_reservation.quantity, 
            v_reservation.id, 
            p_order_id, 
            v_reservation.source,
            (v_deduct_result->>'previous_stock')::int,
            (v_deduct_result->>'new_stock')::int,
            jsonb_build_object('anomaly', v_deduct_result->>'anomaly_logged')
        );
        
        v_confirmed_count := v_confirmed_count + 1;
    END LOOP;
    
    -- ========================================
    -- STEP 6: Record idempotency (LAST, after all operations succeeded)
    -- ========================================
    INSERT INTO inventory_events (idempotency_key, action, user_id, quantity)
    VALUES (
        p_idempotency_key, 
        'confirm_atomic', 
        (SELECT user_id FROM stock_reservations WHERE id = p_reservation_ids[1]),
        (SELECT SUM(quantity) FROM stock_reservations WHERE id = ANY(p_reservation_ids))
    );
    
    -- ========================================
    -- STEP 7: Return success (with anomaly info for monitoring)
    -- ========================================
    RETURN jsonb_build_object(
        'success', true, 
        'confirmed_count', v_confirmed_count,
        'order_id', p_order_id,
        'anomalies_logged', v_anomaly_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise with context for debugging
        RAISE EXCEPTION 'confirm_reservations_atomic failed: % (order_id: %, errcode: %)', 
            SQLERRM, p_order_id, SQLSTATE
            USING ERRCODE = SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. ENHANCED reserve_stock_batch WITH SNAPSHOT
-- ============================================

CREATE OR REPLACE FUNCTION reserve_stock_batch(
    p_user_id TEXT,
    p_session_id TEXT,
    p_source TEXT,
    p_items JSONB,
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
    v_snapshot JSONB;
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
    
    -- Second pass: create reservations with IMMUTABLE SNAPSHOTS
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
        -- Get current stock snapshot
        SELECT raw_stock, reserved, effective 
        INTO v_raw_stock, v_reserved, v_effective
        FROM get_effective_stock(
            p_user_id,
            (v_item->>'product_id')::uuid,
            (v_item->>'variant_id')::uuid,
            v_item->>'size'
        );
        
        -- Build immutable snapshot (THE CONTRACT)
        v_snapshot := jsonb_build_object(
            'product_id', v_item->>'product_id',
            'variant_id', v_item->>'variant_id',
            'size', v_item->>'size',
            'requested', (v_item->>'quantity')::int,
            'raw_stock_at_reserve', v_raw_stock,
            'reserved_at_reserve', v_reserved,
            'effective_at_reserve', v_effective,
            'reserved_at', NOW()
        );
        
        INSERT INTO stock_reservations (
            user_id, customer_session_id, product_id, variant_id, size, color,
            product_name, quantity, available_snapshot, status, source, expires_at,
            reserved_snapshot, effective_stock_at_reserve, invariant_version
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
            v_expires_at,
            v_snapshot,
            v_effective,
            1
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

-- ============================================
-- 6. INTEGRITY CHECK FUNCTION (Background Job)
-- ============================================

CREATE OR REPLACE FUNCTION validate_inventory_consistency()
RETURNS JSONB AS $$
DECLARE
    v_issues JSONB := '[]'::jsonb;
    v_issue RECORD;
BEGIN
    -- Check for confirmed reservations without orders
    FOR v_issue IN
        SELECT sr.id, sr.order_id, sr.product_id
        FROM stock_reservations sr
        LEFT JOIN orders o ON sr.order_id = o.id
        WHERE sr.status = 'confirmed' 
          AND sr.order_id IS NOT NULL 
          AND o.id IS NULL
    LOOP
        v_issues := v_issues || jsonb_build_object(
            'type', 'ORPHAN_CONFIRMED_RESERVATION',
            'reservation_id', v_issue.id,
            'order_id', v_issue.order_id
        );
    END LOOP;
    
    -- Check for negative stock (should never happen with GREATEST(0,...))
    FOR v_issue IN
        SELECT id, stock_quantity 
        FROM products 
        WHERE stock_quantity < 0
    LOOP
        v_issues := v_issues || jsonb_build_object(
            'type', 'NEGATIVE_PRODUCT_STOCK',
            'product_id', v_issue.id,
            'stock', v_issue.stock_quantity
        );
    END LOOP;
    
    FOR v_issue IN
        SELECT id, stock_quantity 
        FROM product_variants 
        WHERE stock_quantity < 0
    LOOP
        v_issues := v_issues || jsonb_build_object(
            'type', 'NEGATIVE_VARIANT_STOCK',
            'variant_id', v_issue.id,
            'stock', v_issue.stock_quantity
        );
    END LOOP;
    
    RETURN jsonb_build_object(
        'timestamp', NOW(),
        'issues_found', jsonb_array_length(v_issues),
        'issues', v_issues
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION deduct_size_stock_unconditional TO service_role;
GRANT EXECUTE ON FUNCTION deduct_product_size_stock_unconditional TO service_role;
GRANT EXECUTE ON FUNCTION deduct_variant_stock_unconditional TO service_role;
GRANT EXECUTE ON FUNCTION deduct_product_stock_unconditional TO service_role;
GRANT EXECUTE ON FUNCTION confirm_reservations_atomic TO service_role;
GRANT EXECUTE ON FUNCTION reserve_stock_batch TO service_role;
GRANT EXECUTE ON FUNCTION validate_inventory_consistency TO service_role;

-- RLS for anomalies table
ALTER TABLE inventory_anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anomalies_deny_all" ON inventory_anomalies;
CREATE POLICY "anomalies_deny_all" ON inventory_anomalies 
    FOR ALL TO anon, authenticated USING (false);

-- ============================================
-- 8. SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ AMAZON-GRADE INVENTORY SYSTEM DEPLOYED';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 CORE INVARIANT ENFORCED:';
    RAISE NOTICE '   Stock is a promise. Once reserved, it MUST be honored.';
    RAISE NOTICE '';
    RAISE NOTICE '📦 CHANGES APPLIED:';
    RAISE NOTICE '   • stock_reservations: Added reserved_snapshot (IMMUTABLE CONTRACT)';
    RAISE NOTICE '   • inventory_anomalies: Created (Enterprise Safety Net)';
    RAISE NOTICE '   • deduct_*_unconditional: NEVER fail on stock check';
    RAISE NOTICE '   • confirm_reservations_atomic: TRUSTS reservations, logs anomalies';
    RAISE NOTICE '   • reserve_stock_batch: Creates immutable snapshot';
    RAISE NOTICE '   • validate_inventory_consistency: Background integrity check';
    RAISE NOTICE '';
    RAISE NOTICE '🏆 GUARANTEE:';
    RAISE NOTICE '   Confirmation NEVER fails due to stock shortage.';
    RAISE NOTICE '   Oversells are logged, not blocked.';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;
