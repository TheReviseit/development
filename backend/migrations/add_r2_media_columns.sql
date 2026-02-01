-- ============================================================================
-- Add Cloudflare R2 Media Storage Columns to WhatsApp Messages
-- Migration: add_r2_media_columns
-- Created: 2026-02-01
-- ============================================================================

-- Add R2 storage metadata columns
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_key TEXT;           -- R2 object key (deterministic path)

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_mime TEXT;          -- MIME type (e.g., image/jpeg)

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_size BIGINT;        -- File size in bytes

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS storage_provider TEXT;    -- "cloudflare_r2" or null for WhatsApp-only

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS media_hash TEXT;          -- SHA-256 hash for dedup & integrity

-- Index for deduplication lookup by hash
CREATE INDEX IF NOT EXISTS idx_messages_media_hash
ON public.whatsapp_messages(media_hash)
WHERE media_hash IS NOT NULL;

-- Index for orphaned media cleanup (storage_provider set but no wamid = failed send)
CREATE INDEX IF NOT EXISTS idx_messages_orphaned_media
ON public.whatsapp_messages(storage_provider, created_at)
WHERE storage_provider IS NOT NULL AND wamid IS NULL;

-- Comments for documentation
COMMENT ON COLUMN public.whatsapp_messages.media_key IS 'Cloudflare R2 object key: messages/businesses/{bid}/conversations/{cid}/{type}/{mid}.{ext}';
COMMENT ON COLUMN public.whatsapp_messages.media_mime IS 'MIME type of the media file';
COMMENT ON COLUMN public.whatsapp_messages.media_size IS 'File size in bytes';
COMMENT ON COLUMN public.whatsapp_messages.storage_provider IS 'Persistent storage provider: cloudflare_r2';
COMMENT ON COLUMN public.whatsapp_messages.media_hash IS 'SHA-256 hash for deduplication and integrity verification';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
