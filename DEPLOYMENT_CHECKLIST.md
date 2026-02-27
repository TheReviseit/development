# 🚀 Enterprise Feature Entitlement System - Deployment Checklist

## Pre-Deployment

### Environment Preparation
- [ ] **Backup database** - Create full backup before any migrations
  ```bash
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
  ```

- [ ] **Install dependencies**
  ```bash
  # Backend
  pip install opentelemetry-sdk opentelemetry-exporter-prometheus prometheus-client

  # Frontend (if needed)
  npm install
  ```

- [ ] **Verify environment variables**
  ```bash
  echo $SUPABASE_URL
  echo $SUPABASE_SERVICE_ROLE_KEY
  echo $RAZORPAY_KEY_ID
  ```

- [ ] **Announce maintenance** - 48 hours before deployment
  - Email users
  - Dashboard banner
  - Specify: 2 AM UTC, 30-second downtime

---

## Phase 1: Staging Deployment

### Run Migrations on Staging

- [ ] **Migration 040** - Fix usage counters
  ```bash
  psql $STAGING_DB -f backend/migrations/040_fix_usage_counter_sync.sql
  ```
  **Verify**: Users with 0 products have counter = 0

- [ ] **Migration 042** - Plan metadata tables
  ```bash
  psql $STAGING_DB -f backend/migrations/042_plan_metadata.sql
  ```
  **Verify**: Tables `plan_metadata` and `plan_overrides` exist

- [ ] **Migration 043** - Atomic product creation
  ```bash
  psql $STAGING_DB -f backend/migrations/043_atomic_product_creation.sql
  ```
  **Verify**: Function `create_product_with_quota` exists

- [ ] **Migration 044** - Usage sync triggers
  ```bash
  psql $STAGING_DB -f backend/migrations/044_usage_sync_triggers.sql
  ```
  **Verify**: Trigger `trigger_sync_product_usage` exists

- [ ] **Migration 045** - Plan versioning
  ```bash
  psql $STAGING_DB -f backend/migrations/045_plan_versioning.sql
  ```
  **Verify**: Columns `plan_version` and `plan_features_snapshot` added

- [ ] **Migration 041 (Steps 1-2)** - Firebase UID backfill
  ```bash
  psql $STAGING_DB -f backend/migrations/041_unify_user_id_firebase.sql
  ```
  **Verify**: Columns `user_firebase_uid` populated

### Test on Staging

- [ ] **Test 1**: User with 0 products can create product ✅
- [ ] **Test 2**: Concurrent requests don't exceed limit ✅
- [ ] **Test 3**: Usage counter auto-syncs on product delete ✅
- [ ] **Test 4**: Metrics endpoint returns data ✅
- [ ] **Test 5**: Plan override works ✅

### Code Review

- [ ] **Review migration files** - All SQL syntax correct
- [ ] **Review Python code** - No syntax errors
- [ ] **Review TypeScript code** - Compiles successfully
- [ ] **Run linters** - All checks pass

---

## Phase 2: Production Deployment

### Pre-Deployment (Day Before)

- [ ] **Announce maintenance** - Final reminder (24h, 12h, 1h before)
- [ ] **Prepare rollback scripts** - Test on staging
- [ ] **Team briefing** - On-call engineer ready
- [ ] **Monitoring setup** - Alerts configured

### Deployment Day (2 AM UTC)

#### Step 1: Database Migrations (Off-Peak)

- [ ] **2:00 AM** - Run migrations 040, 042, 043, 044, 045
  ```bash
  psql $PROD_DB -f backend/migrations/040_fix_usage_counter_sync.sql
  psql $PROD_DB -f backend/migrations/042_plan_metadata.sql
  psql $PROD_DB -f backend/migrations/043_atomic_product_creation.sql
  psql $PROD_DB -f backend/migrations/044_usage_sync_triggers.sql
  psql $PROD_DB -f backend/migrations/045_plan_versioning.sql
  ```
  **Duration**: 5 minutes
  **Downtime**: None

- [ ] **2:05 AM** - Run migration 041 Step 1-2 (backfill)
  ```bash
  psql $PROD_DB -f backend/migrations/041_unify_user_id_firebase.sql
  ```
  **Duration**: 2 minutes
  **Downtime**: None

#### Step 2: Planned Maintenance (30s)

- [ ] **2:10 AM** - Enable maintenance mode
  - Stop application servers OR
  - Load balancer → maintenance page

- [ ] **2:10 AM** - Run migration 041 Step 3 (column swap)
  ```sql
  -- Manually execute (see migration file)
  ALTER TABLE subscriptions DROP COLUMN user_id CASCADE;
  ALTER TABLE subscriptions RENAME COLUMN user_firebase_uid TO user_id;
  -- ... (see migration 041 for full commands)
  ```
  **Duration**: 30 seconds
  **Downtime**: 30 seconds ⚠️

- [ ] **2:11 AM** - Run migration 041 Step 4 (indexes)
  ```sql
  CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
  -- ... (see migration 041 for full commands)
  ```

- [ ] **2:12 AM** - Disable maintenance mode
  - Start application servers OR
  - Load balancer → application

#### Step 3: Deploy Backend Code

- [ ] **2:15 AM** - Deploy backend with Firebase UID changes
  ```bash
  # Update products_api.py (remove UUID conversion)
  # Update features/check/route.ts (remove UUID mapping)
  # Deploy...
  ```

- [ ] **2:20 AM** - Monitor error rate
  - Check Sentry for spikes
  - Check `/metrics` endpoint
  - Watch support channels

#### Step 4: Data Migration

- [ ] **2:30 AM** - Run plan config migration
  ```bash
  python backend/scripts/migrate_plan_config_to_db.py
  ```

#### Step 5: Enable Monitoring

- [ ] **2:35 AM** - Configure Prometheus scraping
- [ ] **2:40 AM** - Create Grafana dashboards
- [ ] **2:45 AM** - Set up alerts (PagerDuty)

---

## Phase 3: Post-Deployment Verification

### Immediate Checks (Within 1 Hour)

- [ ] **Error rate** - <0.1% (baseline)
- [ ] **Response time** - P99 <50ms
- [ ] **Database connections** - Normal
- [ ] **Cache hit rate** - >95%
- [ ] **Test product creation** - Works for test user

### Day 1 Monitoring

- [ ] **Hour 1-4** - Monitor every 30 minutes
- [ ] **Hour 4-8** - Monitor every hour
- [ ] **Hour 8-24** - Monitor every 2 hours

**Watch for**:
- Spike in support tickets
- Increase in error rate
- Slow queries
- Failed payments

### Week 1 Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Bug resolution | 0 blocked users | ___ | ☐ |
| P99 latency | <50ms | ___ | ☐ |
| Error rate | <0.1% | ___ | ☐ |
| Cache hit rate | >95% | ___ | ☐ |
| Upgrade conversion | >5% | ___ | ☐ |

---

## Rollback Plan

### If Error Rate Spikes (>5%)

**Immediate Actions** (within 5 minutes):

1. [ ] **Revert code deployment**
   ```bash
   # Blue-green: Switch traffic back
   # OR git revert + redeploy
   ```

2. [ ] **Check logs** - Identify root cause
   ```bash
   tail -f /var/log/backend/error.log
   ```

3. [ ] **Notify team** - PagerDuty alert

### If Database Issues

1. [ ] **Restore from backup**
   ```bash
   psql $PROD_DB < backup_20260215.sql
   ```

2. [ ] **Rollback migration 041 (if needed)**
   ```sql
   -- Add back old UUID columns
   -- See migration file for rollback SQL
   ```

### Rollback Criteria

Trigger rollback if ANY of:
- Error rate >5% for 10 minutes
- P99 latency >200ms for 10 minutes
- Support tickets >10/hour mentioning "can't create product"
- Database CPU >90% for 5 minutes

---

## Communication Plan

### Pre-Deployment
- **T-48h**: Email announcement
- **T-24h**: Dashboard banner
- **T-12h**: Slack/Discord reminder
- **T-1h**: Final reminder

### During Deployment
- **T+0**: "Maintenance starting"
- **T+30s**: "Maintenance complete"
- **T+1h**: "All systems normal"

### Post-Deployment
- **T+24h**: Status update email
- **T+1w**: Retrospective meeting

---

## Team Responsibilities

### On-Call Engineer
- Monitor alerts
- Execute rollback if needed
- Communicate status

### DevOps
- Run migrations
- Deploy code
- Configure monitoring

### Support Team
- Monitor tickets
- Escalate issues
- Collect feedback

---

## Final Sign-Off

**Pre-Deployment**:
- [ ] Technical Lead approval
- [ ] Product Manager approval
- [ ] Security review complete

**Post-Deployment**:
- [ ] All checks passed
- [ ] No critical issues
- [ ] Team notified

**Signed**: _________________ Date: _________

---

## Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| On-Call Engineer | ______ | ______ |
| Tech Lead | ______ | ______ |
| DevOps | ______ | ______ |
| Database Admin | ______ | ______ |

---

**STATUS**: [ ] Ready for Deployment

**Deployment Date**: _______________
**Deployment Time**: 2:00 AM UTC
**Expected Duration**: 45 minutes
**Downtime**: 30 seconds
