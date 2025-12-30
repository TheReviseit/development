-- Migration: Create appointments table for AI Appointment Booking System
-- Created: 2025-12-30
-- Note: user_id is TEXT to accommodate Firebase UID format (not UUID)

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  duration INTEGER DEFAULT 60, -- duration in minutes
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  service TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries by user and date
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(date, time);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_appointments_updated_at ON appointments;
CREATE TRIGGER trigger_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_appointments_updated_at();

-- AI capabilities table for feature toggles
CREATE TABLE IF NOT EXISTS ai_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  appointment_booking_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_capabilities_user ON ai_capabilities(user_id);

-- Trigger for ai_capabilities updated_at
DROP TRIGGER IF EXISTS trigger_ai_capabilities_updated_at ON ai_capabilities;
CREATE TRIGGER trigger_ai_capabilities_updated_at
  BEFORE UPDATE ON ai_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION update_appointments_updated_at();

COMMENT ON TABLE appointments IS 'Stores appointment bookings created via AI or manually';
COMMENT ON TABLE ai_capabilities IS 'Feature flags for AI capabilities per user';
