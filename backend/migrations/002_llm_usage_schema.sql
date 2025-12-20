-- ============================================================================
-- ReviseIt LLM Usage Tracking Schema
-- Version: 2.0
-- Updated: 2025-12-20
-- Exchange Rate: 1 USD = ₹89.58
-- ============================================================================

-- ============================================================================
-- 1. ENHANCED BUSINESS LLM USAGE TABLE
-- ============================================================================
-- This table already exists, so we'll add new columns

ALTER TABLE public.business_llm_usage
ADD COLUMN IF NOT EXISTS input_tokens_used integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens_used integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cached_tokens_used integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_cost_usd decimal(10,4) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS estimated_cost_inr decimal(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS plan_id text DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS last_reset_at timestamp with time zone DEFAULT now();

-- Add comments for documentation
COMMENT ON COLUMN business_llm_usage.input_tokens_used IS 'Input tokens consumed (charged at $0.15/1M)';
COMMENT ON COLUMN business_llm_usage.output_tokens_used IS 'Output tokens consumed (charged at $0.60/1M)';
COMMENT ON COLUMN business_llm_usage.cached_tokens_used IS 'Cached input tokens (charged at $0.075/1M)';
COMMENT ON COLUMN business_llm_usage.estimated_cost_usd IS 'Estimated LLM cost in USD for current billing cycle';
COMMENT ON COLUMN business_llm_usage.estimated_cost_inr IS 'Estimated LLM cost in INR (USD * 89.58)';
COMMENT ON COLUMN business_llm_usage.plan_id IS 'Subscription plan: starter, growth, or pro';

-- ============================================================================
-- 2. PLANS CONFIGURATION TABLE (NEW)
-- ============================================================================
-- Store plan configurations in database for easy updates

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id text UNIQUE NOT NULL,
    plan_name text NOT NULL,
    
    -- Pricing
    monthly_price_inr decimal(10,2) NOT NULL,
    annual_price_inr decimal(10,2),  -- Optional annual pricing
    
    -- Token Limits
    monthly_token_limit integer NOT NULL,
    input_token_limit integer NOT NULL,
    output_token_limit integer NOT NULL,
    
    -- Reply Limits
    max_replies_per_month integer NOT NULL,
    avg_tokens_per_reply integer DEFAULT 1600,
    
    -- Cost Estimates (based on GPT-4o mini @ $0.15/$0.60 per 1M tokens)
    avg_cost_per_reply_inr decimal(10,4) DEFAULT 0.036,
    estimated_monthly_llm_cost_inr decimal(10,2),
    
    -- Rate Limits
    rate_limit_per_minute integer DEFAULT 10,
    rate_limit_per_hour integer DEFAULT 100,
    ai_calls_per_day integer DEFAULT 500,
    
    -- Feature Flags
    conversation_history_limit integer DEFAULT 5,
    cache_ttl_seconds integer DEFAULT 300,
    function_calling_enabled boolean DEFAULT true,
    multi_language_enabled boolean DEFAULT true,
    analytics_enabled boolean DEFAULT true,
    priority_support boolean DEFAULT false,
    custom_training_enabled boolean DEFAULT false,
    
    -- Metadata
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ============================================================================
-- 3. INSERT DEFAULT PLANS
-- ============================================================================

INSERT INTO public.subscription_plans (
    plan_id, plan_name, monthly_price_inr, annual_price_inr,
    monthly_token_limit, input_token_limit, output_token_limit,
    max_replies_per_month, avg_tokens_per_reply, avg_cost_per_reply_inr,
    estimated_monthly_llm_cost_inr,
    rate_limit_per_minute, rate_limit_per_hour, ai_calls_per_day,
    conversation_history_limit, cache_ttl_seconds,
    function_calling_enabled, multi_language_enabled, analytics_enabled,
    priority_support, custom_training_enabled
) VALUES 
-- Starter Plan: ₹1,499/month
(
    'starter', 'Starter', 1499.00, 14990.00,
    1600000, 1000000, 600000,    -- 1.6M total, 1M input, 600K output
    1000, 1600, 0.036,
    36.00,                        -- ₹36 estimated monthly LLM cost
    10, 100, 500,                 -- Rate limits
    5, 300,                       -- 5 message history, 5 min cache
    true, false, true,            -- Basic features
    false, false                  -- No priority support or custom training
),
-- Growth Plan: ₹2,999/month
(
    'growth', 'Growth', 2999.00, 29990.00,
    4800000, 3000000, 1800000,   -- 4.8M total, 3M input, 1.8M output
    3000, 1600, 0.036,
    108.00,                       -- ₹108 estimated monthly LLM cost
    30, 500, 2000,                -- Higher rate limits
    10, 600,                      -- 10 message history, 10 min cache
    true, true, true,             -- Advanced features
    true, false                   -- Priority support, no custom training
),
-- Pro Plan: ₹5,999/month
(
    'pro', 'Pro', 5999.00, 59990.00,
    12800000, 8000000, 4800000,  -- 12.8M total, 8M input, 4.8M output
    8000, 1600, 0.036,
    288.00,                       -- ₹288 estimated monthly LLM cost
    100, 2000, 10000,             -- Highest rate limits
    20, 900,                      -- 20 message history, 15 min cache
    true, true, true,             -- All features
    true, true                    -- Priority support + custom training
)
ON CONFLICT (plan_id) DO UPDATE SET
    monthly_price_inr = EXCLUDED.monthly_price_inr,
    annual_price_inr = EXCLUDED.annual_price_inr,
    monthly_token_limit = EXCLUDED.monthly_token_limit,
    input_token_limit = EXCLUDED.input_token_limit,
    output_token_limit = EXCLUDED.output_token_limit,
    max_replies_per_month = EXCLUDED.max_replies_per_month,
    estimated_monthly_llm_cost_inr = EXCLUDED.estimated_monthly_llm_cost_inr,
    rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
    rate_limit_per_hour = EXCLUDED.rate_limit_per_hour,
    updated_at = now();

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_business_llm_usage_business_id 
ON business_llm_usage(business_id);

CREATE INDEX IF NOT EXISTS idx_business_llm_usage_billing_cycle 
ON business_llm_usage(billing_cycle_start, billing_cycle_end);

CREATE INDEX IF NOT EXISTS idx_business_llm_usage_plan 
ON business_llm_usage(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_id 
ON subscription_plans(plan_id);

-- ============================================================================
-- 5. USAGE HISTORY TABLE (FOR ANALYTICS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.llm_usage_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid REFERENCES connected_business_managers(id),
    
    -- Usage snapshot
    tokens_used integer NOT NULL,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    replies_count integer DEFAULT 0,
    
    -- Cost snapshot
    cost_usd decimal(10,4) DEFAULT 0.00,
    cost_inr decimal(10,2) DEFAULT 0.00,
    
    -- Period
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    period_type text DEFAULT 'daily',  -- daily, weekly, monthly
    
    -- Metadata
    plan_id text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_history_business 
ON llm_usage_history(business_id, period_start);

-- ============================================================================
-- 6. FUNCTION: Calculate LLM Cost
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_llm_cost(
    p_input_tokens integer,
    p_output_tokens integer,
    p_cached_tokens integer DEFAULT 0
) RETURNS TABLE (cost_usd decimal, cost_inr decimal) AS $$
DECLARE
    v_input_cost decimal;
    v_output_cost decimal;
    v_cached_cost decimal;
    v_total_usd decimal;
    v_usd_to_inr decimal := 89.58;
BEGIN
    -- GPT-4o mini pricing (per 1M tokens)
    -- Input: $0.15, Output: $0.60, Cached: $0.075
    
    v_input_cost := (p_input_tokens::decimal / 1000000) * 0.15;
    v_output_cost := (p_output_tokens::decimal / 1000000) * 0.60;
    v_cached_cost := (p_cached_tokens::decimal / 1000000) * 0.075;
    
    v_total_usd := v_input_cost + v_output_cost + v_cached_cost;
    
    RETURN QUERY SELECT 
        ROUND(v_total_usd, 4) as cost_usd,
        ROUND(v_total_usd * v_usd_to_inr, 2) as cost_inr;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNCTION: Reset Monthly Usage
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_monthly_usage(p_business_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE business_llm_usage
    SET 
        monthly_tokens_used = 0,
        monthly_llm_replies = 0,
        input_tokens_used = 0,
        output_tokens_used = 0,
        cached_tokens_used = 0,
        estimated_cost_usd = 0,
        estimated_cost_inr = 0,
        billing_cycle_start = now(),
        billing_cycle_end = now() + interval '30 days',
        last_reset_at = now()
    WHERE business_id = p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGER: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 9. VIEW: Business Usage Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_business_usage_dashboard AS
SELECT 
    bu.business_id,
    bm.business_name,
    bu.plan_id,
    sp.plan_name,
    sp.monthly_price_inr,
    
    -- Token Usage
    bu.monthly_tokens_used as tokens_used,
    sp.monthly_token_limit as tokens_limit,
    ROUND((bu.monthly_tokens_used::decimal / NULLIF(sp.monthly_token_limit, 0)) * 100, 1) as tokens_percent,
    
    -- Input/Output breakdown
    bu.input_tokens_used,
    bu.output_tokens_used,
    bu.cached_tokens_used,
    
    -- Reply Usage
    bu.monthly_llm_replies as replies_used,
    sp.max_replies_per_month as replies_limit,
    ROUND((bu.monthly_llm_replies::decimal / NULLIF(sp.max_replies_per_month, 0)) * 100, 1) as replies_percent,
    
    -- Costs
    bu.estimated_cost_usd,
    bu.estimated_cost_inr,
    sp.estimated_monthly_llm_cost_inr as budgeted_cost_inr,
    
    -- Profitability
    sp.monthly_price_inr - bu.estimated_cost_inr as gross_profit_inr,
    ROUND(((sp.monthly_price_inr - bu.estimated_cost_inr) / sp.monthly_price_inr) * 100, 1) as profit_margin_percent,
    
    -- Billing Cycle
    bu.billing_cycle_start,
    bu.billing_cycle_end,
    EXTRACT(DAY FROM (bu.billing_cycle_end - now())) as days_remaining
    
FROM business_llm_usage bu
LEFT JOIN connected_business_managers bm ON bu.business_id = bm.id
LEFT JOIN subscription_plans sp ON bu.plan_id = sp.plan_id;

-- ============================================================================
-- 10. SAMPLE QUERIES
-- ============================================================================

-- Get usage for a specific business
-- SELECT * FROM v_business_usage_dashboard WHERE business_id = 'your-business-id';

-- Check which businesses are near their limit (>80%)
-- SELECT * FROM v_business_usage_dashboard WHERE tokens_percent > 80 OR replies_percent > 80;

-- Calculate cost for token usage
-- SELECT * FROM calculate_llm_cost(100000, 50000, 20000);

-- Get plan details
-- SELECT * FROM subscription_plans WHERE is_active = true;

-- Reset a business's monthly usage
-- SELECT reset_monthly_usage('your-business-id');

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================

-- Summary of tables:
-- 1. business_llm_usage (enhanced) - Tracks monthly usage per business
-- 2. subscription_plans (new) - Stores plan configurations
-- 3. llm_usage_history (new) - Historical usage for analytics

-- Summary of functions:
-- 1. calculate_llm_cost() - Calculate USD/INR cost from tokens
-- 2. reset_monthly_usage() - Reset counters for new billing cycle

-- Summary of views:
-- 1. v_business_usage_dashboard - Combined view for dashboards
