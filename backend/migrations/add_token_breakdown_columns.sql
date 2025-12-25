-- Migration: Add token breakdown columns to business_llm_usage
-- Run this in Supabase SQL Editor

ALTER TABLE business_llm_usage
ADD COLUMN IF NOT EXISTS input_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS cached_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12,6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_inr NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN business_llm_usage.input_tokens IS 'Cumulative input tokens for billing cycle';
COMMENT ON COLUMN business_llm_usage.output_tokens IS 'Cumulative output tokens for billing cycle';
COMMENT ON COLUMN business_llm_usage.cached_tokens IS 'Cumulative cached tokens for billing cycle';
COMMENT ON COLUMN business_llm_usage.cost_usd IS 'Calculated cost in USD';
COMMENT ON COLUMN business_llm_usage.cost_inr IS 'Calculated cost in INR';
COMMENT ON COLUMN business_llm_usage.model_name IS 'Last used LLM model name';
