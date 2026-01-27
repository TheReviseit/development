-- ============================================
-- ENABLE REALTIME FOR ORDERS
-- Migration: 016_enable_realtime_orders.sql
-- 
-- This enables Supabase Realtime subscriptions
-- on the orders table.
-- Run this in Supabase SQL Editor.
-- ============================================

-- Add orders table to Realtime publication
-- This allows WebSocket subscriptions to receive INSERT/UPDATE/DELETE events
-- Check if table is already in publication before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
        RAISE NOTICE 'Added orders table to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'orders table is already in supabase_realtime publication';
    END IF;
END $$;

-- ============================================
-- RLS POLICIES FOR REALTIME READ ACCESS
-- ============================================
-- Supabase Realtime requires SELECT permissions to read changes.
-- The existing policy uses auth.uid() which requires Supabase Auth.
-- Since we're using Firebase Auth, we need to ensure the policy works
-- with JWT claims from Firebase tokens.

-- Drop existing policy if it exists
DROP POLICY IF EXISTS orders_isolation_policy ON orders;

-- Create a policy that works with both Supabase Auth and Firebase Auth
-- This allows users to SELECT their own orders for realtime subscriptions
CREATE POLICY orders_isolation_policy ON orders
    FOR ALL
    USING (
        -- For Supabase Auth
        user_id = auth.uid()::text 
        OR 
        -- For Firebase Auth (JWT claims)
        user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        OR
        -- For service role (backend operations)
        current_setting('role') = 'service_role'
    );

-- ============================================
-- ADDITIONAL SELECT POLICY FOR REALTIME
-- ============================================
-- Realtime subscriptions need explicit SELECT permission
-- Create a separate SELECT policy to ensure realtime works
CREATE POLICY orders_select_own ON orders
    FOR SELECT
    USING (
        user_id = auth.uid()::text 
        OR 
        user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    );

-- ============================================
-- VERIFY CONFIGURATION
-- ============================================
-- Run these queries to verify:
-- 
-- Check Realtime publication:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders';
--
-- Check RLS policies:
-- SELECT * FROM pg_policies WHERE tablename = 'orders';
