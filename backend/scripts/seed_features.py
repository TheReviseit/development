"""
Seed Plan Features — Single Source of Truth
============================================
Seeds all feature limits for each plan tier per product domain.

MUST match frontend/lib/product/registry.ts pricing card values.

Shop Domain Limits:
  Starter:  10 products, 1000 AI, 10 email invoices, 30 FAQs
  Business: 50 products, 5000 AI, 50 email invoices, 100 FAQs
  Pro:     100 products, 15000 AI, 100 email invoices, unlimited FAQs
"""

import logging
import os
from supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('seed_features')


def seed_plan_features():
    supabase = get_supabase_client()

    # 1. Get all pricing plans — column is 'plan_slug', NOT 'slug'
    plans = supabase.table('pricing_plans').select('id, plan_slug, product_domain').execute()
    if not plans.data:
        logger.error("No pricing plans found in database.")
        return

    # Build a map: (product_domain, plan_slug) → plan_id
    # This handles multiple domains (shop, dashboard, etc.) correctly
    plan_map = {}
    for p in plans.data:
        key = (p.get('product_domain', 'shop'), p['plan_slug'])
        plan_map[key] = p['id']

    logger.info(f"Found plans: {list(plan_map.keys())}")

    # =========================================================================
    # 2. Define features per (domain, plan_slug)
    # 
    # CRITICAL: These limits MUST match frontend/lib/product/registry.ts
    #   Starter:  products=10,  aiResponses=1000,  faqs=30
    #   Business: products=50,  aiResponses=5000,  faqs=100
    #   Pro:      products=100, aiResponses=15000, faqs=unlimited
    # =========================================================================

    shop_features = {
        'starter': [
            {'feature_key': 'create_product',      'hard_limit': 10,    'soft_limit': 8,     'is_unlimited': False},
            {'feature_key': 'ai_responses',         'hard_limit': 1000,  'soft_limit': 800,   'is_unlimited': False},
            {'feature_key': 'email_invoices',        'hard_limit': 10,    'soft_limit': 8,     'is_unlimited': False},
            {'feature_key': 'live_order_updates',    'hard_limit': 10,    'soft_limit': 8,     'is_unlimited': False},
            {'feature_key': 'message_history_days',  'hard_limit': 10,    'soft_limit': 8,     'is_unlimited': False},
            {'feature_key': 'faqs',                  'hard_limit': 30,    'soft_limit': 24,    'is_unlimited': False},
            # Boolean features blocked on starter
            {'feature_key': 'custom_domain',         'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'invoice_customization', 'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'advanced_analytics',    'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'google_sheets_sync',    'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'template_builder',      'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'webhooks',              'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'white_label',           'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'priority_support',      'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'api_access',            'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'multi_staff',           'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'campaign_sends',        'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'bulk_messaging',        'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            # Boolean features available on all plans (null = no limit)
            {'feature_key': 'otp_send',              'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'sandbox_mode',          'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'live_api_keys',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'basic_analytics',       'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'contact_management',    'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'order_management',      'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'message_inbox',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'store_preview',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
        ],
        'business': [
            {'feature_key': 'create_product',       'hard_limit': 50,    'soft_limit': 40,    'is_unlimited': False},
            {'feature_key': 'ai_responses',          'hard_limit': 5000,  'soft_limit': 4000,  'is_unlimited': False},
            {'feature_key': 'email_invoices',        'hard_limit': 50,    'soft_limit': 40,    'is_unlimited': False},
            {'feature_key': 'live_order_updates',    'hard_limit': 50,    'soft_limit': 40,    'is_unlimited': False},
            {'feature_key': 'message_history_days',  'hard_limit': 50,    'soft_limit': 40,    'is_unlimited': False},
            {'feature_key': 'faqs',                  'hard_limit': 100,   'soft_limit': 80,    'is_unlimited': False},
            # Boolean features unlocked on business
            {'feature_key': 'custom_domain',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'invoice_customization', 'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'advanced_analytics',    'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'google_sheets_sync',    'hard_limit': 50,    'soft_limit': 40,    'is_unlimited': False},
            {'feature_key': 'template_builder',      'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'webhooks',              'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'white_label',           'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'priority_support',      'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'api_access',            'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'multi_staff',           'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'campaign_sends',        'hard_limit': 0,     'soft_limit': 0,     'is_unlimited': False},
            {'feature_key': 'bulk_messaging',        'hard_limit': 1000,  'soft_limit': 800,   'is_unlimited': False},
            # Common features
            {'feature_key': 'otp_send',              'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'sandbox_mode',          'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'live_api_keys',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'basic_analytics',       'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'contact_management',    'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'order_management',      'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'message_inbox',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'store_preview',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
        ],
        'pro': [
            {'feature_key': 'create_product',       'hard_limit': 100,   'soft_limit': 80,    'is_unlimited': False},
            {'feature_key': 'ai_responses',          'hard_limit': 15000, 'soft_limit': 12000, 'is_unlimited': False},
            {'feature_key': 'email_invoices',        'hard_limit': 100,   'soft_limit': 80,    'is_unlimited': False},
            {'feature_key': 'live_order_updates',    'hard_limit': 100,   'soft_limit': 80,    'is_unlimited': False},
            {'feature_key': 'message_history_days',  'hard_limit': None,  'soft_limit': None,  'is_unlimited': True},
            {'feature_key': 'faqs',                  'hard_limit': None,  'soft_limit': None,  'is_unlimited': True},
            # All boolean features unlocked on pro
            {'feature_key': 'custom_domain',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'invoice_customization', 'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'advanced_analytics',    'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'google_sheets_sync',    'hard_limit': None,  'soft_limit': None,  'is_unlimited': True},
            {'feature_key': 'template_builder',      'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'webhooks',              'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'white_label',           'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'priority_support',      'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'api_access',            'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'multi_staff',           'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'campaign_sends',        'hard_limit': None,  'soft_limit': None,  'is_unlimited': True},
            {'feature_key': 'bulk_messaging',        'hard_limit': None,  'soft_limit': None,  'is_unlimited': True},
            # Common features
            {'feature_key': 'otp_send',              'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'sandbox_mode',          'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'live_api_keys',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'basic_analytics',       'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'contact_management',    'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'order_management',      'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'message_inbox',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
            {'feature_key': 'store_preview',         'hard_limit': None,  'soft_limit': None,  'is_unlimited': False},
        ],
    }

    # 3. Build insert list
    to_insert = []
    
    for plan_slug, feat_list in shop_features.items():
        key = ('shop', plan_slug)
        if key not in plan_map:
            logger.warning(f"Plan not found: domain=shop, slug={plan_slug}")
            continue
            
        plan_id = plan_map[key]
        for f in feat_list:
            to_insert.append({
                'plan_id': plan_id,
                **f,
            })

    if to_insert:
        # Upsert on (plan_id, feature_key) — updates limits if they already exist
        result = supabase.table('plan_features').upsert(
            to_insert,
            on_conflict='plan_id,feature_key'
        ).execute()
        logger.info(f"✅ Seeded {len(to_insert)} plan feature records for shop domain.")
    else:
        logger.warning("⚠️  No features to seed — check pricing_plans table has plan_slug column.")


if __name__ == "__main__":
    seed_plan_features()
