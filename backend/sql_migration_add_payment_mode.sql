-- Add payment_mode column to orders table to store 'Online Paid' or 'COD'
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_mode text;

-- Add a comment explaining what it stores
COMMENT ON COLUMN public.orders.payment_mode IS 'Stores the detected payment mode for the order, e.g., "Online Paid" or "COD"';
