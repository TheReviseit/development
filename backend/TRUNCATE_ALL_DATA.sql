-- ========================================
-- ⚠️ PROFESSIONAL DATA WIPE SCRIPT ⚠️
-- ========================================
-- Dynamically truncates ALL tables in public schema
-- Keeps table structures, functions, and triggers intact
-- Handles foreign key constraints automatically
-- ========================================

-- Step 1: Generate and execute TRUNCATE commands for all existing tables
DO $$ 
DECLARE
    r RECORD;
    table_list TEXT := '';
BEGIN
    -- Build comma-separated list of all tables
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    ) 
    LOOP
        IF table_list != '' THEN
            table_list := table_list || ', ';
        END IF;
        table_list := table_list || quote_ident(r.tablename);
    END LOOP;
    
    -- Execute TRUNCATE on all tables at once
    -- CASCADE automatically handles foreign key constraints
    IF table_list != '' THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' CASCADE';
        RAISE NOTICE 'Successfully truncated all tables: %', table_list;
    ELSE
        RAISE NOTICE 'No tables found to truncate';
    END IF;
END $$;

-- Step 2: Verify all tables are empty
SELECT 
    schemaname,
    relname as table_name,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;

-- Step 3: Reset sequences to 1 (for auto-increment IDs)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
    ) 
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_name) || ' RESTART WITH 1';
        RAISE NOTICE 'Reset sequence: %', r.sequence_name;
    END LOOP;
END $$;

-- Done! All data deleted, tables intact, sequences reset
