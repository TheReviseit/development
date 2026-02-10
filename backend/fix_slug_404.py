"""
Quick Fix Script: Run Migration and Generate Slug
This script will:
1. Run the 031 migration to create the trigger
2. Force regenerate the slug for your business
"""

import os
from supabase import create_client

# Supabase credentials
SUPABASE_URL = "https://zduljgxvissyqlxierql.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_KEY:
    print("❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment")
    print("Please set it in your .env file")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Step 1: Read the migration file
with open("migrations/031_fix_business_slug_update.sql", "r") as f:
    migration_sql = f.read()

print("📝 Running migration 031...")

# Step 2: Execute the migration
try:
    # Note: Supabase Python client doesn't support raw SQL execution directly
    # You need to run this via the Supabase SQL Editor or psql
    print("⚠️  Cannot execute SQL directly via Python client")
    print("Please run the migration manually in Supabase SQL Editor:")
    print("1. Go to: https://zduljgxvissyqlxierql.supabase.co/project/_/sql")
    print("2. Copy the contents of: backend/migrations/031_fix_business_slug_update.sql")
    print("3. Paste and click 'Run'")
    print("")
    input("Press Enter after you've run the migration...")
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)

# Step 3: Get your user ID (from the logs it's DYsTJwhVhjeo9NEf9qNMoR5wh1V2)
USER_ID = "DYsTJwhVhjeo9NEf9qNMoR5wh1V2"

print(f"\n🔍 Checking current slug for user {USER_ID}...")

# Check current business data
result = supabase.table("businesses").select("business_name, url_slug, url_slug_lower").eq("user_id", USER_ID).execute()

if result.data:
    business = result.data[0]
    print(f"   Business Name: {business.get('business_name')}")
    print(f"   Current Slug: {business.get('url_slug')}")
    print(f"   Slug Lower: {business.get('url_slug_lower')}")
else:
    print("❌ No business found for this user")
    exit(1)

# Step 4: Force regenerate slug by setting session variable and updating business_name
print("\n🔄 Forcing slug regeneration...")

try:
    # Set session variable (this won't work via Python client, need direct SQL)
    # Instead, we'll update the slug manually using the same logic
    
    business_name = business.get('business_name', '')
    if not business_name:
        print("❌ No business name found")
        exit(1)
    
    # Generate slug (same logic as trigger)
    import re
    slug = business_name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'^-+|-+$', '', slug)
    slug = slug[:50]
    
    print(f"   Generated slug: {slug}")
    
    # Update the slug directly
    update_result = supabase.table("businesses").update({
        "url_slug": slug,
        "url_slug_lower": slug.lower()
    }).eq("user_id", USER_ID).execute()
    
    print("✅ Slug updated successfully!")
    print(f"\n🎉 Your store is now available at:")
    print(f"   http://localhost:3000/store/{slug}")
    
except Exception as e:
    print(f"❌ Error updating slug: {e}")
    exit(1)
