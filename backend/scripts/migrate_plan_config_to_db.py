"""
Migrate Plan Configuration to Database
=======================================
Migrates hardcoded plan configuration from Python to database tables.

Migrates:
  1. CONSOLE_TIER_META dict → plan_metadata table
  2. PLAN_TIER_ORDER list → plan_metadata.tier_level

Run after migration 042.

Usage:
    python backend/scripts/migrate_plan_config_to_db.py
"""

import os
import sys
from supabase import create_client, Client

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Supabase credentials (from environment)
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# =============================================================================
# Hardcoded Configuration (from console_billing.py)
# =============================================================================

CONSOLE_TIER_META = {
    'starter': {'tier': 0, 'tagline': 'Get Started', 'trial_days': 0},
    'growth': {'tier': 1, 'tagline': 'Most Popular', 'trial_days': 0},
    'business': {'tier': 1, 'tagline': 'Best Value', 'trial_days': 0},  # Alias for growth
    'pro': {'tier': 2, 'tagline': 'Power Users', 'trial_days': 0},
    'enterprise': {'tier': 2, 'tagline': 'Contact Sales', 'trial_days': 0, 'requires_sales_call': True},
}

# =============================================================================
# Migration Logic
# =============================================================================

def migrate_plan_metadata():
    """Migrate CONSOLE_TIER_META dict to plan_metadata table."""
    print("Migrating plan metadata to database...")

    migrated_count = 0
    skipped_count = 0

    for plan_slug, meta in CONSOLE_TIER_META.items():
        try:
            # Get plan ID from pricing_plans table
            plan_result = supabase.table('pricing_plans').select('id').eq('plan_slug', plan_slug).limit(1).execute()

            if not plan_result.data:
                print(f"⚠️  Plan '{plan_slug}' not found in pricing_plans table (skipped)")
                skipped_count += 1
                continue

            plan_id = plan_result.data[0]['id']

            # Upsert plan_metadata
            metadata = {
                'plan_id': plan_id,
                'tier_level': meta['tier'],
                'tagline': meta.get('tagline'),
                'trial_days': meta.get('trial_days', 0),
                'requires_sales_call': meta.get('requires_sales_call', False),
            }

            supabase.table('plan_metadata').upsert(metadata).execute()
            print(f"✅ Migrated {plan_slug} → tier_level={meta['tier']}")
            migrated_count += 1

        except Exception as e:
            print(f"❌ Failed to migrate {plan_slug}: {e}")

    print(f"\n✅ Migration complete: {migrated_count} plans migrated, {skipped_count} skipped")


def verify_migration():
    """Verify migration was successful."""
    print("\nVerifying migration...")

    result = supabase.table('plan_metadata').select('*').execute()
    metadata_rows = result.data

    print(f"\n📊 plan_metadata table: {len(metadata_rows)} rows")
    for row in metadata_rows:
        # Get plan name
        plan_result = supabase.table('pricing_plans').select('plan_slug').eq('id', row['plan_id']).single().execute()
        plan_slug = plan_result.data['plan_slug'] if plan_result.data else 'unknown'

        print(f"  - {plan_slug}: tier={row['tier_level']}, tagline={row.get('tagline')}, sales_call={row.get('requires_sales_call')}")


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    print("=" * 70)
    print("Migrate Plan Configuration to Database")
    print("=" * 70)
    print()

    migrate_plan_metadata()
    verify_migration()

    print()
    print("Next steps:")
    print("  1. Update console_billing.py to read from plan_metadata")
    print("  2. Remove hardcoded CONSOLE_TIER_META dict")
    print("  3. Test plan tier logic")
