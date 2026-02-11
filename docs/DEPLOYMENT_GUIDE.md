# Production Deployment Guide — Option B Enterprise Auth

**Standard:** Zero-Downtime, Enterprise-Grade Deployment  
**Estimated Time:** 2-3 hours  
**Rollback Time:** < 15 minutes

---

## 🚨 PRE-DEPLOYMENT CHECKLIST

Before starting deployment, verify:

- [ ] All code changes committed to `main` branch
- [ ] Staging environment fully tested
- [ ] Manual testing checklist completed (16/16 tests passed)
- [ ] Database backup completed within last 24h
- [ ] Rollback script tested on staging
- [ ] Team notified of deployment window
- [ ] On-call engineer available for 2h post-deployment

---

## 📋 DEPLOYMENT STEPS

### Step 1: Pre-Deployment Validation (15 min)

```bash
# Navigate to project directory
cd /path/to/Flowauxi

# Verify environment variables
echo "Checking environment..."
[ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && echo "❌ Missing NEXT_PUBLIC_SUPABASE_URL" || echo "✅ Supabase URL set"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && echo "❌ Missing SUPABASE_SERVICE_ROLE_KEY" || echo "✅ Service role key set"
[ -z "$FIREBASE_PROJECT_ID" ] && echo "❌ Missing Firebase config" || echo "✅ Firebase configured"

# Run pre-deployment checks
chmod +x scripts/deploy-option-b.sh
./scripts/deploy-option-b.sh
```

**STOP POINT:** Do not proceed if any checks fail.

---

### Step 2: Database Backup (10 min)

```bash
# Create full database backup
pg_dump $DATABASE_URL > backups/pre-option-b-$(date +%Y%m%d-%H%M%S).sql

# Verify backup file exists and is not empty
ls -lh backups/*.sql
```

**CRITICAL:** Keep this backup for at least 7 days post-deployment.

---

### Step 3: Run Database Migration (20 min)

```bash
# Review migration one final time
cat backend/migrations/032_create_user_products_option_b.sql

# Execute migration
psql $DATABASE_URL -f backend/migrations/032_create_user_products_option_b.sql

# Check for errors in output
# Expected output: "MIGRATION COMPLETE - user_products table ready"
```

**Validation Queries:**

```sql
-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_products', 'product_activation_logs');

-- Check row counts
SELECT 'user_products' as table, COUNT(*) as rows FROM user_products
UNION ALL
SELECT 'activation_logs' as table, COUNT(*) as rows FROM product_activation_logs;

-- Verify all users have dashboard access
SELECT COUNT(*) as users_total FROM users;
SELECT COUNT(*) as users_with_dashboard FROM user_products WHERE product = 'dashboard';
-- These two numbers should match

-- Check grandfathered shop users
SELECT COUNT(*) FROM user_products WHERE product = 'shop' AND status = 'active';
```

**STOP POINT:** If validation fails, run rollback immediately.

---

### Step 4: Deploy Backend Changes (15 min)

```bash
# Build backend (if using separate backend server)
cd backend
npm run build

# Restart backend server
pm2 restart backend-api
# OR
systemctl restart backend-api

# Verify backend is healthy
curl http://localhost:8000/health
```

---

### Step 5: Deploy Frontend Changes (25 min)

```bash
# Build Next.js application
cd frontend
npm run build

# Test build locally
npm run start &
sleep 5
curl http://localhost:3000/api/auth/sync -X POST -H "Content-Type: application/json" -d '{"idToken": "test"}'
# Expected: 400 Bad Request (idToken invalid, but endpoint is responding)

# Stop test server
kill %1

# Deploy to production (example: Vercel)
vercel --prod

# OR deploy to custom server
pm2 restart frontend-nextjs
# OR
systemctl restart frontend-nextjs
```

---

### Step 6: Post-Deployment Validation (30 min)

**Automated Checks:**

```bash
# Wait for deployment to complete
sleep 30

# Check production endpoints
curl -I https://flowauxi.com
curl-I https://shop.flowauxi.com
curl -I https://marketing.flowauxi.com

# Test auth sync endpoint
curl -X POST https://flowauxi.com/api/auth/sync \
  -H "Content-Type: application/json" \
  -d '{"idToken": "invalid"}' \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 401 Unauthorized

# Test product activation endpoint
curl -X POST https://flowauxi.com/api/products/activate \
  -H "Content-Type: application/json" \
  -d '{"product": "shop"}' \
  -w "\nHTTP Status: %{http_code}\n"
# Expected: 401 Unauthorized (no session cookie)
```

**Manual Validation:**

Complete the Critical Path Tests from `docs/TESTING_CHECKLIST.md`:

1. **Test New Signup** (5 min)
   - Go to https://shop.flowauxi.com/signup
   - Create new account
   - Verify shop membership created
   - Verify access to shop features

2. **Test Product Activation Flow** (10 min)
   - Create user without shop membership (via dashboard signup)
   - Navigate to https://shop.flowauxi.com
   - Should see activation UI
   - Activate trial
   - Verify membership created
   - Verify access granted

3. **Test Dashboard Access** (2 min)
   - Login to https://flowauxi.com
   - Verify dashboard loads without activation prompt

4. **Test Cross-Domain Navigation** (5 min)
   - Login on shop.flowauxi.com
   - Navigate to flowauxi.com
   - Verify session persists (no re-login)

---

### Step 7: Monitor Logs (30 min)

```bash
# Watch application logs
tail -f /var/log/frontend/application.log | grep -i "AUTH"

# Watch database logs
psql $DATABASE_URL -c "SELECT * FROM product_activation_logs ORDER BY created_at DESC LIMIT 20;"

# Monitor error rate
# (Use your monitoring tool: Datadog, Sentry, etc.)
```

**Expected Log Patterns:**

```
✅ [AUTH_SYNC] ✅ AUTHENTICATED - elapsed=XYXms, product=dashboard
✅ [AUTH_SYNC] ✅ AUTHENTICATED - elapsed=XYXms, product=shop
✅ [PRODUCT_ACTIVATE] ✅ Activated - product=shop, trial_ends=...
⚠️  [AUTH_SYNC] ⚠️  PRODUCT_NOT_ENABLED - product=marketing (EXPECTED for non-activated users)
```

**Alert on:**

- ❌ `DATABASE_ERROR`
- ❌ `SERVER_ERROR`
- ❌ Elevated 500 error rate
- ❌ Spike in `USER_NOT_FOUND` errors

---

## 🔄 ROLLBACK PROCEDURE

If critical issues are discovered within 24h:

### Immediate Rollback (< 15 minutes)

```bash
# 1. Run rollback script
psql $DATABASE_URL -f backend/migrations/032_rollback_user_products.sql

# Expected output: "ROLLBACK COMPLETE - Backup tables created"

# 2. Verify rollback
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%_backup_032%';"
# Should see: user_products_backup_032, product_activation_logs_backup_032

# 3. Redeploy previous frontend version
git checkout <previous-commit-hash>
npm run build
vercel --prod
# OR
pm2 restart frontend-nextjs

# 4. Verify old version is live
curl https://flowauxi.com/api/auth/sync -X POST -d '{"idToken":"test"}' -H "Content-Type: application/json"
# Should work as before (no product validation)
```

### Post-Rollback

- [ ] Notify team of rollback
- [ ] Create incident report
- [ ] Schedule post-mortem
- [ ] Fix issues before re-attempting deployment

---

## 📊 SUCCESS METRICS

Monitor these metrics for 48h post-deployment:

| Metric                          | Expected        | Alert Threshold |
| ------------------------------- | --------------- | --------------- |
| Auth Success Rate               | > 99%           | < 95%           |
| Product Activation Success Rate | > 98%           | < 90%           |
| API Response Time (p95)         | < 500ms         | > 1000ms        |
| Database Query Time (p95)       | < 100ms         | > 300ms         |
| Error Rate                      | < 0.1%          | > 1%            |
| New User Signups                | Normal variance | > 20% drop      |

---

## 🎯 DEPLOYMENT TIMELINE

| Time    | Activity                   | Duration | Owner         |
| ------- | -------------------------- | -------- | ------------- |
| T-60min | Pre-deployment checks      | 15min    | DevOps        |
| T-45min | Database backup            | 10min    | DevOps        |
| T-35min | Run migration              | 20min    | DevOps        |
| T-15min | Deploy backend             | 15min    | Backend Team  |
| T+0min  | Deploy frontend            | 25min    | Frontend Team |
| T+25min | Post-deployment validation | 30min    | QA            |
| T+55min | Monitor logs               | 30min    | DevOps        |
| T+85min | Sign-off                   | 5min     | Tech Lead     |

**Total Time:** ~1h 30min + 24h monitoring

---

## ✅ DEPLOYMENT SIGN-OFF

**Deployment Date:** ******\_\_\_******  
**Deployment Start Time:** ******\_\_\_******  
**Deployment End Time:** ******\_\_\_******

**Pre-Deployment Checks:** ☐ Complete  
**Database Migration:** ☐ Success  
**Backend Deployment:** ☐ Success  
**Frontend Deployment:** ☐ Success  
**Post-Deployment Validation:** ☐ Pass (\_\_\_/4 tests)

**24h Stability Check:** ☐ Stable  
**48h Metrics Review:** ☐ All green

**Deployed By:** ******\_\_\_******  
**Approved By (Tech Lead):** ******\_\_\_******  
**Signatures:** ******\_\_\_****** ******\_\_\_******

---

## 📞 EMERGENCY CONTACTS

- **On-Call Engineer:** ******\_\_\_******
- **Database Admin:** ******\_\_\_******
- **Tech Lead:** ******\_\_\_******

**Escalation Path:** Engineer → Tech Lead → CTO

---

**🎉 Congratulations! You've deployed enterprise-grade authentication!**
