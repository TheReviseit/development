-- ============================================
-- ENABLE REALTIME FOR SHOWCASE ITEMS
-- Migration: 028_enable_realtime_showcase.sql
-- 
-- 1. Adds showcase_items to the realtime publication
-- 2. Fixes RLS policies to allow real-time selection by anon users
-- ============================================

-- 1. Add table to Realtime publication
-- This allows WebSocket subscriptions to receive events
ALTER PUBLICATION supabase_realtime ADD TABLE showcase_items;

-- 2. Fix RLS Policies for showcase_items
-- By default, it was "deny all", which prevents Realtime from broadcasting to anon/authenticated users via WebSocket
DROP POLICY IF EXISTS "showcase_items_deny_all" ON showcase_items;

-- Allow public (anon) users to see visible showcase items
-- This is required for both the public page and real-time subscriptions
CREATE POLICY "showcase_items_select_public" ON showcase_items 
    FOR SELECT TO anon 
    USING (is_visible = true AND is_deleted = false);

-- Also allow authenticated users (the business owner) to see their own items (including hidden ones)
CREATE POLICY "showcase_items_select_owner" ON showcase_items
    FOR SELECT TO authenticated
    USING (auth.uid()::text = user_id OR (is_visible = true AND is_deleted = false));

-- Deny write operations to anon (must go through API/Backend)
CREATE POLICY "showcase_items_deny_write" ON showcase_items 
    FOR ALL TO anon 
    USING (false)
    WITH CHECK (false);

-- ============================================
-- VERIFY CONFIGURATION
-- ============================================
-- Run these queries to verify:
-- 
-- Check Realtime publication:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'showcase_items';
--
-- Check RLS policies:
-- SELECT * FROM pg_policies WHERE tablename = 'showcase_items';
