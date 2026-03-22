-- Migration: 012_webhook_processing_state
-- Description: Update webhook_events processing_result constraint to include 'processing' state

BEGIN;

-- Drop the existing constraint
ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_processing_result_check;

-- Re-add the constraint with 'processing' included
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_processing_result_check 
CHECK (processing_result IN ('processing', 'processed', 'ignored_duplicate', 'ignored_ordering', 'failed'));

COMMIT;
