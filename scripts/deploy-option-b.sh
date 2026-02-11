#!/bin/bash

###############################################################################
# Enterprise SaaS Auth Re-Architecture — Deployment Validation Script
# Standard: Google Workspace / Zoho One Deployment Process
# 
# Purpose: Validate database migration and system health before production
###############################################################################

set -e  # Exit on error

echo "=================================================="
echo "🚀 Option B Deployment Validation"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

#===============================================================================
# SECTION 1: PRE-DEPLOYMENT CHECKS
#===============================================================================

echo "📋 PRE-DEPLOYMENT CHECKS"
echo "--------------------------------------------------"

# Check Supabase connection
echo -n "🔌 Checking Supabase connection... "
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}✗ FAILED${NC}"
  echo "   ERROR: Supabase environment variables not set"
  exit 1
fi
echo -e "${GREEN}✓ OK${NC}"

# Check Firebase Admin SDK
echo -n "🔥 Checking Firebase Admin SDK... "
if [ -z "$FIREBASE_ADMIN_CREDENTIALS" ] && [ -z "$FIREBASE_PROJECT_ID" ]; then
  echo -e "${RED}✗ FAILED${NC}"
  echo "   ERROR: Firebase Admin credentials not configured"
  exit 1
fi
echo -e "${GREEN}✓ OK${NC}"

# Check migration file exists
echo -n "📄 Checking migration file exists... "
MIGRATION_FILE="backend/migrations/032_create_user_products_option_b.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo -e "${RED}✗ FAILED${NC}"
  echo "   ERROR: Migration file not found: $MIGRATION_FILE"
  exit 1
fi
echo -e "${GREEN}✓ OK${NC}"

# Check rollback script exists
echo -n "🔄 Checking rollback script exists... "
ROLLBACK_FILE="backend/migrations/032_rollback_user_products.sql"
if [ ! -f "$ROLLBACK_FILE" ]; then
  echo -e "${RED}✗ FAILED${NC}"
  echo "   ERROR: Rollback file not found: $ROLLBACK_FILE"
  exit 1
fi
echo -e "${GREEN}✓ OK${NC}"

echo ""

#===============================================================================
# SECTION 2: DATABASE MIGRATION
#===============================================================================

echo "💾 DATABASE MIGRATION"
echo "--------------------------------------------------"

echo "⚠️  WARNING: About to run database migration!"
echo "   This will:"
echo "   - Create user_products table"
echo "   - Create product_activation_logs table"
echo "   - Backfill existing users with dashboard + inferred memberships"
echo ""
read -p "Continue with migration? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo -e "${YELLOW}Migration cancelled by user${NC}"
  exit 0
fi

echo ""
echo -n "🔧 Running migration... "

# Execute migration using Supabase CLI or psql
if command -v supabase &> /dev/null; then
  supabase db push --file "$MIGRATION_FILE" 2>&1 | tee migration.log
  MIGRATION_STATUS=$?
else
  echo -e "${YELLOW}⚠ Supabase CLI not found, using psql...${NC}"
  psql "$DATABASE_URL" -f "$MIGRATION_FILE" 2>&1 | tee migration.log
  MIGRATION_STATUS=$?
fi

if [ $MIGRATION_STATUS -eq 0 ]; then
  echo -e "${GREEN}✓ Migration completed successfully${NC}"
else
  echo -e "${RED}✗ Migration FAILED${NC}"
  echo "   Check migration.log for details"
  exit 1
fi

echo ""

#===============================================================================
# SECTION 3: POST-MIGRATION VALIDATION
#===============================================================================

echo "✅ POST-MIGRATION VALIDATION"
echo "--------------------------------------------------"

# Define validation queries
VALIDATION_QUERIES=(
  "SELECT COUNT(*) as user_products_count FROM public.user_products;"
  "SELECT COUNT(*) as activation_logs_count FROM public.product_activation_logs;"
  "SELECT COUNT(*) as users_with_dashboard FROM public.user_products WHERE product = 'dashboard';"
  "SELECT COUNT(*) as trial_memberships FROM public.user_products WHERE status = 'trial';"
  "SELECT COUNT(*) as active_memberships FROM public.user_products WHERE status = 'active';"
)

echo "Running validation queries..."
echo ""

for query in "${VALIDATION_QUERIES[@]}"; do
  echo "Query: $query"
  if command -v supabase &> /dev/null; then
    supabase db query "$query"
  else
    psql "$DATABASE_URL" -c "$query"
  fi
  echo ""
done

#===============================================================================
# SECTION 4: HEALTH CHECKS
#===============================================================================

echo "🏥 SYSTEM HEALTH CHECKS"
echo "--------------------------------------------------"

# Check if Next.js server is running
echo -n "🌐 Checking Next.js server... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q "200"; then
  echo -e "${GREEN}✓ Server is running${NC}"
else
  echo -e "${YELLOW}⚠ Server not responding (start with 'npm run dev')${NC}"
fi

# Test auth sync endpoint
echo -n "🔐 Testing auth sync endpoint... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/sync | grep -q "400"; then
  echo -e "${GREEN}✓ Endpoint accessible${NC}"
else
  echo -e "${RED}✗ Endpoint not accessible${NC}"
fi

# Test product activation endpoint
echo -n "🎯 Testing product activation endpoint... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/products/activate | grep -q "401"; then
  echo -e "${GREEN}✓ Endpoint accessible${NC}"
else
  echo -e "${RED}✗ Endpoint not accessible${NC}"
fi

echo ""

#===============================================================================
# SECTION 5: MANUAL TESTING CHECKLIST
#===============================================================================

echo "📝 MANUAL TESTING CHECKLIST"
echo "--------------------------------------------------"
echo "Please verify the following manually:"
echo ""
echo "  [ ] New signup on shop.flowauxi.com creates shop membership"
echo "  [ ] New signup on showcase.flowauxi.com creates showcase membership"
echo "  [ ] Dashboard is accessible without activation"
echo "  [ ] Login on marketing.flowauxi.com without membership shows activation UI"
echo "  [ ] Activation creates trial membership (14 days)"
echo "  [ ] Activation logs appear in product_activation_logs table"
echo "  [ ] Existing users have dashboard access"
echo "  [ ] Existing users with ai_capabilities.has_shop=true have shop membership"
echo "  [ ] Existing users with ai_capabilities.has_showcase=true have showcase membership"
echo "  [ ] Session cookies are created after successful membership check"
echo "  [ ] Cross-domain navigation works correctly"
echo ""

#===============================================================================
# SECTION 6: ROLLBACK INSTRUCTIONS
#===============================================================================

echo "🔄 ROLLBACK INSTRUCTIONS"
echo "--------------------------------------------------"
echo "If critical issues are discovered, run rollback:"
echo ""
echo "  \$ psql \$DATABASE_URL -f $ROLLBACK_FILE"
echo ""
echo "This will:"
echo "  - Back up user_products and product_activation_logs tables"
echo "  - Drop the new tables"
echo "  - Restore ai_capabilities columns if needed"
echo ""

#===============================================================================
# COMPLETION
#===============================================================================

echo "=================================================="
echo -e "${GREEN}✅  DEPLOYMENT VALIDATION COMPLETE${NC}"
echo "=================================================="
echo ""
echo "Next Steps:"
echo "  1. Review validation query results above"
echo "  2. Complete manual testing checklistecho "  3. Monitor application logs for errors"
echo "  4. Keep rollback script ready for 24h"
echo ""
echo "Logs saved to: migration.log"
echo ""
