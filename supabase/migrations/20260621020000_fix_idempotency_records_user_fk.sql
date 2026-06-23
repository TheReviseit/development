-- Fix idempotency_records.user_id FK: Firebase Auth uses public.users, not auth.users
-- (Same pattern as migrations/010_fix_subscriptions_fk.sql)

ALTER TABLE idempotency_records
    DROP CONSTRAINT IF EXISTS idempotency_records_user_id_fkey;

ALTER TABLE idempotency_records
    ADD CONSTRAINT idempotency_records_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT idempotency_records_user_id_fkey ON idempotency_records IS
    'References public.users (Firebase Auth). user_id nullable when claim is key-scoped only.';
