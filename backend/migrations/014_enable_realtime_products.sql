-- ============================================
-- ENABLE REALTIME FOR PRODUCTS
-- Migration: 014_enable_realtime_products.sql
-- 
-- This enables Supabase Realtime subscriptions
-- on products and product_variants tables.
-- Run this in Supabase SQL Editor.
-- ============================================

-- Add tables to Realtime publication
-- This allows WebSocket subscriptions to receive INSERT/UPDATE/DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE product_variants;

-- ============================================
-- RLS POLICIES FOR REALTIME READ ACCESS
-- ============================================
-- Supabase Realtime uses the anon key on the client.
-- We need SELECT policies to allow reading product data.

-- Products: Allow anyone to SELECT non-deleted, available products
-- This is safe because shops are public storefronts
DROP POLICY IF EXISTS "products_deny_all" ON products;

CREATE POLICY "products_select_public" ON products 
    FOR SELECT TO anon 
    USING (is_deleted = false AND is_available = true);

-- Products: Deny write operations to anon
CREATE POLICY "products_deny_write" ON products 
    FOR ALL TO anon 
    USING (false)
    WITH CHECK (false);

-- Product Variants: Allow anyone to SELECT non-deleted variants
DROP POLICY IF EXISTS "variants_deny_all" ON product_variants;

CREATE POLICY "variants_select_public" ON product_variants 
    FOR SELECT TO anon 
    USING (is_deleted = false);

-- Variants: Deny write operations to anon
CREATE POLICY "variants_deny_write" ON product_variants 
    FOR ALL TO anon 
    USING (false)
    WITH CHECK (false);

-- ============================================
-- VERIFY CONFIGURATION
-- ============================================
-- Run these queries to verify:
-- 
-- Check Realtime publication:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--
-- Check RLS policies:
-- SELECT * FROM pg_policies WHERE tablename IN ('products', 'product_variants');
