-- =============================================================================
-- Migration: Add Payment Truth to Orders
-- FAANG-Level Upgrade: Defines revenue strictly by captured payments.
-- =============================================================================

-- 1. Add explicitly linked payment columns 
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'captured', 'failed')),
ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);

-- 2. Indexes for Performance (as requested by FAANG review)
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created 
ON orders(payment_status, created_at);

-- 3. Document new schema truth
COMMENT ON COLUMN orders.payment_status IS 'Source of Truth for Revenue Analytics. Captured payments only';
COMMENT ON COLUMN orders.payment_id IS 'External reference to payment gateway sequence, e.g. Razorpay pay_id';
