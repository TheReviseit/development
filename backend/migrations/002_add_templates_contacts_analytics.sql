-- ============================================================================
-- Migration 002: Add Templates, Contacts, Campaigns, and Analytics
-- Aligned with existing Supabase schema
-- ============================================================================

-- ============================================================================
-- 1. MESSAGE TEMPLATES TABLE
-- Stores Meta-approved WhatsApp message templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    waba_id TEXT NOT NULL,  -- References connected_whatsapp_accounts.waba_id
    
    -- Template identifiers from Meta
    meta_template_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    
    -- Template properties
    category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    language TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED', 'DISABLED', 'PAUSED')),
    
    -- Template content
    header_type TEXT CHECK (header_type IN ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION')),
    header_content TEXT,
    body_text TEXT NOT NULL,
    footer_text TEXT,
    
    -- Buttons and variables stored as JSON
    buttons JSONB DEFAULT '[]'::jsonb,
    variables JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint per user/WABA/template
    UNIQUE(user_id, waba_id, meta_template_id)
);

-- Indexes for templates
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.whatsapp_message_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_status ON public.whatsapp_message_templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.whatsapp_message_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_waba_id ON public.whatsapp_message_templates(waba_id);

-- ============================================================================
-- 2. CONTACTS TABLE
-- Customer contact management and segmentation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Contact info
    phone_number TEXT NOT NULL,
    phone_normalized TEXT NOT NULL,  -- E.164 format for deduplication
    name TEXT,
    email TEXT,
    
    -- WhatsApp profile data (from webhook)
    wa_profile_name TEXT,
    wa_profile_picture_url TEXT,
    
    -- Segmentation
    tags JSONB DEFAULT '[]'::jsonb,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    
    -- Opt-in/out tracking
    opted_in BOOLEAN DEFAULT TRUE,
    opted_in_at TIMESTAMPTZ,
    opted_out_at TIMESTAMPTZ,
    
    -- Engagement stats
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    total_messages_received INTEGER DEFAULT 0,
    total_messages_sent INTEGER DEFAULT 0,
    
    -- Link to conversation if exists
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique phone per user
    UNIQUE(user_id, phone_normalized)
);

-- Indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_opted_in ON public.contacts(user_id, opted_in);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON public.contacts(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING GIN(tags);

-- ============================================================================
-- 3. CONTACT LISTS TABLE
-- Static or dynamic contact groups for targeting
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contact_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    description TEXT,
    
    -- Dynamic vs static
    is_dynamic BOOLEAN DEFAULT FALSE,
    filter_criteria JSONB,  -- For dynamic lists: {"tags": ["vip"], "opted_in": true}
    
    -- Stats
    contact_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for static list membership
CREATE TABLE IF NOT EXISTS public.contact_list_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_user ON public.contact_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_members_list ON public.contact_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_list_members_contact ON public.contact_list_members(contact_id);

-- ============================================================================
-- 4. BROADCAST CAMPAIGNS TABLE
-- Bulk messaging campaigns
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    phone_number_id TEXT NOT NULL,  -- Which phone number to send from
    
    -- Campaign details
    name TEXT NOT NULL,
    description TEXT,
    template_id UUID REFERENCES public.whatsapp_message_templates(id) ON DELETE SET NULL,
    
    -- Targeting
    target_type TEXT NOT NULL CHECK (target_type IN ('list', 'segment', 'all')),
    target_list_id UUID REFERENCES public.contact_lists(id) ON DELETE SET NULL,
    target_filters JSONB,  -- For segment targeting
    
    -- Variable mapping: {"1": "name", "2": "order_id"}
    variable_mapping JSONB DEFAULT '{}'::jsonb,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed')
    ),
    
    -- Stats
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Rate limiting
    messages_per_second INTEGER DEFAULT 10,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign recipients tracking
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    phone_number TEXT NOT NULL,
    
    -- Resolved variable values for this recipient
    resolved_variables JSONB DEFAULT '{}'::jsonb,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed')
    ),
    wamid TEXT,  -- WhatsApp message ID when sent
    
    -- Error tracking
    error_code TEXT,
    error_message TEXT,
    
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.broadcast_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.broadcast_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON public.broadcast_campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_wamid ON public.campaign_recipients(wamid);

-- ============================================================================
-- 5. ANALYTICS DAILY TABLE
-- Aggregated daily metrics for dashboard performance
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Message stats
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    messages_delivered INTEGER DEFAULT 0,
    messages_read INTEGER DEFAULT 0,
    messages_failed INTEGER DEFAULT 0,
    
    -- AI stats (complements business_llm_usage)
    ai_replies_generated INTEGER DEFAULT 0,
    ai_tokens_used INTEGER DEFAULT 0,
    
    -- Conversation stats
    conversations_started INTEGER DEFAULT 0,
    conversations_resolved INTEGER DEFAULT 0,
    
    -- Campaign stats
    campaign_messages_sent INTEGER DEFAULT 0,
    campaign_messages_delivered INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON public.analytics_daily(user_id, date DESC);

-- ============================================================================
-- 6. TEAM MEMBERS TABLE
-- For shared team inbox (Phase 2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  -- The team member
    team_owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  -- The business owner
    
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
    permissions JSONB DEFAULT '["view_conversations", "send_messages"]'::jsonb,
    
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
    
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, team_owner_id)
);

-- ============================================================================
-- 7. CONVERSATION NOTES TABLE
-- Internal notes on conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_conversation ON public.conversation_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON public.team_members(team_owner_id);

-- ============================================================================
-- 8. EXTEND CONVERSATIONS TABLE (if columns don't exist)
-- Add columns for team inbox support
-- ============================================================================

-- Note: assigned_to and status already exist in your schema
-- Add additional columns if needed:
DO $$ 
BEGIN
    -- Add priority column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'whatsapp_conversations' 
                   AND column_name = 'priority') THEN
        ALTER TABLE public.whatsapp_conversations 
        ADD COLUMN priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
    END IF;
    
    -- Add assigned_at column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'whatsapp_conversations' 
                   AND column_name = 'assigned_at') THEN
        ALTER TABLE public.whatsapp_conversations 
        ADD COLUMN assigned_at TIMESTAMPTZ;
    END IF;
    
    -- Add tags column for conversation tagging
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'whatsapp_conversations' 
                   AND column_name = 'tags') THEN
        ALTER TABLE public.whatsapp_conversations 
        ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- ============================================================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for new tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'whatsapp_message_templates',
        'contacts',
        'contact_lists',
        'broadcast_campaigns',
        'analytics_daily',
        'team_members',
        'conversation_notes'
    ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON public.%I
                FOR EACH ROW
                EXECUTE FUNCTION public.update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END $$;

-- ============================================================================
-- 10. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

-- Templates: Users can only see their own templates
CREATE POLICY templates_user_policy ON public.whatsapp_message_templates
    FOR ALL USING (user_id = auth.uid());

-- Contacts: Users can only manage their own contacts
CREATE POLICY contacts_user_policy ON public.contacts
    FOR ALL USING (user_id = auth.uid());

-- Contact Lists: Users can only manage their own lists
CREATE POLICY contact_lists_user_policy ON public.contact_lists
    FOR ALL USING (user_id = auth.uid());

-- List Members: Through parent list ownership
CREATE POLICY list_members_policy ON public.contact_list_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.contact_lists cl 
            WHERE cl.id = list_id AND cl.user_id = auth.uid()
        )
    );

-- Campaigns: Users can only manage their own campaigns
CREATE POLICY campaigns_user_policy ON public.broadcast_campaigns
    FOR ALL USING (user_id = auth.uid());

-- Campaign Recipients: Through parent campaign ownership
CREATE POLICY campaign_recipients_policy ON public.campaign_recipients
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.broadcast_campaigns bc 
            WHERE bc.id = campaign_id AND bc.user_id = auth.uid()
        )
    );

-- Analytics: Users can only see their own analytics
CREATE POLICY analytics_user_policy ON public.analytics_daily
    FOR ALL USING (user_id = auth.uid());

-- Team Members: Owner or member can see
CREATE POLICY team_members_policy ON public.team_members
    FOR ALL USING (
        user_id = auth.uid() OR team_owner_id = auth.uid()
    );

-- Conversation Notes: Authors or team members can see
CREATE POLICY notes_policy ON public.conversation_notes
    FOR ALL USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.whatsapp_conversations c
            JOIN public.connected_business_managers bm ON bm.id = c.business_id
            WHERE c.id = conversation_id AND bm.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 11. HELPER FUNCTIONS
-- ============================================================================

-- Function to get contact count for a dynamic list
CREATE OR REPLACE FUNCTION public.get_dynamic_list_count(p_list_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_filter JSONB;
    v_user_id UUID;
    v_count INTEGER;
BEGIN
    SELECT filter_criteria, user_id INTO v_filter, v_user_id
    FROM public.contact_lists
    WHERE id = p_list_id AND is_dynamic = TRUE;
    
    IF v_filter IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Build dynamic query based on filter criteria
    SELECT COUNT(*) INTO v_count
    FROM public.contacts c
    WHERE c.user_id = v_user_id
      AND (v_filter->>'opted_in' IS NULL OR c.opted_in = (v_filter->>'opted_in')::boolean)
      AND (v_filter->'tags' IS NULL OR c.tags ?| ARRAY(SELECT jsonb_array_elements_text(v_filter->'tags')));
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update campaign stats
CREATE OR REPLACE FUNCTION public.update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.broadcast_campaigns
    SET 
        sent_count = (SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = NEW.campaign_id AND status IN ('sent', 'delivered', 'read')),
        delivered_count = (SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = NEW.campaign_id AND status IN ('delivered', 'read')),
        read_count = (SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = NEW.campaign_id AND status = 'read'),
        failed_count = (SELECT COUNT(*) FROM public.campaign_recipients WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
        updated_at = NOW()
    WHERE id = NEW.campaign_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_stats_trigger
    AFTER UPDATE OF status ON public.campaign_recipients
    FOR EACH ROW
    EXECUTE FUNCTION public.update_campaign_stats();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
COMMENT ON TABLE public.whatsapp_message_templates IS 'Stores WhatsApp message templates synced from Meta';
COMMENT ON TABLE public.contacts IS 'Customer contact management with segmentation support';
COMMENT ON TABLE public.contact_lists IS 'Static and dynamic contact groups for targeting';
COMMENT ON TABLE public.broadcast_campaigns IS 'Bulk messaging campaigns';
COMMENT ON TABLE public.analytics_daily IS 'Aggregated daily metrics for dashboard';
COMMENT ON TABLE public.team_members IS 'Team members for shared inbox support';
COMMENT ON TABLE public.conversation_notes IS 'Internal notes on customer conversations';
