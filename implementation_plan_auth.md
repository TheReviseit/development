# FAANG-Level Fix: Product Provisioning Architecture Overhaul

## Problem Definition

When a new user signs up on the **booking domain** (`localhost:3005`), the `/api/auth/sync` endpoint returns `403 PRODUCT_NOT_ENABLED` instead of auto-provisioning the booking product. The root cause is **not** just a missing string in an array — it's a **systemic architectural gap** where product validation is fragmented across 7+ files with hardcoded allow-lists instead of being driven by the single source of truth: `PRODUCT_REGISTRY`.

### Current Architecture Failures

| Failure | Impact | FAANG Violation |
|---------|--------|-----------------|
| `isProductAvailableForActivation()` uses hardcoded array `["shop","showcase","marketing"]` — ignores registry | New products require hunting across files | DRY violation, fragile |
| `availableProducts` in `route.ts` is another hardcoded list | Booking never shown as activatable | Duplicated knowledge |
| `AuthProvider.detectCurrentProduct()` duplicates domain logic already in `lib/domain/config.ts` | Drift between 3 domain detectors | Single Source of Truth violation |
| `DashboardAuthGuard` has hardcoded `PAID_DOMAINS` list | Booking users get wrong redirect | Fragile, not registry-driven |
| `proxy.ts` `DOMAIN_MAP` missing `localhost:3005` entry | Middleware tenant resolution fails for booking | Incomplete configuration |
| Auth sync does auto-trial ONLY for `"shop"` product | Booking users don't get trial | Hardcoded product-specific logic |
| No auto-provisioning on signup — hard failure instead | User sees error instead of onboarding | No graceful degradation |

### Functional Requirements

1. **Signup on ANY self-service domain** must auto-provision product membership + trial
2. **Adding a new product** must require editing ONLY `PRODUCT_REGISTRY` + `domain/config.ts`
3. **Domain detection** must have ONE canonical path, never duplicated
4. **Auth sync must never hard-fail** for provisioning-eligible products when `allowCreate=true`

### Non-Functional Requirements

1. Zero schema changes (existing `user_products` table is sufficient)
2. Zero new API endpoints (all fixes are within existing flows)
3. Backward-compatible with shop/showcase/marketing
4. Observable — every auto-provision is logged to `product_activation_logs`

---

## System Architecture

### Before (Fragmented)

```
proxy.ts → hardcoded DOMAIN_MAP (missing booking)
         ↓
auth-helpers.ts → hardcoded allow list (missing booking)
         ↓
provisioning.server.ts → calls isProductAvailableForActivation (returns false)
         ↓
route.ts → checks user_products → no row → hardcoded availableProducts → 403
         ↓
AuthProvider → hardcoded detectCurrentProduct (missing booking)
         ↓
DashboardAuthGuard → hardcoded PAID_DOMAINS (missing booking)
```

### After (Registry-Driven)

```
PRODUCT_REGISTRY (single source of truth)
    ↓ derives
isSelfServiceProduct() — replaces isProductAvailableForActivation()
    ↓ used by
provisioning.server.ts → creates membership for ALL self-service products
    ↓
route.ts → derives availableProducts FROM registry, not hardcoded
    ↓
AuthProvider → uses getProductDomainFromBrowser() (already correct)
    ↓
DashboardAuthGuard → derives PAID_DOMAINS from registry
```

---

## Proposed Changes

### Component 1: Product Provisioning Layer (Core Fix)

> [!IMPORTANT]
> This is the architectural fix — replacing fragmented hardcoded lists with a registry-driven approach.

---

#### [MODIFY] [auth-helpers.ts](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/lib/auth-helpers.ts)

Replace `isProductAvailableForActivation()` with a **registry-driven** function that derives eligibility from `PRODUCT_REGISTRY`:

```diff
+import { PRODUCT_REGISTRY } from "@/lib/product/registry";

 export function isProductAvailableForActivation(
   product: ProductDomain,
 ): boolean {
   // Dashboard is always available but cannot be "activated" (auto-granted)
   if (product === "dashboard") return false;
 
   // API product is not self-service (requires admin approval)
   if (product === "api") return false;
 
-  // Shop, showcase, marketing are self-service
-  return ["shop", "showcase", "marketing"].includes(product);
+  // All registered products with pricing tiers are self-service
+  // Adding a new product to PRODUCT_REGISTRY automatically makes it activatable
+  const config = PRODUCT_REGISTRY[product];
+  if (!config) return false;
+
+  // A product is self-service if it has at least one pricing tier
+  return config.pricing.length > 0;
 }
+
+/**
+ * Get all self-service product domains (derived from registry).
+ * Used for PRODUCT_NOT_ENABLED responses and activation UIs.
+ */
+export function getSelfServiceProducts(): ProductDomain[] {
+  return (Object.keys(PRODUCT_REGISTRY) as ProductDomain[]).filter(
+    (p) => isProductAvailableForActivation(p),
+  );
+}
```

**Why this is FAANG-level**: Adding a new product to `PRODUCT_REGISTRY` with pricing tiers automatically makes it self-service. No hunting through files.

---

#### [MODIFY] [route.ts](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/app/api/auth/sync/route.ts)

**Fix 1**: Replace hardcoded `availableProducts` with registry-derived function:

```diff
 import {
   detectProductFromRequest,
   getRequestContext,
   isProductAvailableForActivation,
   calculateTrialEndDate,
+  getSelfServiceProducts,
 } from "@/lib/auth-helpers";

 // ... line 663-669: Replace hardcoded availableProducts
-      const availableProducts: ProductDomain[] = [
-        "shop",
-        "showcase",
-        "marketing",
-      ].filter(
+      const availableProducts: ProductDomain[] = getSelfServiceProducts().filter(
         (p) => !userMemberships?.some((m) => m.product === p),
       ) as ProductDomain[];
```

**Fix 2**: Replace shop-only auto-trial with any self-service product:

```diff
-    if (allowCreate && userWasCreated && currentProduct === "shop") {
+    if (allowCreate && userWasCreated && isProductAvailableForActivation(currentProduct)) {
```

**Fix 3**: Enhanced error response with actionable metadata:

```diff
       return NextResponse.json<SyncUserResponse>(
         {
           success: false,
           code: "PRODUCT_NOT_ENABLED" as AuthErrorCode,
           message: `Activate ${currentProduct} to continue`,
           currentProduct,
           availableProducts,
+          // FAANG: Actionable response — tell the client what it CAN do
+          action: allowCreate ? "AUTO_PROVISION_AVAILABLE" : "ACTIVATION_REQUIRED",
         },
         { status: 403 },
       );
```

---

### Component 2: Centralized Domain Detection (Remove Duplication)

> [!IMPORTANT]
> `AuthProvider` has its own domain detection that's out of sync with `lib/domain/config.ts`. This is the source of drift.

---

#### [MODIFY] [AuthProvider.tsx](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/app/components/auth/AuthProvider.tsx)

Replace the duplicated `detectCurrentProduct()` with the canonical `getProductDomainFromBrowser()`:

```diff
+import { getProductDomainFromBrowser } from "@/lib/domain/client";

-  const detectCurrentProduct = useCallback((): ProductDomain => {
-    if (typeof window === "undefined") return "dashboard";
-
-    const hostname = window.location.hostname;
-    const pathname = window.location.pathname;
-    const port = window.location.port;
-
-    // Production subdomain detection
-    if (process.env.NODE_ENV === "production") {
-      if (hostname.startsWith("shop.")) return "shop";
-      if (hostname.startsWith("pages.")) return "showcase";
-      if (hostname.startsWith("marketing.")) return "marketing";
-      if (hostname.startsWith("api.")) return "api";
-    }
-
-    // Development port-based detection
-    if (process.env.NODE_ENV === "development") {
-      if (port === "3001") return "shop";
-      if (port === "3002") return "showcase";
-      if (port === "3003") return "marketing";
-      if (port === "3004") return "api";
-
-      // Pathname-based fallback
-      if (
-        pathname.startsWith("/dashboard/products") ||
-        pathname.startsWith("/dashboard/orders")
-      ) {
-        return "shop";
-      }
-      if (
-        pathname.startsWith("/dashboard/showcase") ||
-        pathname.startsWith("/dashboard/pages")
-      ) {
-        return "showcase";
-      }
-      if (
-        pathname.startsWith("/dashboard/campaigns") ||
-        pathname.startsWith("/dashboard/marketing")
-      ) {
-        return "marketing";
-      }
-    }
-
-    return "dashboard";
-  }, []);
+  const detectCurrentProduct = useCallback((): ProductDomain => {
+    return getProductDomainFromBrowser();
+  }, []);
```

**Why this is FAANG-level**: One function, one truth. `getProductDomainFromBrowser()` calls `resolveDomain()` from `lib/domain/config.ts` — the same function the middleware uses. Booking, and any future product, is automatically covered because `resolveDomain()` already has the complete port/subdomain map.

---

### Component 3: Dashboard Auth Guard (Registry-Driven)

---

#### [MODIFY] [DashboardAuthGuard.tsx](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/app/dashboard/components/DashboardAuthGuard.tsx)

Replace hardcoded `PAID_DOMAINS` with registry-derived list:

```diff
+import { getSelfServiceProducts } from "@/lib/auth-helpers";

       case "PRODUCT_NOT_ENABLED": {
         const product = currentProduct || "dashboard";
-        const PAID_DOMAINS = ["marketing", "shop", "showcase"];
+        // Derive from registry — never goes stale when new products are added
+        const PAID_DOMAINS = getSelfServiceProducts();
```

---

### Component 4: Proxy DOMAIN_MAP Fix

---

#### [MODIFY] [proxy.ts](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/proxy.ts)

Add missing `localhost:3005` entry:

```diff
 const DOMAIN_MAP: Record<string, string> = {
   'shop.flowauxi.com': 'shop',
   'marketing.flowauxi.com': 'marketing',
   'pages.flowauxi.com': 'showcase',
+  'booking.flowauxi.com': 'booking',
   'flowauxi.com': 'dashboard',
   'www.flowauxi.com': 'dashboard',
   'api.flowauxi.com': 'api',
   'localhost:3000': 'dashboard',
   'localhost:3001': 'shop',
   'localhost:3002': 'showcase',
   'localhost:3003': 'marketing',
   'localhost:3004': 'api',
+  'localhost:3005': 'booking',
 };
```

---

### Component 5: Trial System — Domain-Agnostic

---

#### [MODIFY] [trial.ts](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/lib/trial.ts)

Fix hardcoded `source: "shop"` to use the actual domain:

```diff
       body: JSON.stringify({
         user_id: userId,
         org_id: orgId,
         email: email,
         plan_slug: "starter",
         domain: domain,
-        source: "shop",
+        source: domain,
         ip_address: ipAddress,
         device_fingerprint: deviceFingerprint,
         user_agent: userAgent,
       }),
```

---

### Component 6: Signup Error Handling — Graceful Degradation

---

#### [MODIFY] [signup/page.tsx](file:///c:/Users/Sugan001/Desktop/Flowauxi/frontend/app/signup/page.tsx)

Handle `PRODUCT_NOT_ENABLED` in the signup `syncWithRetry` response instead of showing a generic error:

```diff
       const syncResult = await syncWithRetry(idToken, true);
       if (!syncResult.ok) {
-        throw new Error(syncResult.code || "AUTH_SYNC_FAILED");
+        // FAANG: Graceful degradation — if product provisioning fails
+        // but user was created, redirect to onboarding instead of blocking
+        if (syncResult.code === "PRODUCT_NOT_ENABLED") {
+          console.warn(
+            "[Signup] Product not auto-provisioned, redirecting to onboarding",
+          );
+          router.push(`/onboarding-embedded?domain=${domain}`);
+          return;
+        }
+        throw new Error(syncResult.code || "AUTH_SYNC_FAILED");
       }
```

Apply same fix to the Google signup handler (line ~652-658):

```diff
         const syncResult = await syncWithRetry(idToken, true);
         if (!syncResult.ok) {
-          setError("Failed to complete signup. Please try again.");
-          setGoogleLoading(false);
-          await auth.signOut();
-          return;
+          if (syncResult.code === "PRODUCT_NOT_ENABLED") {
+            console.warn(
+              "[Signup] Product not auto-provisioned, redirecting to onboarding",
+            );
+            router.push(`/onboarding-embedded?domain=${domain}`);
+            return;
+          }
+          setError("Failed to complete signup. Please try again.");
+          setGoogleLoading(false);
+          await auth.signOut();
+          return;
         }
```

---

## Summary of All Changes

| # | File | Change | Type |
|---|------|--------|------|
| 1 | `lib/auth-helpers.ts` | Registry-driven `isProductAvailableForActivation()` + new `getSelfServiceProducts()` | Architecture |
| 2 | `app/api/auth/sync/route.ts` | Registry-driven `availableProducts` + any-product auto-trial + actionable error | Architecture |
| 3 | `app/components/auth/AuthProvider.tsx` | Replace 45-line duplicate with `getProductDomainFromBrowser()` | DRY cleanup |
| 4 | `app/dashboard/components/DashboardAuthGuard.tsx` | Registry-driven `PAID_DOMAINS` | Architecture |
| 5 | `proxy.ts` | Add booking entries to `DOMAIN_MAP` | Config |
| 6 | `lib/trial.ts` | Fix hardcoded `source: "shop"` → dynamic domain | Bug fix |
| 7 | `app/signup/page.tsx` | Graceful fallback on `PRODUCT_NOT_ENABLED` → onboarding redirect | UX |

## Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| `PRODUCT_REGISTRY` has product but no pricing tiers | `isProductAvailableForActivation()` returns `false` → product is admin-only |
| User signs up on booking but DB insert for membership fails | Signup succeeds (user created), fallback routes to onboarding |
| Concurrent signup from two tabs | `syncInProgressRef` guard in AuthProvider prevents race |
| Trial API is down during signup | `auto_start_trial_on_signup` is wrapped in try/catch, non-fatal |
| User already exists, tries to sign up on booking | `ensureCurrentProductMembership()` creates booking membership idempotently |

## Observability Plan

- Every auto-provision writes to `product_activation_logs` (already implemented in provisioning.server.ts)
- `[AUTH_SYNC]` log lines include product domain and elapsed time
- New `getSelfServiceProducts()` is unit-testable

## Security Model

- Domain detection is server-side via `detectProductFromRequest()` — never trusts client
- Client-side `getProductDomainFromBrowser()` is only for UI rendering, never for access control
- Product access is always verified server-side against `user_products` table
- Signed domain context via `DomainResolver.signContext()` prevents header spoofing in proxy

## Verification Plan

### Automated Tests
```bash
cd frontend && npm test -- --testPathPattern="sync.test"
```

### Manual Verification
1. Start on port 3005: `npm run dev -- --port 3005`
2. Go to `localhost:3005/signup`
3. Create account → verify redirect to onboarding
4. Check DB: `SELECT * FROM user_products WHERE product = 'booking'` → should have trial row
5. Login on port 3005 → should reach dashboard

### Regression Tests
- Signup on port 3001 (shop) — must still work
- Signup on port 3003 (marketing) — must still work
- Login on port 3000 (dashboard) — must still work

## Rollback Strategy

All changes are backward-compatible. The registry-driven approach is a superset of the old behavior. To rollback:
- Revert git commits (no migrations, no schema changes)
- Old hardcoded lists were a subset of what the registry now provides
