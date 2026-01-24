-- ============================================================================
-- DELETE ALL DATA (Keep Table Structure)
-- ============================================================================
-- ⚠️ WARNING: This will DELETE ALL DATA from all tables!
-- ⚠️ Only the table structure will remain
-- ⚠️ Run this ONLY if you're sure you want to clear everything
-- ============================================================================

-- STEP 1: BACKUP FIRST (HIGHLY RECOMMENDED!)
-- Run this to create backups before deletion:
/*
CREATE TABLE users_backup AS SELECT * FROM users;
CREATE TABLE businesses_backup AS SELECT * FROM businesses;
CREATE TABLE products_backup_full AS SELECT * FROM products;
CREATE TABLE subscriptions_backup AS SELECT * FROM subscriptions;
CREATE TABLE payment_history_backup AS SELECT * FROM payment_history;
CREATE TABLE whatsapp_messages_backup AS SELECT * FROM whatsapp_messages;
CREATE TABLE whatsapp_conversations_backup AS SELECT * FROM whatsapp_conversations;
*/

-- ============================================================================
-- STEP 2: Verify what will be deleted
-- ============================================================================
-- Run these queries to see how much data you have:
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL SELECT 'businesses', COUNT(*) FROM businesses
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'product_categories', COUNT(*) FROM product_categories
UNION ALL SELECT 'product_images', COUNT(*) FROM product_images
UNION ALL SELECT 'product_audit_log', COUNT(*) FROM product_audit_log
UNION ALL SELECT 'product_backups', COUNT(*) FROM product_backups
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'payment_history', COUNT(*) FROM payment_history
UNION ALL SELECT 'payment_attempts', COUNT(*) FROM payment_attempts
UNION ALL SELECT 'webhook_events', COUNT(*) FROM webhook_events
UNION ALL SELECT 'whatsapp_messages', COUNT(*) FROM whatsapp_messages
UNION ALL SELECT 'whatsapp_conversations', COUNT(*) FROM whatsapp_conversations
UNION ALL SELECT 'connected_phone_numbers', COUNT(*) FROM connected_phone_numbers
UNION ALL SELECT 'connected_whatsapp_accounts', COUNT(*) FROM connected_whatsapp_accounts
UNION ALL SELECT 'connected_business_managers', COUNT(*) FROM connected_business_managers
UNION ALL SELECT 'connected_facebook_accounts', COUNT(*) FROM connected_facebook_accounts
UNION ALL SELECT 'analytics_daily', COUNT(*) FROM analytics_daily
UNION ALL SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions;


-- ============================================================================
-- STEP 3: DELETE ALL DATA (Order matters - respects foreign keys)
-- ============================================================================

-- Start transaction for safety
BEGIN;

-- Delete in correct order (child tables first, then parent tables)

-- 1. Delete PRODUCT-related data (new normalized tables)
DELETE FROM product_images;
DELETE FROM product_variants;
DELETE FROM products;
DELETE FROM product_categories;
DELETE FROM product_audit_log;
DELETE FROM product_backups;

-- 2. Delete messaging data
DELETE FROM whatsapp_messages;
DELETE FROM whatsapp_conversations;

-- 3. Delete analytics
DELETE FROM analytics_daily;

-- 4. Delete payment-related data
DELETE FROM payment_history;
DELETE FROM payment_attempts;
DELETE FROM webhook_events;

-- 5. Delete subscriptions
DELETE FROM subscriptions;

-- 6. Delete WhatsApp connection data
DELETE FROM connected_phone_numbers;
DELETE FROM connected_whatsapp_accounts;
DELETE FROM connected_business_managers;
DELETE FROM connected_facebook_accounts;

-- 7. Delete push subscriptions
DELETE FROM push_subscriptions;

-- 8. Delete businesses (before users due to FK)
DELETE FROM businesses;

-- 9. Delete users (last, as others reference it)
DELETE FROM users;

-- If everything looks good, commit the transaction
COMMIT;

-- If you want to cancel/rollback instead:
-- ROLLBACK;


-- ============================================================================
-- STEP 4: Verify deletion
-- ============================================================================
-- Run this after deletion to confirm all tables are empty:
SELECT 'users' as table_name, COUNT(*) as remaining_rows FROM users
UNION ALL SELECT 'businesses', COUNT(*) FROM businesses
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'product_categories', COUNT(*) FROM product_categories
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'payment_history', COUNT(*) FROM payment_history
UNION ALL SELECT 'whatsapp_messages', COUNT(*) FROM whatsapp_messages
UNION ALL SELECT 'whatsapp_conversations', COUNT(*) FROM whatsapp_conversations;
-- All should show 0 rows


-- ============================================================================
-- STEP 5: RESET AUTO-INCREMENT SEQUENCES (Optional)
-- ============================================================================
-- This resets ID sequences back to 1
-- Only run if you want new data to start from ID = 1 again

-- For tables with auto-increment IDs:
-- ALTER SEQUENCE users_id_seq RESTART WITH 1;
-- ALTER SEQUENCE subscriptions_id_seq RESTART WITH 1;
-- ALTER SEQUENCE payment_history_id_seq RESTART WITH 1;
-- etc.


-- ============================================================================
-- ALTERNATIVE: Delete only TEST data (keep production users)
-- ============================================================================
-- If you only want to delete test/demo data:
/*
-- Delete test users and their related data
DELETE FROM products WHERE user_id IN (
    SELECT user_id FROM users WHERE email LIKE '%test%' OR email LIKE '%demo%'
);

DELETE FROM businesses WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%test%' OR email LIKE '%demo%'
);

DELETE FROM subscriptions WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%test%' OR email LIKE '%demo%'
);

DELETE FROM users WHERE email LIKE '%test%' OR email LIKE '%demo%';
*/


-- ============================================================================
-- RESTORE FROM BACKUP (if needed)
-- ============================================================================
-- If you made backups and want to restore:
/*
INSERT INTO users SELECT * FROM users_backup;
INSERT INTO businesses SELECT * FROM businesses_backup;
INSERT INTO products SELECT * FROM products_backup_full;
INSERT INTO subscriptions SELECT * FROM subscriptions_backup;
-- etc.

-- Drop backup tables after restore:
DROP TABLE IF EXISTS users_backup;
DROP TABLE IF EXISTS businesses_backup;
DROP TABLE IF EXISTS products_backup_full;
*/
