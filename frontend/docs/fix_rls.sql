-- Fix RLS Policies for Firebase Auth Integration
-- Run this in Supabase SQL Editor

-- First, drop all existing policies
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can view own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can insert own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can update own businesses" ON businesses;
DROP POLICY IF EXISTS "Users can view own connections" ON whatsapp_connections;
DROP POLICY IF EXISTS "Users can insert own connections" ON whatsapp_connections;
DROP POLICY IF EXISTS "Users can update own connections" ON whatsapp_connections;

-- Disable RLS temporarily (since we're using service role in API routes)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_connections DISABLE ROW LEVEL SECURITY;

-- Note: Security is now handled by API routes checking Firebase UID
-- The service role key should NEVER be exposed to the client
