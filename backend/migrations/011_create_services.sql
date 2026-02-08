-- Migration: Create services table for appointment/booking services
-- Created: 2026-02-07
-- Description: Stores business services with pricing, duration, capacity, and payment options

-- Create price_type enum
DO $$ BEGIN
    CREATE TYPE price_type AS ENUM ('fixed', 'variable', 'hourly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create payment_mode enum
DO $$ BEGIN
    CREATE TYPE payment_mode AS ENUM ('online', 'cash', 'both');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create location_type enum
DO $$ BEGIN
    CREATE TYPE service_location_type AS ENUM ('business', 'customer', 'online');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create services table
CREATE TABLE IF NOT EXISTS services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    
    -- Image (Cloudinary)
    image_url TEXT,
    image_public_id TEXT,
    
    -- Pricing
    price_type price_type NOT NULL DEFAULT 'fixed',
    price_amount DECIMAL(10, 2),
    price_range_min DECIMAL(10, 2),
    price_range_max DECIMAL(10, 2),
    
    -- For hourly rate: minimum billable time in minutes (15, 30, 60)
    min_billable_minutes INTEGER DEFAULT 60,
    
    -- Duration (optional - uncheck if duration varies)
    duration_enabled BOOLEAN DEFAULT false,
    duration_minutes INTEGER,
    
    -- Booking capacity per time slot
    max_bookings_per_slot INTEGER DEFAULT 1,
    
    -- Buffer times (in minutes)
    buffer_before INTEGER DEFAULT 0,
    buffer_after INTEGER DEFAULT 0,
    
    -- Service location type
    location_type service_location_type DEFAULT 'business',
    
    -- Category
    category TEXT,
    
    -- Internal tags (for sorting, analytics, marketing)
    tags TEXT[] DEFAULT '{}',
    
    -- Payment acceptance
    payment_mode payment_mode NOT NULL DEFAULT 'both',
    
    -- Status and ordering
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_services_tags ON services USING GIN(tags);

-- Enable RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own services
DROP POLICY IF EXISTS services_user_isolation ON services;
CREATE POLICY services_user_isolation ON services
    FOR ALL
    USING (user_id = current_setting('app.user_id', true))
    WITH CHECK (user_id = current_setting('app.user_id', true));

-- Allow service role full access
DROP POLICY IF EXISTS services_service_role ON services;
CREATE POLICY services_service_role ON services
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_services_updated_at ON services;
CREATE TRIGGER trigger_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_services_updated_at();

-- Comments
COMMENT ON TABLE services IS 'Business services with pricing, duration, capacity, and payment options';
COMMENT ON COLUMN services.price_type IS 'fixed: single price, variable: price range, hourly: per hour rate';
COMMENT ON COLUMN services.min_billable_minutes IS 'For hourly rate: minimum billable time (15, 30, 60 mins)';
COMMENT ON COLUMN services.duration_enabled IS 'Whether service has a fixed duration (uncheck if varies)';
COMMENT ON COLUMN services.max_bookings_per_slot IS 'Maximum simultaneous bookings per time slot (for classes, group sessions)';
COMMENT ON COLUMN services.buffer_before IS 'Preparation time before booking (minutes)';
COMMENT ON COLUMN services.buffer_after IS 'Cleanup/travel time after booking (minutes)';
COMMENT ON COLUMN services.location_type IS 'Where service is delivered: business, customer location, or online';
COMMENT ON COLUMN services.tags IS 'Internal tags for sorting/analytics (popular, premium, new, etc.)';
COMMENT ON COLUMN services.payment_mode IS 'Accepted payment methods: online, cash, or both';
