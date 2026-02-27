# Enterprise Feature Entitlement System - Implementation Guide

## 🎯 Overview

This document provides step-by-step implementation instructions for the enterprise-grade feature entitlement system refactor.

**Status**: ✅ Code Complete - Ready for Deployment
**Estimated Deployment Time**: 2-3 hours (excluding testing)
**Downtime Required**: 30 seconds (for migration 041 column swap)

---

## 📋 Pre-Deployment Checklist

### 1. Environment Setup

```bash
# Backend dependencies
pip install opentelemetry-sdk opentelemetry-exporter-prometheus prometheus-client

# Frontend dependencies (if not already installed)
npm install

# Verify Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### 2. Database Backup

```bash
# Create backup before running migrations
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Announce Planned Maintenance

**48 hours before deployment**, notify users:

> **Scheduled Maintenance**: We will be performing a brief system upgrade on [DATE] at 2:00 AM UTC. Expected downtime: 30 seconds. No action required.

---

## 🚀 Deployment Steps

### Phase 1: Database Migrations (Run in Order)

#### Step 1.1: Migration 040 - Fix Stale Usage Counters (CRITICAL)

**File**: `backend/migrations/040_fix_usage_counter_sync.sql`

**What it does**: Fixes the bug where users with 0 products see "You've reached your limit"

**Run on**:
```bash
# Staging
psql $STAGING_DATABASE_URL -f backend/migrations/040_fix_usage_counter_sync.sql

# Production (off-peak hours)
psql $PRODUCTION_DATABASE_URL -f backend/migrations/040_fix_usage_counter_sync.sql
```

**Verify**:
```sql
-- Check: Users with 0 products should have usage_counter = 0
SELECT u.id, u.email, uc.current_value, COUNT(p.id) as actual_products
FROM users u
LEFT JOIN usage_counters uc ON uc.user_id = u.id AND uc.feature_key = 'create_product'
LEFT JOIN products p ON p.user_id = u.firebase_uid AND p.is_deleted = false
GROUP BY u.id, u.email, uc.current_value
HAVING COUNT(p.id) = 0 AND uc.current_value > 0;
-- Expected: 0 rows (all counters fixed)
```

**Duration**: <1 minute
**Downtime**: None
**Rollback**: Idempotent (safe to re-run)

---

#### Step 1.2: Migration 042 - Plan Metadata Tables

**File**: `backend/migrations/042_plan_metadata.sql`

**What it does**: Creates `plan_metadata` and `plan_overrides` tables for database-driven configuration

**Run on**:
```bash
psql $PRODUCTION_DATABASE_URL -f backend/migrations/042_plan_metadata.sql
```

**Verify**:
```sql
-- Check tables created
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('plan_metadata', 'plan_overrides');
-- Expected: 2 rows
```

**Duration**: <1 minute
**Downtime**: None
**Rollback**: `DROP TABLE plan_overrides, plan_metadata CASCADE;`

---

#### Step 1.3: Migration 043 - Atomic Product Creation Function

**File**: `backend/migrations/043_atomic_product_creation.sql`

**What it does**: Creates database function that prevents race conditions with row-level locking

**Run on**:
```bash
psql $PRODUCTION_DATABASE_URL -f backend/migrations/043_atomic_product_creation.sql
```

**Verify**:
```sql
-- Check function exists
SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_product_with_quota';
-- Expected: 1 row (function with 3 arguments)
```

**Duration**: <1 minute
**Downtime**: None
**Rollback**: `DROP FUNCTION create_product_with_quota;`

---

#### Step 1.4: Migration 044 - Usage Sync Triggers

**File**: `backend/migrations/044_usage_sync_triggers.sql`

**What it does**: Self-healing triggers that keep usage_counters in sync with actual product count

**Run on**:
```bash
psql $PRODUCTION_DATABASE_URL -f backend/migrations/044_usage_sync_triggers.sql
```

**Verify**:
```sql
-- Check trigger exists
SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_sync_product_usage';
-- Expected: 1 row

-- Test trigger (on staging only!)
INSERT INTO products (user_id, name, price) VALUES ('test_user', 'Test Product', 1000);
SELECT current_value FROM usage_counters WHERE user_id = 'test_user' AND feature_key = 'create_product';
-- Expected: counter incremented
DELETE FROM products WHERE name = 'Test Product';
-- Expected: counter decremented
```

**Duration**: <1 minute
**Downtime**: None
**Rollback**: `DROP TRIGGER trigger_sync_product_usage ON products; DROP FUNCTION sync_product_usage_counter;`

---

#### Step 1.5: Migration 045 - Plan Versioning

**File**: `backend/migrations/045_plan_versioning.sql`

**What it does**: Snapshots plan features at subscription time (protects customers from plan downgrades)

**Run on**:
```bash
psql $PRODUCTION_DATABASE_URL -f backend/migrations/045_plan_versioning.sql
```

**Verify**:
```sql
-- Check columns added
SELECT column_name FROM information_schema.columns
WHERE table_name = 'subscriptions' AND column_name IN ('plan_version', 'plan_features_snapshot');
-- Expected: 2 rows
```

**Duration**: <1 minute
**Downtime**: None
**Rollback**: `ALTER TABLE subscriptions DROP COLUMN plan_version, DROP COLUMN plan_features_snapshot;`

---

#### Step 1.6: Migration 041 - Firebase UID Unification (REQUIRES DOWNTIME)

**File**: `backend/migrations/041_unify_user_id_firebase.sql`

**What it does**: Unifies user ID system (Firebase UID everywhere)

**⚠️ CRITICAL**: This migration requires 30-second planned maintenance

**Run Steps**:

1. **Steps 1-2 (Zero Downtime)**: Run immediately
```bash
# Add columns and backfill data
psql $PRODUCTION_DATABASE_URL -f backend/migrations/041_unify_user_id_firebase.sql
# (Stops after Step 2 automatically)
```

2. **Step 3 (30s Downtime)**: During maintenance window

```bash
# Enter maintenance mode (stop application traffic)
# Option 1: Load balancer redirect to maintenance page
# Option 2: Pause app server

# Run column swap (manually execute these commands)
psql $PRODUCTION_DATABASE_URL <<EOF
-- Subscriptions table
ALTER TABLE subscriptions DROP COLUMN user_id CASCADE;
ALTER TABLE subscriptions RENAME COLUMN user_firebase_uid TO user_id;
ALTER TABLE subscriptions ALTER COLUMN user_id SET NOT NULL;

-- Usage counters table
ALTER TABLE usage_counters DROP COLUMN user_id CASCADE;
ALTER TABLE usage_counters RENAME COLUMN user_firebase_uid TO user_id;
ALTER TABLE usage_counters ALTER COLUMN user_id SET NOT NULL;
EOF

# Exit maintenance mode (restore application traffic)
```

3. **Step 4 (Zero Downtime)**: Recreate indexes

```bash
psql $PRODUCTION_DATABASE_URL <<EOF
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain ON subscriptions(user_id, product_domain);
CREATE INDEX IF NOT EXISTS idx_usage_counters_user_domain ON usage_counters(user_id, domain);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_counters_key ON usage_counters(user_id, domain, feature_key);
EOF
```

**Verify**:
```sql
-- Check column types (should be TEXT now, not UUID)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('subscriptions', 'usage_counters') AND column_name = 'user_id';
-- Expected: Both TEXT
```

**Duration**: 30 seconds (maintenance window)
**Downtime**: 30 seconds
**Rollback**: See migration file for rollback instructions

---

### Phase 2: Deploy Backend Code

#### Step 2.1: Update Code to Use Firebase UID

**Files to modify**:

1. **`backend/routes/products_api.py:86-99`**:
```python
# REMOVE: Supabase UUID conversion
# OLD CODE:
# result = db.table('users').select('id').eq('firebase_uid', firebase_uid).execute()
# g.user_id = str(result.data[0]['id'])

# NEW CODE:
g.user_id = firebase_uid  # Use Firebase UID directly (no conversion)
```

2. **`frontend/app/api/features/check/route.ts:58-63`**:
```typescript
// REMOVE: Firebase UID to Supabase UUID mapping
// OLD CODE:
// const { data: userRow } = await supabase
//   .from("users").select("id").eq("firebase_uid", firebaseUid).maybeSingle();

// NEW CODE:
const userId = firebaseUid;  // Use Firebase UID directly
```

#### Step 2.2: Register New Blueprints

**File**: `backend/app.py`

```python
# Add imports
from routes.metrics import metrics_bp
from routes.admin_features import admin_bp

# Register blueprints
app.register_blueprint(metrics_bp)
app.register_blueprint(admin_bp)
```

#### Step 2.3: Deploy Backend

```bash
# Build backend
cd backend
pip install -r requirements.txt

# Run tests (if available)
pytest tests/

# Deploy to production (method depends on your setup)
# Example for Docker:
docker build -t reviseit-backend:latest .
docker push reviseit-backend:latest
# Rolling update...
```

---

### Phase 3: Data Migration Scripts

#### Step 3.1: Migrate Plan Config to Database

**File**: `backend/scripts/migrate_plan_config_to_db.py`

```bash
# Set environment variables
export SUPABASE_URL="your_supabase_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# Run migration script
python backend/scripts/migrate_plan_config_to_db.py
```

**Expected Output**:
```
==================================================
Migrate Plan Configuration to Database
==================================================

Migrating plan metadata to database...
✅ Migrated starter → tier_level=0
✅ Migrated business → tier_level=1
✅ Migrated pro → tier_level=2
✅ Migration complete: 3 plans migrated, 0 skipped
```

---

### Phase 4: Enable Monitoring

#### Step 4.1: Configure Prometheus Scraping

**File**: `prometheus.yml` (on monitoring server)

```yaml
scrape_configs:
  - job_name: 'reviseit-backend'
    static_configs:
      - targets: ['your-backend-url:5000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

#### Step 4.2: Verify Metrics Endpoint

```bash
curl https://your-backend-url/metrics

# Expected output (Prometheus format):
# feature_gate_checks_total{domain="shop",feature_key="create_product",...} 1247.0
# feature_gate_denials_total{denial_reason="hard_limit_exceeded",...} 89.0
# ...
```

---

## ✅ Post-Deployment Verification

### Test 1: Bug Fix Verification

**Scenario**: User with 0 products should NOT see "limit reached"

```bash
# Create test user with 0 products
# Navigate to /dashboard/products/add
# Expected: "Create Product" button enabled ✅
# Click create → Should work ✅
```

### Test 2: Atomic Product Creation (Race Condition Test)

**Scenario**: Two concurrent requests should NOT exceed limit

```python
# Test script (run on staging)
import concurrent.futures
import requests

def create_product(user_token):
    return requests.post(
        'https://staging-api/products',
        headers={'Authorization': f'Bearer {user_token}'},
        json={'name': 'Test Product', 'price': 1000}
    )

# User has 9 products, limit is 10
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    future1 = executor.submit(create_product, user_token)
    future2 = executor.submit(create_product, user_token)

    results = [future1.result(), future2.result()]

# Expected: Exactly ONE 201 (success), ONE 403 (denied) ✅
```

### Test 3: Plan Versioning

**Scenario**: Changing plan limits doesn't affect existing customers

```sql
-- User subscribed to starter plan (10 products) on 2026-02-01
-- Admin reduces starter plan to 5 products on 2026-02-15

-- Query:
SELECT plan_features_snapshot FROM subscriptions WHERE user_id = 'existing_user';
-- Expected: Snapshot shows hard_limit=10 (original plan) ✅

-- New user subscribes to starter on 2026-02-16
SELECT plan_features_snapshot FROM subscriptions WHERE user_id = 'new_user';
-- Expected: Snapshot shows hard_limit=5 (updated plan) ✅
```

---

## 🔄 Rollback Procedures

### Rollback Migration 041 (Firebase UID)

```sql
-- Restore old UUID columns
ALTER TABLE subscriptions ADD COLUMN user_id UUID;
UPDATE subscriptions s SET user_id = u.id
FROM users u WHERE s.user_firebase_uid = u.firebase_uid;

-- Similar for usage_counters...
```

### Rollback Code Changes

```bash
# Option 1: Blue-green deployment (instant switch back)
# Option 2: Redeploy previous version
git revert <commit_hash>
# Redeploy...
```

---

## 📊 Success Metrics (Monitor for 1 Week)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Bug Resolution | 0 users blocked | Support ticket volume |
| Performance | P99 <50ms | `/metrics` endpoint → feature_gate_check_duration_ms |
| Error Rate | <0.1% | Sentry/logs |
| Cache Hit Rate | >95% | feature_gate_cache_hits_total / feature_gate_checks_total |
| Upgrade Conversion | 5% of denials | Analytics: denial → billing page → subscription |

---

## 🆘 Troubleshooting

### Issue: "No subscription" errors after migration 041

**Cause**: User ID mapping failed during backfill

**Fix**:
```sql
-- Find unmapped users
SELECT * FROM subscriptions WHERE user_id IS NULL;

-- Manual backfill
UPDATE subscriptions s SET user_id = u.firebase_uid
FROM users u WHERE s.user_id IS NULL AND u.id = s.old_user_id_column;
```

### Issue: Metrics endpoint returns 500 error

**Cause**: OpenTelemetry not installed

**Fix**:
```bash
pip install opentelemetry-sdk opentelemetry-exporter-prometheus prometheus-client
# Restart backend
```

### Issue: Usage counters still drifting

**Cause**: Trigger not firing

**Fix**:
```sql
-- Check trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trigger_sync_product_usage';

-- Re-run migration 044 if missing
\i backend/migrations/044_usage_sync_triggers.sql
```

---

## 📚 Additional Resources

- **Plan File**: `C:\Users\Sugan001\.claude\plans\wild-wandering-kahan.md`
- **Migrations**: `backend/migrations/040-045_*.sql`
- **Admin API**: `backend/routes/admin_features.py`
- **Metrics**: `http://your-backend/metrics`

---

## ✅ Final Checklist

Before marking deployment complete:

- [ ] All 6 migrations run successfully
- [ ] Backend code deployed with Firebase UID changes
- [ ] Frontend code deployed
- [ ] Data migration script run
- [ ] Prometheus scraping configured
- [ ] Test user with 0 products can create product
- [ ] Metrics endpoint returning data
- [ ] No spike in error rate (check Sentry)
- [ ] Support team notified of changes

**Deployment Status**: [  ] Complete

---

**Questions?** Review the detailed plan in `wild-wandering-kahan.md` or check individual migration files for specifics.

🎉 **Congratulations!** You now have Stripe-level feature entitlement infrastructure.
