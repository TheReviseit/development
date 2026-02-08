-- ============================================================
-- Booking Payment Flow Enterprise Migration
-- ============================================================
-- Run this migration to add required columns for the new booking flow.
-- This ensures backward compatibility with existing bookings.
-- ============================================================

-- 0. FIRST: Update the legacy status column constraint to allow 'draft'
-- Drop the existing constraint (handles various naming conventions)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS status_check;

-- Recreate with new allowed values including 'draft'
ALTER TABLE appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'draft'));

-- 1. Add new booking status columns
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS booking_status VARCHAR(20) DEFAULT 'confirmed'
  CHECK (booking_status IN ('draft', 'payment_pending', 'confirmed', 'cancelled', 'expired', 'failed', 'refunded'));

-- 2. Update payment_status to have correct options
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'pay_at_venue', 'free'));

-- 3. Add reservation expiration tracking
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;

-- 4. Add payment verification fields
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS payment_amount_paise INTEGER;

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS razorpay_webhook_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS refund_id VARCHAR(255);

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 5. Add Razorpay fields (if not already present)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255);

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 6. Index for efficient expiration cleanup
CREATE INDEX IF NOT EXISTS idx_appointments_expiration 
ON appointments(booking_status, reserved_until) 
WHERE booking_status IN ('draft', 'payment_pending');

-- 7. Index for Razorpay order lookup
CREATE INDEX IF NOT EXISTS idx_appointments_razorpay_order
ON appointments(razorpay_order_id)
WHERE razorpay_order_id IS NOT NULL;

-- 7. Unique constraint to prevent double-booking
-- V1: Simple starts_at based (upgrade to GIST exclusion in V2 for range overlap)
CREATE UNIQUE INDEX IF NOT EXISTS idx_prevent_double_book
ON appointments(user_id, staff_id, starts_at)
WHERE booking_status NOT IN ('cancelled', 'expired', 'failed');

-- ============================================================
-- Webhook Events Table (Replay Protection)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- V2 FUTURE ENHANCEMENT: GIST Exclusion for Time Range Overlap
-- ============================================================
-- Uncomment when ready to upgrade (requires btree_gist extension):
-- 
-- CREATE EXTENSION IF NOT EXISTS btree_gist;
-- 
-- ALTER TABLE appointments DROP CONSTRAINT IF EXISTS prevent_time_overlap;
-- 
-- ALTER TABLE appointments 
-- ADD CONSTRAINT prevent_time_overlap
-- EXCLUDE USING gist (
--   staff_id WITH =,
--   tsrange(starts_at, ends_at) WITH &&
-- )
-- WHERE (booking_status NOT IN ('cancelled', 'expired', 'failed'));
-- ============================================================

-- Migrate existing confirmed bookings to new schema
UPDATE appointments 
SET booking_status = 'confirmed', 
    payment_status = COALESCE(payment_status, 'paid')
WHERE status = 'confirmed' 
  AND booking_status IS NULL;
