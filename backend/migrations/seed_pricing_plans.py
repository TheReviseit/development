"""
Seed Pricing Plans — Initial Data Migration
=============================================
Reads product pricing from config/products.py and inserts into pricing_plans table.

Usage:
    cd backend
    python migrations/seed_pricing_plans.py

Idempotent: Uses upsert-like logic (checks for existing rows before insert).
"""

import os
import sys

# Add backend root to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv()

import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('seed_pricing')


def get_supabase():
    """Get Supabase client."""
    from supabase_client import get_supabase_client
    return get_supabase_client()


def build_pricing_rows():
    """
    Build pricing plan rows from PRODUCT_REGISTRY.
    
    Returns list of dicts ready for Supabase insert.
    """
    from config.products import PRODUCT_REGISTRY
    
    rows = []
    
    for domain_key, product in PRODUCT_REGISTRY.items():
        for tier in product.pricing:
            # Skip plans with missing sandbox Razorpay IDs
            if tier.razorpay_plan_id_sandbox.startswith('MISSING_'):
                logger.warning(
                    f"⚠️  Skipping {domain_key}/{tier.id}: "
                    f"Razorpay sandbox plan ID not configured ({tier.razorpay_plan_id_sandbox})"
                )
                continue
            
            # Build features list
            features = tier.features if tier.features else []
            
            # Build limits dict
            limits = {}
            if tier.limits:
                limits['ai_responses'] = tier.limits.ai_responses
                limits['whatsapp_numbers'] = tier.limits.whatsapp_numbers
                if tier.limits.faqs is not None:
                    limits['faqs'] = tier.limits.faqs
                if tier.limits.products is not None:
                    limits['products'] = tier.limits.products
                if tier.limits.orders is not None:
                    limits['orders'] = tier.limits.orders
                if tier.limits.campaigns is not None:
                    limits['campaigns'] = tier.limits.campaigns
                if tier.limits.campaign_recipients is not None:
                    limits['campaign_recipients'] = tier.limits.campaign_recipients
                if tier.limits.showcase_items is not None:
                    limits['showcase_items'] = tier.limits.showcase_items
                if tier.limits.api_calls is not None:
                    limits['api_calls'] = tier.limits.api_calls
                if tier.limits.api_keys is not None:
                    limits['api_keys'] = tier.limits.api_keys
            
            row = {
                'product_domain': domain_key,
                'plan_slug': tier.id,
                'billing_cycle': tier.interval,
                'amount_paise': tier.price,
                'currency': tier.currency,
                'razorpay_plan_id': tier.razorpay_plan_id_sandbox,  # Legacy column (backwards compat)
                'razorpay_plan_id_sandbox': tier.razorpay_plan_id_sandbox,
                'razorpay_plan_id_production': tier.razorpay_plan_id_production or None,
                'display_name': tier.name,
                'description': tier.description,
                'features_json': features,
                'limits_json': limits,
                'pricing_version': 1,
                'is_active': True,
            }
            rows.append(row)
            logger.info(
                f"  → {domain_key}/{tier.id}: "
                f"₹{tier.price // 100:,} ({tier.currency}/{tier.interval})"
            )
    
    return rows


def seed():
    """Seed pricing_plans table."""
    logger.info("=" * 60)
    logger.info("🌱 Seeding pricing_plans table")
    logger.info("=" * 60)
    
    supabase = get_supabase()
    rows = build_pricing_rows()
    
    if not rows:
        logger.error("❌ No pricing rows to seed. Check PRODUCT_REGISTRY and env vars.")
        return False
    
    logger.info(f"\n📦 Inserting {len(rows)} pricing plans...")
    
    inserted = 0
    skipped = 0
    
    for row in rows:
        # Check if row already exists (idempotent)
        existing = supabase.table('pricing_plans').select('id').match({
            'product_domain': row['product_domain'],
            'plan_slug': row['plan_slug'],
            'billing_cycle': row['billing_cycle'],
            'pricing_version': row['pricing_version'],
        }).execute()
        
        if existing.data:
            logger.info(
                f"  ⏭️  {row['product_domain']}/{row['plan_slug']} v{row['pricing_version']} "
                f"— already exists, skipping"
            )
            skipped += 1
            continue
        
        try:
            supabase.table('pricing_plans').insert(row).execute()
            inserted += 1
            logger.info(
                f"  ✅ {row['product_domain']}/{row['plan_slug']} v{row['pricing_version']} "
                f"— inserted"
            )
        except Exception as e:
            logger.error(f"  ❌ Failed to insert {row['product_domain']}/{row['plan_slug']}: {e}")
    
    logger.info(f"\n{'=' * 60}")
    logger.info(f"✅ Seeding complete: {inserted} inserted, {skipped} skipped")
    logger.info(f"{'=' * 60}")
    
    return True


# Console billing plans (separate product: 'api' / console)
def seed_console_plans():
    """Seed console/API plans from console_billing.py config."""
    logger.info("\n🌱 Seeding console (API) pricing plans...")
    
    supabase = get_supabase()
    
    console_plans = [
        {
            'product_domain': 'api',
            'plan_slug': 'starter',
            'billing_cycle': 'monthly',
            'amount_paise': 79900,
            'currency': 'INR',
            'razorpay_plan_id': os.getenv('RAZORPAY_PLAN_CONSOLE_STARTER', os.getenv('RAZORPAY_PLAN_STARTER', '')),
            'razorpay_plan_id_sandbox': os.getenv('RAZORPAY_PLAN_CONSOLE_STARTER', os.getenv('RAZORPAY_PLAN_STARTER', '')),
            'razorpay_plan_id_production': os.getenv('RAZORPAY_LIVE_PLAN_CONSOLE_STARTER', ''),
            'display_name': 'Starter',
            'description': 'Live OTP API access',
            'features_json': [
                "Live OTP API access",
                "WhatsApp OTPs at ₹0.75/OTP",
                "Standard API latency",
                "1 Webhook integration",
                "Basic usage analytics",
                "Email support",
                "Secure API keys & console access",
            ],
            'limits_json': {'api_calls': 10000, 'webhooks': 1},
            'pricing_version': 1,
            'is_active': True,
        },
        {
            'product_domain': 'api',
            'plan_slug': 'growth',
            'billing_cycle': 'monthly',
            'amount_paise': 199900,
            'currency': 'INR',
            'razorpay_plan_id': os.getenv('RAZORPAY_PLAN_CONSOLE_GROWTH', os.getenv('RAZORPAY_PLAN_BUSINESS', '')),
            'razorpay_plan_id_sandbox': os.getenv('RAZORPAY_PLAN_CONSOLE_GROWTH', os.getenv('RAZORPAY_PLAN_BUSINESS', '')),
            'razorpay_plan_id_production': os.getenv('RAZORPAY_LIVE_PLAN_CONSOLE_GROWTH', ''),
            'display_name': 'Growth',
            'description': 'For professional API usage',
            'features_json': [
                "WhatsApp OTPs at ₹0.60/OTP",
                "Priority API routing (lower latency)",
                "Unlimited webhooks",
                "Production-grade API keys",
                "Advanced analytics dashboard",
                "Priority chat support",
            ],
            'limits_json': {'api_calls': 100000, 'webhooks': -1},
            'pricing_version': 1,
            'is_active': True,
        },
    ]
    
    inserted = 0
    for plan in console_plans:
        if not plan['razorpay_plan_id']:
            logger.warning(f"  ⚠️  Skipping api/{plan['plan_slug']}: no Razorpay plan ID")
            continue
        
        existing = supabase.table('pricing_plans').select('id').match({
            'product_domain': plan['product_domain'],
            'plan_slug': plan['plan_slug'],
            'billing_cycle': plan['billing_cycle'],
            'pricing_version': plan['pricing_version'],
        }).execute()
        
        if existing.data:
            logger.info(f"  ⏭️  api/{plan['plan_slug']} — already exists")
            continue
        
        try:
            supabase.table('pricing_plans').insert(plan).execute()
            inserted += 1
            logger.info(f"  ✅ api/{plan['plan_slug']} — inserted")
        except Exception as e:
            logger.error(f"  ❌ Failed: api/{plan['plan_slug']}: {e}")
    
    logger.info(f"  Console plans: {inserted} inserted")


if __name__ == '__main__':
    success = seed()
    if success:
        seed_console_plans()
    
    logger.info("\n🏁 Done!")
