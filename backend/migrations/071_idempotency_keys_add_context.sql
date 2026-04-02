-- Migration: Add context column to idempotency_keys
-- Description: Fixes idem_db_backup_failed error when context is provided

ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS context TEXT;
