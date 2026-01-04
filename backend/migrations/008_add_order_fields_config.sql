-- Migration: Add order field configuration to ai_capabilities
-- Created: 2026-01-04
-- Description: Extends ai_capabilities table with order field configuration
--              and adds custom_fields column to orders table

-- Add JSONB column for order field configuration
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS order_fields JSONB DEFAULT '[
  {"id": "name", "label": "Full Name", "type": "text", "required": true, "order": 1},
  {"id": "phone", "label": "Phone Number", "type": "phone", "required": true, "order": 2},
  {"id": "address", "label": "Delivery Address", "type": "textarea", "required": true, "order": 3},
  {"id": "notes", "label": "Order Notes", "type": "textarea", "required": false, "order": 4}
]';

-- Add minimal mode flag for orders (if true, only collect name and phone)
ALTER TABLE ai_capabilities 
ADD COLUMN IF NOT EXISTS order_minimal_mode BOOLEAN DEFAULT false;

-- Add custom_fields column to orders for storing AI-collected custom data
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Add customer_address column to orders (frequently requested field)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Add customer_email column to orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS customer_email TEXT;

COMMENT ON COLUMN ai_capabilities.order_fields IS 'JSON array of field configurations for order booking form';
COMMENT ON COLUMN ai_capabilities.order_minimal_mode IS 'When true, only collect name and phone for orders';
COMMENT ON COLUMN orders.custom_fields IS 'JSONB storage for custom field responses collected by AI during order';

