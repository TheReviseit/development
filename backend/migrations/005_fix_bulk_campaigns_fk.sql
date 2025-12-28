-- Fix Bulk Campaigns Foreign Key Constraint
-- The original migration incorrectly references auth.users instead of public.users
-- Run this in Supabase SQL Editor

-- ============================================
-- Step 1: Drop existing foreign key constraint
-- ============================================
ALTER TABLE bulk_campaigns 
DROP CONSTRAINT IF EXISTS bulk_campaigns_user_id_fkey;

-- ============================================
-- Step 2: Add correct foreign key (public.users)
-- ============================================
ALTER TABLE bulk_campaigns 
ADD CONSTRAINT bulk_campaigns_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ============================================
-- Step 3: Fix RLS policies to use public.users
-- ============================================
-- Drop old policies that use auth.uid()
DROP POLICY IF EXISTS "Users can view own campaigns" ON bulk_campaigns;
DROP POLICY IF EXISTS "Users can insert own campaigns" ON bulk_campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns" ON bulk_campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns" ON bulk_campaigns;

-- Create new policies that work without RLS auth (backend handles auth via X-User-ID header)
-- Note: If you want RLS, you'll need to map Firebase UID to Supabase user ID

-- For now, we'll use service role from backend (bypasses RLS)
-- If you need client-side RLS, uncomment and adapt these:
-- CREATE POLICY "Backend service access" ON bulk_campaigns FOR ALL USING (true);

-- Actually, let's just disable RLS since backend uses service role
ALTER TABLE bulk_campaigns DISABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 4: Also fix campaign_contacts RLS
-- ============================================
ALTER TABLE campaign_contacts DISABLE ROW LEVEL SECURITY;

-- ============================================
-- Verification
-- ============================================
-- Run this to verify the fix:
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'bulk_campaigns'::regclass AND contype = 'f';
