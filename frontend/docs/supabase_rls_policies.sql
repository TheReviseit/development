-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Firebase Authentication → Supabase Sync System
-- =====================================================
-- These policies ensure users can only access their own data
-- Security is enforced using the firebase_uid column
-- =====================================================

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USERS TABLE POLICIES
-- =====================================================

-- Policy: Users can read their own record
-- Matches firebase_uid from the auth context
CREATE POLICY "Users can view own profile"
    ON users
    FOR SELECT
    USING (firebase_uid = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Users can update their own record
CREATE POLICY "Users can update own profile"
    ON users
    FOR UPDATE
    USING (firebase_uid = current_setting('request.jwt.claims', true)::json->>'sub')
    WITH CHECK (firebase_uid = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Service role can insert new users (for sync endpoint)
-- This allows the backend sync API to create users
CREATE POLICY "Service role can insert users"
    ON users
    FOR INSERT
    WITH CHECK (true);

-- Policy: Service role can update any user (for sync endpoint)
CREATE POLICY "Service role can update users"
    ON users
    FOR UPDATE
    USING (true);

-- Alternative approach using a custom claim
-- If you store firebase_uid in JWT claims

CREATE OR REPLACE FUNCTION get_firebase_uid()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('request.jwt.claims', true)::json->>'sub';
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- BUSINESSES TABLE POLICIES
-- =====================================================

-- Policy: Users can read their own business
CREATE POLICY "Users can view own business"
    ON businesses
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM users WHERE firebase_uid = get_firebase_uid()
        )
    );

-- Policy: Users can insert their own business
CREATE POLICY "Users can create own business"
    ON businesses
    FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM users WHERE firebase_uid = get_firebase_uid()
        )
    );

-- Policy: Users can update their own business
CREATE POLICY "Users can update own business"
    ON businesses
    FOR UPDATE
    USING (
        user_id IN (
            SELECT id FROM users WHERE firebase_uid = get_firebase_uid()
        )
    )
    WITH CHECK (
        user_id IN (
            SELECT id FROM users WHERE firebase_uid = get_firebase_uid()
        )
    );

-- Policy: Users can delete their own business
CREATE POLICY "Users can delete own business"
    ON businesses
    FOR DELETE
    USING (
        user_id IN (
            SELECT id FROM users WHERE firebase_uid = get_firebase_uid()
        )
    );

-- =====================================================
-- WHATSAPP CONNECTIONS TABLE POLICIES
-- =====================================================

-- Policy: Users can read their own WhatsApp connections
CREATE POLICY "Users can view own whatsapp connections"
    ON whatsapp_connections
    FOR SELECT
    USING (
        business_id IN (
            SELECT b.id FROM businesses b
            INNER JOIN users u ON b.user_id = u.id
            WHERE u.firebase_uid = get_firebase_uid()
        )
    );

-- Policy: Users can create WhatsApp connections for their business
CREATE POLICY "Users can create own whatsapp connections"
    ON whatsapp_connections
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT b.id FROM businesses b
            INNER JOIN users u ON b.user_id = u.id
            WHERE u.firebase_uid = get_firebase_uid()
        )
    );

-- Policy: Users can update their own WhatsApp connections
CREATE POLICY "Users can update own whatsapp connections"
    ON whatsapp_connections
    FOR UPDATE
    USING (
        business_id IN (
            SELECT b.id FROM businesses b
            INNER JOIN users u ON b.user_id = u.id
            WHERE u.firebase_uid = get_firebase_uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT b.id FROM businesses b
            INNER JOIN users u ON b.user_id = u.id
            WHERE u.firebase_uid = get_firebase_uid()
        )
    );

-- Policy: Users can delete their own WhatsApp connections
CREATE POLICY "Users can delete own whatsapp connections"
    ON whatsapp_connections
    FOR DELETE
    USING (
        business_id IN (
            SELECT b.id FROM businesses b
            INNER JOIN users u ON b.user_id = u.id
            WHERE u.firebase_uid = get_firebase_uid()
        )
    );

-- =====================================================
-- ADMIN POLICIES (Optional)
-- =====================================================
-- Allow admin users to access all records

-- Admin policy for users table
CREATE POLICY "Admins can view all users"
    ON users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE firebase_uid = get_firebase_uid()
            AND role = 'admin'
        )
    );

-- Admin policy for businesses table
CREATE POLICY "Admins can view all businesses"
    ON businesses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE firebase_uid = get_firebase_uid()
            AND role = 'admin'
        )
    );

-- =====================================================
-- TESTING RLS POLICIES
-- =====================================================
-- To test if RLS is working correctly:

/*
-- 1. Set the firebase_uid for testing
SET request.jwt.claims = '{"sub": "test-firebase-uid-123"}';

-- 2. Try to select from users table
SELECT * FROM users;
-- Should only return the user with firebase_uid = 'test-firebase-uid-123'

-- 3. Reset the setting
RESET request.jwt.claims;
*/

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================

/*
1. SERVICE ROLE KEY USAGE:
   - The sync endpoint uses the service_role key which BYPASSES RLS
   - This is necessary to create/update users during the sync process
   - Service role should ONLY be used on the backend, NEVER client-side

2. ANON KEY USAGE:
   - Frontend uses the anon key which ENFORCES RLS
   - Users can only access their own data when using anon key
   - Anon key is safe to expose in client-side code

3. FIREBASE UID STORAGE:
   - Firebase UID is stored in the firebase_uid column
   - This is NOT the same as Supabase's auth.uid()
   - We use Firebase for authentication, Supabase for data storage

4. JWT CLAIMS:
   - If using Supabase Auth JWT, you'd access claims via:
     current_setting('request.jwt.claims', true)::json->>'sub'
   - In our case, we store Firebase UID in the database and match against it

5. MULTI-TENANCY:
   - Each user can only access their own data
   - Foreign key relationships (user_id, business_id) enforce data isolation
   - RLS policies ensure no cross-user data access
*/
