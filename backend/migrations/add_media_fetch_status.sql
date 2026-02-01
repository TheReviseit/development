-- Add media_fetch_status column for idempotent media fetching
-- This prevents concurrent downloads of the same inbound media
-- States: pending (default), fetching, ready, failed

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_fetch_status TEXT DEFAULT 'pending';

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_fetch_status 
ON public.whatsapp_messages(media_fetch_status) 
WHERE media_fetch_status = 'fetching';

-- Add comment explaining the column
COMMENT ON COLUMN public.whatsapp_messages.media_fetch_status IS 
'Inbound media fetch status: pending (not yet fetched), fetching (in progress), ready (R2 URL available), failed (fetch failed)';

-- Add constraint for valid states
ALTER TABLE public.whatsapp_messages
DROP CONSTRAINT IF EXISTS chk_media_fetch_status;

ALTER TABLE public.whatsapp_messages
ADD CONSTRAINT chk_media_fetch_status 
CHECK (media_fetch_status IN ('pending', 'fetching', 'ready', 'failed'));
