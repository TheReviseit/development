-- Migration: Add thumbnail and preview URL columns to whatsapp_messages
-- This enables dashboard to display optimized images without loading full-size originals
--
-- IMPORTANT: 
-- - These columns are populated ASYNC after message send
-- - Dashboard should fallback: thumbnail_url || preview_url || media_url
-- - Original media_url is NEVER modified

-- Add thumbnail_url column (300px WebP)
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add preview_url column (800px WebP)
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Add index for faster lookups when thumbnails exist
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_thumbnail 
ON whatsapp_messages (thumbnail_url) 
WHERE thumbnail_url IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN whatsapp_messages.thumbnail_url IS 
  'Async-generated 300px WebP thumbnail for conversation list. Fallback to media_url if NULL.';

COMMENT ON COLUMN whatsapp_messages.preview_url IS 
  'Async-generated 800px WebP preview for message view. Fallback to media_url if NULL.';
