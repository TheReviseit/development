-- Migration: Add appointment configuration to ai_capabilities
-- Created: 2025-12-31
-- Description: Extends ai_capabilities table with appointment field configuration
--              and adds custom_fields column to appointments table

-- Add JSONB column for appointment field configuration
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS appointment_fields JSONB DEFAULT '[
  {"id": "name", "label": "Full Name", "type": "text", "required": true, "order": 1},
  {"id": "phone", "label": "Phone Number", "type": "phone", "required": true, "order": 2},
  {"id": "date", "label": "Appointment Date", "type": "date", "required": true, "order": 3},
  {"id": "time", "label": "Appointment Time", "type": "time", "required": true, "order": 4}
]';

-- Add business hours configuration
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS appointment_business_hours JSONB DEFAULT '{
  "start": "09:00",
  "end": "18:00",
  "duration": 60,
  "buffer": 0
}';

-- Add minimal mode flag
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS appointment_minimal_mode BOOLEAN DEFAULT false;

-- Add custom_fields column to appointments for storing AI-collected custom data
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Add email column to appointments (frequently requested field)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- Add address column to appointments
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Create index for faster lookups on appointment date/time combinations
CREATE INDEX IF NOT EXISTS idx_appointments_datetime 
ON appointments(user_id, date, time, status);

COMMENT ON COLUMN ai_capabilities.appointment_fields IS 'JSON array of field configurations for appointment booking form';
COMMENT ON COLUMN ai_capabilities.appointment_business_hours IS 'Business hours and slot duration configuration';
COMMENT ON COLUMN ai_capabilities.appointment_minimal_mode IS 'When true, only collect name, phone, date, time';
COMMENT ON COLUMN appointments.custom_fields IS 'JSONB storage for custom field responses collected by AI';
