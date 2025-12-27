-- Bulk Message Campaigns Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- Table: bulk_campaigns
-- ============================================
CREATE TABLE IF NOT EXISTS bulk_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  
  -- Message content
  message_text TEXT,
  media_url TEXT,
  media_type VARCHAR(50) CHECK (media_type IN ('image', 'video', 'document', 'audio', NULL)),
  
  -- Stats
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bulk_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own campaigns"
  ON bulk_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON bulk_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON bulk_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON bulk_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_user ON bulk_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_status ON bulk_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_created ON bulk_campaigns(created_at DESC);

-- ============================================
-- Table: campaign_contacts
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bulk_campaigns(id) ON DELETE CASCADE,
  phone VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  variables JSONB DEFAULT '{}',
  
  -- Message status for this contact
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  wamid VARCHAR(255),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (inherit from parent campaign)
CREATE POLICY "Users can view own campaign contacts"
  ON campaign_contacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM bulk_campaigns 
    WHERE bulk_campaigns.id = campaign_contacts.campaign_id 
    AND bulk_campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own campaign contacts"
  ON campaign_contacts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM bulk_campaigns 
    WHERE bulk_campaigns.id = campaign_contacts.campaign_id 
    AND bulk_campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own campaign contacts"
  ON campaign_contacts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM bulk_campaigns 
    WHERE bulk_campaigns.id = campaign_contacts.campaign_id 
    AND bulk_campaigns.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own campaign contacts"
  ON campaign_contacts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM bulk_campaigns 
    WHERE bulk_campaigns.id = campaign_contacts.campaign_id 
    AND bulk_campaigns.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(status);

-- ============================================
-- Function: Update campaign stats
-- ============================================
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update total_contacts count in bulk_campaigns
  UPDATE bulk_campaigns
  SET 
    total_contacts = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)),
    sent_count = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id) AND status IN ('sent', 'delivered', 'read')),
    delivered_count = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id) AND status IN ('delivered', 'read')),
    read_count = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id) AND status = 'read'),
    failed_count = (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id) AND status = 'failed'),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.campaign_id, OLD.campaign_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update stats
DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON campaign_contacts;
CREATE TRIGGER trigger_update_campaign_stats
  AFTER INSERT OR UPDATE OR DELETE ON campaign_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_stats();

-- ============================================
-- Function: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for bulk_campaigns
DROP TRIGGER IF EXISTS trigger_bulk_campaigns_updated ON bulk_campaigns;
CREATE TRIGGER trigger_bulk_campaigns_updated
  BEFORE UPDATE ON bulk_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
