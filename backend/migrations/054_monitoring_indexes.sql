-- ============================================================================
-- 054: Monitoring System Indexes & Columns
-- ============================================================================
-- Ensures business_llm_usage has all columns needed by the monitoring service
-- and adds performance indexes for admin monitoring queries.
-- ============================================================================

-- Add model_name column if not present (used by monitoring service)
ALTER TABLE public.business_llm_usage
ADD COLUMN IF NOT EXISTS model_name text DEFAULT 'gemini-2.5-flash';

-- Composite index for monitoring aggregation queries
CREATE INDEX IF NOT EXISTS idx_business_llm_usage_model_cost
ON business_llm_usage(model_name, cost_usd DESC);

-- Index for top-consumer queries
CREATE INDEX IF NOT EXISTS idx_business_llm_usage_cost_desc
ON business_llm_usage(cost_usd DESC NULLS LAST);

-- Index for analytics_daily date range scans (monitoring trends)
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date
ON analytics_daily(date DESC);

-- Composite index for analytics_daily aggregation
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date_metrics
ON analytics_daily(date, messages_sent, ai_replies_generated, ai_tokens_used);

-- ============================================================================
-- Materialized view for fast platform-wide stats (optional, for 100k+ scale)
-- Refresh via cron or background job every 5 minutes.
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_platform_ai_stats AS
SELECT
    count(*) as total_businesses,
    sum(monthly_tokens_used) as total_tokens,
    sum(input_tokens) as total_input_tokens,
    sum(output_tokens) as total_output_tokens,
    sum(cached_tokens) as total_cached_tokens,
    sum(cost_usd) as total_cost_usd,
    sum(cost_inr) as total_cost_inr,
    sum(monthly_llm_replies) as total_replies,
    now() as refreshed_at
FROM business_llm_usage;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_platform_ai_stats_single
ON mv_platform_ai_stats((1));

-- Function to refresh materialized view (call from cron or background job)
CREATE OR REPLACE FUNCTION refresh_platform_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_platform_ai_stats;
END;
$$ LANGUAGE plpgsql;
