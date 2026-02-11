# Option B Enterprise Auth Re-Architecture — Manual Testing Checklist

**Tester:** ******\_\_\_******  
**Date:** ******\_\_\_******  
**Environment:** ☐ Staging ☐ Production

---

## 🔐 Authentication Flow Tests

### Test 1: New Signup on Shop Domain

- [ ] Navigate to `shop.flowauxi.com` (or `localhost:3001` in dev)
- [ ] Click "Sign Up" and create new account with email
- [ ] Verify signup succeeds
- [ ] **EXPECTED:** User is created in `users` table
- [ ] **EXPECTED:** `user_products` row created with `product='shop'`, `status='trial'`
- [ ] **EXPECTED:** `product_activation_logs` entry with `action='trial_started'`
- [ ] **EXPECTED:** Session cookie is set
- [ ] **EXPECTED:** User can access shop features immediately

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 2: New Signup on Dashboard Domain

- [ ] Navigate to `flowauxi.com/signup` (or `localhost:3000/signup`)
- [ ] Create new account
- [ ] **EXPECTED:** User is created
- [ ] **EXPECTED:** `user_products` row with `product='dashboard'`, `status='active'` (NOT trial)
- [ ] **EXPECTED:** User can access dashboard immediately

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 3: Login WITHOUT Product Membership

- [ ] Create a test user manually (or use existing user)
- [ ] Ensure user has NO `user_products` row for `product='shop'`
- [ ] Navigate to `shop.flowauxi.com` (or localhost:3001)
- [ ] Login with test user credentials
- [ ] **EXPECTED:** `/api/auth/sync` returns `403 PRODUCT_NOT_ENABLED`
- [ ] **EXPECTED:** Redirect to `/activate?product=shop`
- [ ] **EXPECTED:** Activation page displays trial benefits

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 4: Product Activation Flow

- [ ] From Test 3, user is on `/activate?product=shop`
- [ ] Click "Start 14-Day Free Trial" button
- [ ] **EXPECTED:** Loading state appears
- [ ] **EXPECTED:** API call to `/api/products/activate` succeeds
- [ ] **EXPECTED:** `user_products` row created with `status='trial'`, `trial_ends_at` = 14 days from now
- [ ] **EXPECTED:** `product_activation_logs` entry created
- [ ] **EXPECTED:** Redirect to `/dashboard/products`
- [ ] **EXPECTED:** User can now access shop features

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 5: Dashboard Always Accessible

- [ ] Use any user account
- [ ] Navigate to `flowauxi.com` (or localhost:3000)
- [ ] Login
- [ ] **EXPECTED:** Authentication succeeds WITHOUT membership check
- [ ] **EXPECTED:** Dashboard loads normally
- [ ] **EXPECTED:** No activation prompt for dashboard

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

## 🔄 Migration & Data Integrity Tests

### Test 6: Existing Users Have Dashboard Access

- [ ] Query database: `SELECT * FROM user_products WHERE product = 'dashboard';`
- [ ] **EXPECTED:** Every user in `users` table has a `dashboard` membership
- [ ] **EXPECTED:** All dashboard memberships have `status='active'`

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 7: Existing Shop Users Grandfathered

- [ ] Query: `SELECT * FROM ai_capabilities WHERE has_shop = true;`
- [ ] Note user_ids
- [ ] Query: `SELECT * FROM user_products WHERE user_id IN (...) AND product = 'shop';`
- [ ] **EXPECTED:** All users with `has_shop=true` have `shop` membership
- [ ] **EXPECTED:** Status is `'active'` (NOT trial, they're grandfathered)

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 8: Migration Audit Log

- [ ] Query: `SELECT * FROM product_activation_logs WHERE initiated_by = 'migration' ORDER BY created_at DESC LIMIT 20;`
- [ ] **EXPECTED:** Logs exist for all backfilled memberships
- [ ] **EXPECTED:** Logs include metadata (migration version, original flags)

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

## 🌐 Cross-Domain & Session Tests

### Test 9: Cross-Domain Navigation (Production Only)

- [ ] Login on `shop.flowauxi.com`
- [ ] Navigate to `flowauxi.com` (main dashboard)
- [ ] **EXPECTED:** Session persists, no re-login required
- [ ] **EXPECTED:** Dashboard loads normally

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 10: Session Cookie Security

- [ ] Login successfully
- [ ] Open browser DevTools → Application → Cookies
- [ ] Inspect `session` cookie
- [ ] **EXPECTED:** `httpOnly=true`
- [ ] **EXPECTED:** `secure=true` (in production)
- [ ] **EXPECTED:** `sameSite=lax`

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

## ❌ Error Handling Tests

### Test 11: Orphaned Firebase Account (USER_NOT_FOUND)

- [ ] Create Firebase account manually (outside app)
- [ ] Try to login with this account
- [ ] **EXPECTED:** `/api/auth/sync` returns `404 USER_NOT_FOUND`
- [ ] **EXPECTED:** User is signed out
- [ ] **EXPECTED:** Redirect to signup page with error message

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 12: Duplicate Activation Prevention

- [ ] Login to account with existing `shop` membership
- [ ] Try to activate `shop` again via `/api/products/activate`
- [ ] **EXPECTED:** API returns `400 ALREADY_ACTIVE`
- [ ] **EXPECTED:** No duplicate `user_products` row created

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 13: Invalid Product Activation

- [ ] Try to activate `dashboard` via `/api/products/activate`
- [ ] **EXPECTED:** API returns `403 PRODUCT_NOT_AVAILABLE`
- [ ] Try to activate `api` (enterprise-only)
- [ ] **EXPECTED:** API returns `403 PRODUCT_NOT_AVAILABLE`

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

## 📄 Database Schema Tests

### Test 14: RLS Policies

- [ ] Create Supabase client with anon key (NOT service role)
- [ ] Try to query `user_products` table
- [ ] **EXPECTED:** RLS blocks access (empty result or error)
- [ ] Login as user A, query `user_products`
- [ ] **EXPECTED:** Can only see user A's memberships (not other users)

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

### Test 15: Unique Constraint Enforcement

- [ ] Attempt to insert duplicate `user_products` row (same user_id + product)
- [ ] **EXPECTED:** Database returns unique constraint violation error (`23505`)

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

## 🚨 Rollback Test (Staging Only)

### Test 16: Emergency Rollback

- [ ] Run rollback script: `psql $DATABASE_URL -f backend/migrations/032_rollback_user_products.sql`
- [ ] **EXPECTED:** `user_products` table dropped
- [ ] **EXPECTED:** `product_activation_logs` table dropped
- [ ] **EXPECTED:** Backup tables created (`user_products_backup_032`, etc.)
- [ ] **EXPECTED:** Application still functions (falls back to ai_capabilities)
- [ ] Re-run migration to restore
- [ ] **EXPECTED:** Migration succeeds again (idempotent)

**Result:** ☐ PASS ☐ FAIL  
**Notes:** ******************\_\_\_******************

---

## ✅ Final Sign-Off

**Total Tests:** 16  
**Passed:** **\_**  
**Failed:** **\_**  
**Pass Rate:** **\_**%

**Critical Issues Found:** ☐ None ☐ See notes below

**Ready for Production:** ☐ YES ☐ NO

**Tester Signature:** ******\_\_\_******  
**Date:** ******\_\_\_******

---

## 📋 Notes & Issues

---

---

---

---
