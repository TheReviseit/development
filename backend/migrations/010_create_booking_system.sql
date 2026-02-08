-- Migration: Add booking system infrastructure
-- This migration adds:
-- 1. store_slug and booking_slug to businesses table
-- 2. store_capabilities table (replaces ai_capabilities for booking config)
-- 3. Enhancements to appointments table
-- 4. reminders table for scheduled notifications
-- 5. notification_tokens table for FCM push tokens
-- 6. reminder_deliveries table for idempotency tracking
-- 7. slug_redirects table for URL stability

-- ============================================================
-- 1. Enhance businesses table with slugs
-- ============================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS store_slug TEXT UNIQUE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';

-- Function to generate slugs from business name
CREATE OR REPLACE FUNCTION generate_business_slugs()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.store_slug IS NULL AND NEW.business_name IS NOT NULL THEN
        NEW.store_slug := lower(regexp_replace(NEW.business_name, '[^a-zA-Z0-9]+', '-', 'g'))
                          || '-' || substr(md5(random()::text), 1, 6);
    END IF;
    -- booking_slug defaults to same as store_slug, or can be customized
    IF NEW.booking_slug IS NULL THEN
        NEW.booking_slug := NEW.store_slug;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists to avoid duplicates)
DROP TRIGGER IF EXISTS trigger_generate_business_slugs ON businesses;
CREATE TRIGGER trigger_generate_business_slugs
BEFORE INSERT ON businesses
FOR EACH ROW EXECUTE FUNCTION generate_business_slugs();

-- ============================================================
-- 2. Create store_capabilities table
-- ============================================================
CREATE TABLE IF NOT EXISTS store_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT UNIQUE NOT NULL,
    
    -- Feature Flags
    shop_enabled BOOLEAN DEFAULT true,
    orders_enabled BOOLEAN DEFAULT true,
    bookings_enabled BOOLEAN DEFAULT false,
    
    -- Booking Configuration
    booking_services JSONB DEFAULT '[]',
    booking_hours JSONB DEFAULT '{
        "monday": {"start": "09:00", "end": "18:00", "enabled": true},
        "tuesday": {"start": "09:00", "end": "18:00", "enabled": true},
        "wednesday": {"start": "09:00", "end": "18:00", "enabled": true},
        "thursday": {"start": "09:00", "end": "18:00", "enabled": true},
        "friday": {"start": "09:00", "end": "18:00", "enabled": true},
        "saturday": {"start": "09:00", "end": "14:00", "enabled": true},
        "sunday": {"start": null, "end": null, "enabled": false}
    }',
    booking_slot_duration INTEGER DEFAULT 60,
    booking_buffer_minutes INTEGER DEFAULT 0,
    booking_advance_days INTEGER DEFAULT 30,
    booking_fields JSONB DEFAULT '[]',
    booking_reminder_times JSONB DEFAULT '[1440, 120, 30]',  -- Minutes before: 24h, 2h, 30m
    booking_reminder_channels JSONB DEFAULT '["push", "whatsapp"]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate data from ai_capabilities if it exists
INSERT INTO store_capabilities (user_id, bookings_enabled, booking_services, booking_hours, booking_fields)
SELECT 
    user_id,
    COALESCE(appointment_booking_enabled, false),
    COALESCE(appointment_services, '[]'::jsonb),
    COALESCE(appointment_business_hours, '{}'::jsonb),
    COALESCE(appointment_fields, '[]'::jsonb)
FROM ai_capabilities
WHERE NOT EXISTS (SELECT 1 FROM store_capabilities sc WHERE sc.user_id = ai_capabilities.user_id);

-- ============================================================
-- 3. Enhance appointments table
-- ============================================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_id TEXT UNIQUE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_price DECIMAL(10, 2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_preferences JSONB DEFAULT '{"channels": ["push", "whatsapp"], "times": [1440, 120, 30]}';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fingerprint TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token TEXT;

-- Function to generate human-readable booking ID
CREATE OR REPLACE FUNCTION generate_booking_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.booking_id IS NULL THEN
        NEW.booking_id := 'FLX-' || upper(substr(md5(NEW.id::text || random()::text), 1, 6));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_booking_id ON appointments;
CREATE TRIGGER trigger_generate_booking_id
BEFORE INSERT ON appointments
FOR EACH ROW EXECUTE FUNCTION generate_booking_id();

-- Indexes for time-based queries
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_fingerprint ON appointments(fingerprint);

-- ============================================================
-- 4. Create reminders table
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    
    scheduled_for TIMESTAMPTZ NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('push', 'calendar', 'whatsapp', 'email', 'sms')),
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'delivered', 'failed', 'cancelled')),
    
    -- Delivery tracking
    external_task_id TEXT,
    delivered_at TIMESTAMPTZ,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Idempotency
    idempotency_key TEXT UNIQUE NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_reminders_appointment ON reminders(appointment_id);

-- ============================================================
-- 5. Create notification_tokens table
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Owner (one of these should be set)
    user_id TEXT,
    customer_phone TEXT,
    
    -- Token details
    platform TEXT CHECK (platform IN ('android', 'ios', 'web')),
    token TEXT NOT NULL,
    token_hash TEXT UNIQUE,
    device_id TEXT,
    
    -- State
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    
    CONSTRAINT owner_required CHECK (user_id IS NOT NULL OR customer_phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tokens_user ON notification_tokens(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tokens_phone ON notification_tokens(customer_phone) WHERE customer_phone IS NOT NULL;

-- ============================================================
-- 6. Create reminder_deliveries table (idempotency log)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    reminder_id UUID REFERENCES reminders(id),
    
    channel TEXT NOT NULL,
    status TEXT CHECK (status IN ('success', 'failed')),
    
    -- Response details
    external_message_id TEXT,
    error_code TEXT,
    error_message TEXT,
    
    delivered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. Create slug_redirects table
-- ============================================================
CREATE TABLE IF NOT EXISTS slug_redirects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    old_slug TEXT NOT NULL,
    new_slug TEXT NOT NULL,
    slug_type TEXT CHECK (slug_type IN ('store', 'booking')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(old_slug, slug_type)
);

CREATE INDEX IF NOT EXISTS idx_slug_redirects_lookup ON slug_redirects(old_slug, slug_type);

-- ============================================================
-- 8. Create booking slot reservation function
-- ============================================================
CREATE OR REPLACE FUNCTION reserve_booking_slot(
    p_user_id TEXT,
    p_provider_id UUID,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_idempotency_key TEXT
) RETURNS UUID AS $$
DECLARE
    v_booking_id UUID;
    v_lock_key BIGINT;
BEGIN
    -- Generate lock key from provider + time window
    v_lock_key := hashtext(COALESCE(p_provider_id::TEXT, p_user_id) || p_starts_at::TEXT);
    
    -- Acquire advisory lock (fails fast if already taken)
    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE EXCEPTION 'Slot temporarily locked - please retry';
    END IF;
    
    -- Check for overlapping bookings
    IF EXISTS (
        SELECT 1 FROM appointments
        WHERE user_id = p_user_id
        AND (provider_id = p_provider_id OR p_provider_id IS NULL)
        AND status NOT IN ('cancelled')
        AND tstzrange(starts_at, ends_at) && tstzrange(p_starts_at, p_ends_at)
    ) THEN
        RAISE EXCEPTION 'Time slot not available';
    END IF;
    
    -- Insert booking
    INSERT INTO appointments (
        user_id, provider_id, starts_at, ends_at, idempotency_key, status
    ) VALUES (
        p_user_id, p_provider_id, p_starts_at, p_ends_at, p_idempotency_key, 'confirmed'
    ) RETURNING id INTO v_booking_id;
    
    RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. Enable RLS policies
-- ============================================================
ALTER TABLE store_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE slug_redirects ENABLE ROW LEVEL SECURITY;

-- Store capabilities: users can only see their own
CREATE POLICY store_capabilities_user_policy ON store_capabilities
    FOR ALL USING (auth.uid()::text = user_id);

-- Allow service role full access
CREATE POLICY store_capabilities_service_policy ON store_capabilities
    FOR ALL USING (auth.role() = 'service_role');

-- Reminders: accessible via appointment ownership
CREATE POLICY reminders_service_policy ON reminders
    FOR ALL USING (auth.role() = 'service_role');

-- Notification tokens: users see their own, service role sees all
CREATE POLICY notification_tokens_service_policy ON notification_tokens
    FOR ALL USING (auth.role() = 'service_role');

-- Slug redirects: public read, service write
CREATE POLICY slug_redirects_read_policy ON slug_redirects
    FOR SELECT USING (true);

CREATE POLICY slug_redirects_write_policy ON slug_redirects
    FOR ALL USING (auth.role() = 'service_role');
