-- =============================================================================
-- PRODUCT SUBSCRIPTIONS TABLE
-- =============================================================================
-- Tracks which product domains (shop, marketing, showcase, api) each user
-- has subscribed to. The 'dashboard' domain is implicitly granted to all users.
--
-- IMPORTANT: user_id is TEXT (not UUID FK) to support both auth systems:
--   - Firebase-based `users` table (frontend signup)
--   - Console-based `otp_console_users` table (backend signup)
--
-- Enterprise Design Principles:
--   1. UNIQUE constraint on (user_id, product_domain) — one sub per product
--   2. Immutable audit trail via created_at
--   3. Soft state management via status enum (never hard-delete rows)
--   4. org_id for multi-tenant query patterns
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_subscriptions (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id         TEXT NOT NULL,
    org_id          TEXT NOT NULL,
    product_domain  TEXT NOT NULL CHECK (product_domain IN ('shop', 'marketing', 'showcase', 'api')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'trial', 'expired')),
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,              -- NULL = never expires
    metadata        JSONB DEFAULT '{}'::jsonb, -- Extensible: plan tier, referral source, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One subscription per user per product domain
    CONSTRAINT uq_user_product_domain UNIQUE (user_id, product_domain)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary lookup: "what domains does this user have?"
CREATE INDEX IF NOT EXISTS idx_product_subs_user_id
    ON product_subscriptions(user_id)
    WHERE status IN ('active', 'trial');

-- Org-level lookup: "what products does this org use?"
CREATE INDEX IF NOT EXISTS idx_product_subs_org_domain
    ON product_subscriptions(org_id, product_domain);

-- Admin: find all expired subscriptions for cleanup
CREATE INDEX IF NOT EXISTS idx_product_subs_status
    ON product_subscriptions(status)
    WHERE status NOT IN ('active', 'trial');

-- =============================================================================
-- AUTO-UPDATE updated_at TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_product_subs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_subs_updated_at ON product_subscriptions;
CREATE TRIGGER trg_product_subs_updated_at
    BEFORE UPDATE ON product_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_product_subs_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE product_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend API)
CREATE POLICY "service_role_all" ON product_subscriptions
    FOR ALL
    USING (true)
    WITH CHECK (true);
