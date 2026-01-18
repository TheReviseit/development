-- =============================================================================
-- Migration: 010_fix_subscriptions_fk.sql
-- Description: Fix FK constraint to reference custom users table instead of auth.users
-- =============================================================================
-- Note: The subscriptions table was created with FK to auth.users(id), but since
-- this app uses Firebase Auth (not Supabase Auth), there are no entries in auth.users.
-- This migration changes the FK to reference the custom 'users' table instead.

-- Step 1: Drop the existing foreign key constraints
ALTER TABLE subscriptions 
    DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;

ALTER TABLE payment_history 
    DROP CONSTRAINT IF EXISTS payment_history_user_id_fkey;

-- Step 2: Add new foreign key constraints to custom users table
ALTER TABLE subscriptions 
    ADD CONSTRAINT subscriptions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE payment_history 
    ADD CONSTRAINT payment_history_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Step 3: Update RLS policies to use the correct user reference
-- Drop existing policies
DROP POLICY IF EXISTS subscriptions_select_policy ON subscriptions;
DROP POLICY IF EXISTS payment_history_select_policy ON payment_history;

-- Create new policies that work with Firebase Auth users
-- Allow users to view their own subscriptions by matching user_id
CREATE POLICY subscriptions_select_policy ON subscriptions
    FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE firebase_uid = auth.uid()::text));

-- Allow users to view their own payment history
CREATE POLICY payment_history_select_policy ON payment_history
    FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE firebase_uid = auth.uid()::text));

-- Keep service role policies (already exist)
-- These allow backend operations with service role key
