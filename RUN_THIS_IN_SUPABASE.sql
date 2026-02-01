-- Add R2 storage metadata columns to whatsapp_messages table
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_key TEXT;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_mime TEXT;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_size BIGINT;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS storage_provider TEXT;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_hash TEXT;

-- Index for deduplication lookup by hash
CREATE INDEX IF NOT EXISTS idx_messages_media_hash
ON public.whatsapp_messages(media_hash)
WHERE media_hash IS NOT NULL;

-- Index for orphaned media cleanup
CREATE INDEX IF NOT EXISTS idx_messages_orphaned_media
ON public.whatsapp_messages(storage_provider, created_at)
WHERE storage_provider IS NOT NULL AND wamid IS NULL;
