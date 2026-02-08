-- Migration: Create staff management system
-- Created: 2026-02-07
-- Description: Staff tables, service assignments, and workload management

-- ============================================================
-- 1. Add staff_selection_mode to store_capabilities
-- ============================================================
ALTER TABLE store_capabilities 
ADD COLUMN IF NOT EXISTS staff_selection_mode TEXT DEFAULT 'auto' 
CHECK (staff_selection_mode IN ('auto', 'optional', 'required'));

COMMENT ON COLUMN store_capabilities.staff_selection_mode IS 
  'auto: system assigns, optional: customer may choose, required: customer must choose';

-- ============================================================
-- 2. Create staff table
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,  -- Business owner (FK to businesses)
    
    -- Basic info
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,  -- Auto-created "Owner/Self" staff
    
    -- Work schedule
    inherit_business_hours BOOLEAN DEFAULT true,
    work_schedule JSONB DEFAULT NULL,  -- Only used if inherit_business_hours = false
    -- Format: {"monday": {"start": "09:00", "end": "18:00", "enabled": true}, ...}
    
    -- Ordering
    display_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(user_id, is_active);

-- ============================================================
-- 3. Create staff-service assignments table
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_service_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    
    -- Optional overrides
    custom_duration_minutes INTEGER,  -- Override service duration for this staff
    
    -- Assignment priority (higher = preferred for auto-assignment)
    priority INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each staff-service pair is unique
    UNIQUE(staff_id, service_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ssa_staff ON staff_service_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_ssa_service ON staff_service_assignments(service_id);

-- ============================================================
-- 4. Enable RLS
-- ============================================================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_service_assignments ENABLE ROW LEVEL SECURITY;

-- Staff: Only accessible by the business owner
DROP POLICY IF EXISTS staff_user_isolation ON staff;
CREATE POLICY staff_user_isolation ON staff
    FOR ALL
    USING (user_id = current_setting('app.user_id', true))
    WITH CHECK (user_id = current_setting('app.user_id', true));

-- Allow service role full access
DROP POLICY IF EXISTS staff_service_role ON staff;
CREATE POLICY staff_service_role ON staff
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Assignments: Accessible via staff ownership
DROP POLICY IF EXISTS ssa_service_role ON staff_service_assignments;
CREATE POLICY ssa_service_role ON staff_service_assignments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- 5. Update trigger for staff
-- ============================================================
CREATE OR REPLACE FUNCTION update_staff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_staff_updated_at ON staff;
CREATE TRIGGER trigger_staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_updated_at();

-- ============================================================
-- 6. Ensure appointments table has staff_id column
-- ============================================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id, starts_at);

-- ============================================================
-- 7. Function to get available slots with staff capacity
-- ============================================================
CREATE OR REPLACE FUNCTION get_available_slots(
    p_user_id TEXT,
    p_service_id UUID,
    p_date DATE,
    p_slot_granularity INTEGER DEFAULT 30
) RETURNS TABLE (
    slot_time TIME,
    available_count INTEGER,
    total_staff INTEGER
) AS $$
DECLARE
    v_service RECORD;
    v_hours RECORD;
    v_slot_start TIME;
    v_slot_end TIME;
    v_total_block INTEGER;
    v_day_name TEXT;
BEGIN
    -- Get service details
    SELECT * INTO v_service FROM services 
    WHERE id = p_service_id AND user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate total block time
    v_total_block := COALESCE(v_service.buffer_before, 0) 
                   + COALESCE(v_service.duration_minutes, 60) 
                   + COALESCE(v_service.buffer_after, 0);
    
    -- Get day name
    v_day_name := lower(to_char(p_date, 'Day'));
    v_day_name := trim(v_day_name);
    
    -- Get business hours for the day
    SELECT 
        (sc.booking_hours->v_day_name->>'start')::TIME as start_time,
        (sc.booking_hours->v_day_name->>'end')::TIME as end_time,
        (sc.booking_hours->v_day_name->>'enabled')::BOOLEAN as enabled
    INTO v_hours
    FROM store_capabilities sc
    WHERE sc.user_id = p_user_id;
    
    IF NOT FOUND OR NOT v_hours.enabled THEN
        RETURN;
    END IF;
    
    -- Generate slots
    v_slot_start := v_hours.start_time;
    
    WHILE v_slot_start + (v_total_block * INTERVAL '1 minute') <= v_hours.end_time LOOP
        v_slot_end := v_slot_start + (v_total_block * INTERVAL '1 minute');
        
        -- Count available staff for this slot
        SELECT 
            COUNT(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.staff_id = s.id
                AND a.user_id = p_user_id
                AND DATE(a.starts_at) = p_date
                AND a.status NOT IN ('cancelled')
                AND tstzrange(a.starts_at, a.ends_at) && 
                    tstzrange(
                        p_date + v_slot_start,
                        p_date + v_slot_end
                    )
            ))::INTEGER as available,
            COUNT(*)::INTEGER as total
        INTO available_count, total_staff
        FROM staff s
        JOIN staff_service_assignments ssa ON ssa.staff_id = s.id
        WHERE s.user_id = p_user_id
        AND s.is_active = true
        AND ssa.service_id = p_service_id;
        
        slot_time := v_slot_start;
        RETURN NEXT;
        
        v_slot_start := v_slot_start + (p_slot_granularity * INTERVAL '1 minute');
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. Comments
-- ============================================================
COMMENT ON TABLE staff IS 'Staff members who can perform services';
COMMENT ON COLUMN staff.is_default IS 'Auto-created default staff for solo businesses';
COMMENT ON COLUMN staff.inherit_business_hours IS 'If true, uses business hours; if false, uses work_schedule';
COMMENT ON TABLE staff_service_assignments IS 'Which staff can perform which services';
COMMENT ON COLUMN staff_service_assignments.priority IS 'Higher priority = preferred for auto-assignment';
