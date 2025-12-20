-- ============================================================================
-- WhatsApp Conversations & Messages Schema Migration
-- Version: 2.1 - Fixed table references
-- Updated: 2025-12-21
-- ============================================================================

-- ============================================================================
-- 1. CREATE CONVERSATIONS TABLE
-- One row per unique user + customer phone combination
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership (references connected_business_managers.id)
    business_id uuid NOT NULL REFERENCES connected_business_managers(id) ON DELETE CASCADE,
    
    -- Customer info
    customer_phone text NOT NULL,
    customer_name text,
    customer_profile_pic text,
    
    -- Conversation stats (updated on each message)
    total_messages integer DEFAULT 0,
    inbound_count integer DEFAULT 0,
    outbound_count integer DEFAULT 0,
    unread_count integer DEFAULT 0,
    
    -- Last message preview (for inbox display)
    last_message_preview text,
    last_message_type text DEFAULT 'text',
    last_message_at timestamp with time zone,
    last_message_direction text,  -- 'inbound' or 'outbound'
    
    -- AI stats
    ai_replies_count integer DEFAULT 0,
    human_replies_count integer DEFAULT 0,
    
    -- Context for AI
    detected_language text DEFAULT 'en',
    detected_intents text[],  -- Array of intents detected in this conversation
    
    -- Status & assignment
    status text DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked', 'resolved')),
    assigned_to uuid,
    priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Tags for filtering
    tags text[],
    
    -- Notes
    internal_notes text,
    
    -- Timestamps
    first_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    
    -- Unique constraint: one conversation per business + customer phone
    CONSTRAINT unique_business_customer UNIQUE(business_id, customer_phone)
);

-- ============================================================================
-- 2. UPDATE MESSAGES TABLE
-- Add conversation_id reference
-- ============================================================================

-- Add conversation_id to existing messages table
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- Add AI-related fields if they don't exist
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS is_ai_generated boolean DEFAULT false;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS intent_detected text;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS confidence_score decimal(3,2);

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS tokens_used integer DEFAULT 0;

ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS response_time_ms integer;

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_business_id 
ON whatsapp_conversations(business_id);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message 
ON whatsapp_conversations(business_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_unread 
ON whatsapp_conversations(business_id) 
WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_conversations_status 
ON whatsapp_conversations(business_id, status);

CREATE INDEX IF NOT EXISTS idx_conversations_customer_phone 
ON whatsapp_conversations(business_id, customer_phone);

-- Messages indexes (add conversation_id index)
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
ON whatsapp_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_ai_generated 
ON whatsapp_messages(business_id, is_ai_generated) 
WHERE is_ai_generated = true;

-- ============================================================================
-- 4. FUNCTION: Get or Create Conversation
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_business_id uuid,
    p_customer_phone text,
    p_customer_name text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_conversation_id uuid;
BEGIN
    -- Try to find existing conversation
    SELECT id INTO v_conversation_id
    FROM whatsapp_conversations
    WHERE business_id = p_business_id AND customer_phone = p_customer_phone;
    
    -- If not found, create new
    IF v_conversation_id IS NULL THEN
        INSERT INTO whatsapp_conversations (
            business_id, customer_phone, customer_name
        ) VALUES (
            p_business_id, p_customer_phone, COALESCE(p_customer_name, p_customer_phone)
        )
        RETURNING id INTO v_conversation_id;
    ELSE
        -- Update customer name if provided and currently null
        UPDATE whatsapp_conversations
        SET customer_name = COALESCE(customer_name, p_customer_name),
            updated_at = now()
        WHERE id = v_conversation_id AND customer_name IS NULL AND p_customer_name IS NOT NULL;
    END IF;
    
    RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNCTION: Update Conversation Stats
-- Called after each message insert
-- ============================================================================

CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if conversation_id is set
    IF NEW.conversation_id IS NOT NULL THEN
        UPDATE whatsapp_conversations
        SET 
            total_messages = total_messages + 1,
            inbound_count = CASE WHEN NEW.direction = 'inbound' THEN inbound_count + 1 ELSE inbound_count END,
            outbound_count = CASE WHEN NEW.direction = 'outbound' THEN outbound_count + 1 ELSE outbound_count END,
            unread_count = CASE WHEN NEW.direction = 'inbound' AND NEW.status != 'read' THEN unread_count + 1 ELSE unread_count END,
            last_message_preview = LEFT(COALESCE(NEW.message_body, '[' || NEW.message_type || ']'), 100),
            last_message_type = NEW.message_type,
            last_message_at = COALESCE(NEW.created_at, now()),
            last_message_direction = NEW.direction,
            ai_replies_count = CASE WHEN NEW.is_ai_generated = true THEN ai_replies_count + 1 ELSE ai_replies_count END,
            human_replies_count = CASE WHEN NEW.direction = 'outbound' AND (NEW.is_ai_generated = false OR NEW.is_ai_generated IS NULL) THEN human_replies_count + 1 ELSE human_replies_count END,
            updated_at = now()
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_update_conversation_stats ON whatsapp_messages;
CREATE TRIGGER trigger_update_conversation_stats
    AFTER INSERT ON whatsapp_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_stats();

-- ============================================================================
-- 6. FUNCTION: Mark Conversation as Read
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id uuid)
RETURNS void AS $$
BEGIN
    -- Update messages
    UPDATE whatsapp_messages
    SET status = 'read', read_at = now()
    WHERE conversation_id = p_conversation_id 
      AND direction = 'inbound' 
      AND status != 'read';
    
    -- Reset unread count
    UPDATE whatsapp_conversations
    SET unread_count = 0, updated_at = now()
    WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. MIGRATE EXISTING DATA
-- Link existing messages to conversations
-- ============================================================================

-- First, create conversations for existing messages
INSERT INTO whatsapp_conversations (
    business_id, 
    customer_phone, 
    customer_name,
    total_messages,
    inbound_count,
    outbound_count,
    unread_count,
    last_message_preview,
    last_message_type,
    last_message_at,
    last_message_direction,
    first_message_at
)
SELECT DISTINCT ON (m.business_id, customer_phone)
    m.business_id,
    CASE WHEN m.direction = 'inbound' THEN m.from_number ELSE m.to_number END as customer_phone,
    COALESCE(m.metadata->>'contact_name', 
             CASE WHEN m.direction = 'inbound' THEN m.from_number ELSE m.to_number END) as customer_name,
    0 as total_messages,  -- Will be updated below
    0 as inbound_count,
    0 as outbound_count,
    0 as unread_count,
    m.message_body as last_message_preview,
    m.message_type as last_message_type,
    m.created_at as last_message_at,
    m.direction as last_message_direction,
    m.created_at as first_message_at
FROM whatsapp_messages m
WHERE m.conversation_id IS NULL
  AND m.business_id IS NOT NULL
ORDER BY m.business_id, customer_phone, m.created_at DESC
ON CONFLICT (business_id, customer_phone) DO NOTHING;

-- Now link messages to their conversations
UPDATE whatsapp_messages m
SET conversation_id = c.id
FROM whatsapp_conversations c
WHERE m.conversation_id IS NULL
  AND m.business_id = c.business_id
  AND (
      (m.direction = 'inbound' AND m.from_number = c.customer_phone) OR
      (m.direction = 'outbound' AND m.to_number = c.customer_phone)
  );

-- Update conversation stats from existing messages
UPDATE whatsapp_conversations c
SET 
    total_messages = stats.total,
    inbound_count = stats.inbound,
    outbound_count = stats.outbound,
    unread_count = stats.unread
FROM (
    SELECT 
        conversation_id,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND status != 'read') as unread
    FROM whatsapp_messages
    WHERE conversation_id IS NOT NULL
    GROUP BY conversation_id
) stats
WHERE c.id = stats.conversation_id;

-- ============================================================================
-- 8. ADD FOREIGN KEY (optional - do this after data migration)
-- ============================================================================

-- Uncomment this after running the migration successfully:
-- ALTER TABLE whatsapp_messages
-- ADD CONSTRAINT fk_messages_conversation
-- FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations(id) ON DELETE SET NULL;

-- ============================================================================
-- 9. VIEW: Conversation Inbox (optional helper view)
-- ============================================================================

CREATE OR REPLACE VIEW v_conversation_inbox AS
SELECT 
    c.id,
    c.business_id,
    c.customer_phone,
    c.customer_name,
    c.customer_profile_pic,
    c.total_messages,
    c.unread_count,
    c.last_message_preview,
    c.last_message_type,
    c.last_message_at,
    c.last_message_direction,
    c.status,
    c.priority,
    c.tags,
    c.assigned_to,
    c.ai_replies_count,
    c.human_replies_count,
    c.detected_language,
    c.first_message_at,
    c.updated_at,
    -- Calculate time ago for display
    CASE 
        WHEN c.last_message_at > now() - interval '1 hour' 
            THEN EXTRACT(MINUTE FROM now() - c.last_message_at)::text || 'm'
        WHEN c.last_message_at > now() - interval '1 day' 
            THEN EXTRACT(HOUR FROM now() - c.last_message_at)::text || 'h'
        WHEN c.last_message_at > now() - interval '7 days' 
            THEN EXTRACT(DAY FROM now() - c.last_message_at)::text || 'd'
        ELSE TO_CHAR(c.last_message_at, 'Mon DD')
    END as time_ago
FROM whatsapp_conversations c
WHERE c.status != 'archived';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- 1. Created whatsapp_conversations table
-- 2. Added conversation_id and AI fields to whatsapp_messages
-- 3. Created helper functions (get_or_create_conversation, mark_conversation_read)
-- 4. Created trigger for auto-updating conversation stats
-- 5. Migrated existing messages to conversations
-- 6. Created inbox view

-- To verify:
-- SELECT COUNT(*) FROM whatsapp_conversations;
-- SELECT COUNT(*) FROM whatsapp_messages WHERE conversation_id IS NOT NULL;
