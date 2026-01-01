-- Migration: Add appointment services configuration
-- Created: 2026-01-01
-- Description: Adds services configuration with duration and capacity per slot

-- Add JSONB column for appointment services configuration
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS appointment_services JSONB DEFAULT '[
  {"id": "default", "name": "General Appointment", "duration": 60, "capacity": 1}
]';

-- Add service column to appointments if not exists (for tracking which service was booked)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS service TEXT;

-- Update existing appointments with a default service if null
UPDATE appointments SET service = 'General Appointment' WHERE service IS NULL OR service = '';

COMMENT ON COLUMN ai_capabilities.appointment_services IS 'JSON array of service configurations with name, duration (minutes), and capacity per slot';
COMMENT ON COLUMN appointments.service IS 'The service type that was booked';

