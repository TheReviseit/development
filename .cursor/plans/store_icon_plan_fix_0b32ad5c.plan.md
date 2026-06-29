---
name: Store Icon Plan Fix
overview: Staff-level fix for shop dashboard store icon visibility and plan-correct store URLs. Layer 1 owns save path + mandatory cache invalidation. Layer 2 owns healer with write-through and AUTH_SYNC_HEALER_ENABLED kill switch. Full reference code included below.
todos:
  - id: extract-slug-resolver
    content: Add shared resolveEffectiveStoreSlug (Python + TS)
    status: pending
  - id: neutralize-trigger
    content: Always pass explicit url_slug in upsert on fast path (trigger null guard never fires)
    status: pending
  - id: fix-fast-path-save
    content: shop_business.py — _apply_plan_slug_before_upsert on fast path + aiSettingsConfigured in response + users table update
    status: pending
  - id: fix-save-proxy
    content: /api/business/save — trust Flask, gate on business_name, ui_state cookie
    status: pending
  - id: cache-invalidate-on-save
    content: "P0 Layer 1: invalidateAuthSyncCaches on every successful save (NOT Layer 5 / NOT TTL)"
    status: pending
  - id: fix-auth-healer
    content: Plan-aware healer + cache write-through + session cookie on all paths
    status: pending
  - id: healer-kill-switch
    content: AUTH_SYNC_HEALER_ENABLED env (default true); set false post-migration; delete healer in follow-up PR
    status: pending
  - id: navbar-hardening
    content: Auth-wins visibility merge; remove debug logs
    status: pending
  - id: data-correction-migration
    content: Plan-aware slug correction migration + row count logging
    status: pending
  - id: observability
    content: Structured [AUTH_SYNC_HEAL] + [AUTH_SYNC_CACHE_INVALIDATE] logs
    status: pending
  - id: verify-matrix
    content: QA matrix including no 60s stale window after save
    status: pending
isProject: false
---

# Store Icon Fix — Staff-Level Plan (Ship-Ready)

## Final Verdict

**Ship it.** Architecture, root cause, layering, and non-goals are correct. This revision closes the last two polish items:

1. **Cache invalidation is Layer 1 P0** — not cleanup, not TTL-dependent.
2. **`AUTH_SYNC_HEALER_ENABLED`** — explicit exit condition with runbook.

Full reference code for every file is in the **Reference Implementation** section at the bottom.

---

## Problem Summary

| Symptom | Root cause |
|---------|------------|
| URL is `/store/flowauxi` on Starter trial | Fast path skips plan slug enforcement; DB trigger generates slug from `business_name` |
| Icon missing after save until re-save | Auth sync memory/warm cache serves stale `ai_settings_configured: false` for up to **60s** |
| Icon flickers on login | Healer patches response but not cache; visibility merge mixes stale cookie + fresh auth |

---

## Layer 1 — Save Path + Cache Invalidation (P0, owns 90%)

**Scope:** trigger neutralization, Flask response contract, save proxy, **immediate cache invalidation**.

### 1A. Trigger neutralization

Pass explicit `url_slug` in upsert so [`auto_generate_business_slug`](backend/migrations/050_fix_trigger_respect_explicit_slug.sql) never fires on `slug IS NULL`.

### 1B. Plan slug on fast path

Call `_apply_plan_slug_before_upsert()` even when `settings_fast_path=True` and `business_name` is present.

### 1C. Flask response + users denormalization

Return `url_slug`, `aiSettingsConfigured`. Update `users.ai_settings_configured` + `users.store_slug` in Flask (same request).

### 1D. Save proxy

Trust Flask fields. Set `flowauxi_ui_state` cookie. **Invalidate auth sync caches immediately.**

### Cache invalidation — P0 correctness (NOT Layer 5)

| Without invalidation | With invalidation |
|---------------------|-------------------|
| Save succeeds, cookie updated | Same |
| User navigates / refreshes | Same |
| Auth sync hits 60s memory cache | Auth sync misses cache → fresh DB read |
| Returns `ai_settings_configured: false` | Returns correct state |
| **Icon hidden up to 60s** | **Icon visible immediately** |

**Known limitation if skipped (document for QA):** `MEMORY_CACHE_TTL_MS = 60_000` and warm cache TTL = 60s. Any save without explicit invalidation guarantees wrong navbar state for up to 60 seconds.

**Implementation:** `invalidateAuthSyncCaches(firebaseUid, product)` called from save proxy on every `response.ok`.

---

## Layer 2 — Auth Sync Healer

- Plan-aware `healAiSettingsIfNeeded`
- Write-through to memory + warm cache when heal fires on cache hits
- Session cookie on `NextResponse` for all login/cache paths

### Healer exit condition (required)

```bash
# .env — default: enabled (safe for deploy + migration gap window)
AUTH_SYNC_HEALER_ENABLED=true

# After migration verified + heal logs → ~0 for 7 days:
AUTH_SYNC_HEALER_ENABLED=false
```

**Runbook:**

1. Deploy Layer 1 + migration.
2. Monitor `[AUTH_SYNC_HEAL]` log volume for 7 days.
3. When count → ~0, set `AUTH_SYNC_HEALER_ENABLED=false`.
4. Follow-up PR: delete healer entirely.

Alias accepted in docs: `HEALER_ENABLED` — use `AUTH_SYNC_HEALER_ENABLED` in code (namespaced, no collision).

---

## Layer 3 — Data Correction Migration

`supabase/migrations/20260629100000_fix_store_slug_plan_aware.sql` — correct Starter rows with name-based slugs. Log `RAISE NOTICE` row count.

---

## Layer 4 — Navbar Visibility

Auth wins over cookie. Slug from winning source only. One-way merge auth → uiState.

---

## Layer 5 — Observability Only

Structured logs. **No cleanup tasks.** Cache invalidation lives in Layer 1.

---

## Non-Goals

- No Firestore on auth sync hot path
- No DB trigger rewrite (neutralize via explicit slug)
- No `proxy.ts` changes

---

## Verification Matrix

| Scenario | Icon | URL | Cache |
|----------|------|-----|-------|
| New user, no save | Hidden | — | — |
| Starter, first save "Flowauxi" | Visible **immediately** | `/store/{uid[:8]}` | Invalidated on save |
| Business, first save | Visible immediately | `/store/flowauxi` | Invalidated |
| Logout → login | Visible first paint | Plan-correct | Write-through if heal |
| Empty business_name save | Hidden | — | — |

**QA regression to catch:** save → navigate within 5s → icon must show (proves cache invalidation works, not TTL).

---

# Reference Implementation (Full Code)

Copy-paste starting points for each file. Adjust imports to match repo conventions.

---

## 1. `backend/services/store_slug_resolver.py` (NEW)

```python
"""Single source of truth for plan-aware store slug resolution."""

from __future__ import annotations


def resolve_effective_store_slug(
    firebase_uid: str,
    url_slug: str | None,
    custom_domain_allowed: bool,
) -> str:
    """
    Starter / no custom_domain → firebase_uid[:8] (forced).
    Business/Pro + custom_domain → url_slug if set, else uid[:8] fallback.
    """
    fallback = (firebase_uid or "")[:8].lower()
    if not custom_domain_allowed:
        return fallback
    if url_slug and str(url_slug).strip():
        return str(url_slug).strip()
    return fallback


def is_ai_settings_configured(business_name: str | None) -> bool:
    return bool(business_name and str(business_name).strip())
```

---

## 2. `frontend/lib/store/resolve-store-slug.ts` (NEW)

```typescript
export function resolveEffectiveStoreSlug(params: {
  firebaseUid: string;
  urlSlug: string | null | undefined;
  hasCustomDomain: boolean;
}): string {
  const fallback = params.firebaseUid.slice(0, 8).toLowerCase();
  if (!params.hasCustomDomain) return fallback;
  const trimmed = params.urlSlug?.trim();
  return trimmed || fallback;
}

export function isAiSettingsConfigured(businessName: string | null | undefined): boolean {
  return Boolean(businessName?.trim());
}
```

---

## 3. `backend/routes/shop_business.py` (ADD + MODIFY)

```python
# --- ADD near top ---
from services.store_slug_resolver import (
    resolve_effective_store_slug,
    is_ai_settings_configured,
)


def _apply_plan_slug_before_upsert(user_id: str, db, db_data: dict, timer) -> tuple[str | None, bool]:
    """
    Always run when business_name is in save payload (including fast path).
    Sets explicit url_slug in db_data so DB trigger never auto-generates from name.
    Returns (effective_slug, custom_domain_allowed).
    """
    business_name = db_data.get("business_name") or ""
    if not is_ai_settings_configured(business_name):
        # Also check stored name if not in this payload
        try:
            row = db.table("businesses").select("business_name, url_slug").eq("user_id", user_id).maybe_single().execute()
            stored_name = (row.data or {}).get("business_name") or ""
            if not is_ai_settings_configured(stored_name):
                return None, False
            business_name = stored_name
        except Exception:
            return None, False

    domain = "shop"
    custom_domain_allowed = False
    current_slug = None
    try:
        from services.feature_gate_engine import get_feature_gate_engine
        decision = get_feature_gate_engine().check_feature_access(user_id, domain, "custom_domain")
        custom_domain_allowed = bool(decision.allowed)
    except Exception as e:
        logger.warning(f"Feature gate unavailable for slug (fail closed to starter): {e}")

    try:
        row = db.table("businesses").select("url_slug").eq("user_id", user_id).maybe_single().execute()
        current_slug = (row.data or {}).get("url_slug")
    except Exception:
        pass

    candidate = db_data.get("url_slug") or current_slug
    if custom_domain_allowed and db_data.get("business_name"):
        incoming = db_data["business_name"].strip()
        fallback = user_id[:8].lower()
        is_fallback = not candidate or candidate == fallback
        if is_fallback or (incoming and incoming != (business_name or "").strip()):
            candidate = _generate_slug(incoming)

    effective = resolve_effective_store_slug(user_id, candidate, custom_domain_allowed)
    db_data["url_slug"] = effective
    db_data["url_slug_lower"] = effective.lower()
    return effective, custom_domain_allowed


# --- MODIFY _update_business_impl: replace fast-path skip ---

    settings_fast_path = _is_ai_settings_fast_path(payload, db_data)
    timer.set_attr("settings_fast_path", settings_fast_path)

    effective_slug = None
    custom_domain_allowed = False
    if "business_name" in db_data or settings_fast_path:
        effective_slug, custom_domain_allowed = _apply_plan_slug_before_upsert(
            user_id, db, db_data, timer
        )
        if effective_slug:
            logger.info(
                f"✅ Plan slug applied (fast_path={settings_fast_path}): "
                f"'{effective_slug}' custom_domain={custom_domain_allowed}"
            )

    # Keep existing slug enforcement block for non-fast-path explicit slug changes
    if not settings_fast_path and "url_slug" not in db_data:
        # ... existing block unchanged ...
        pass

    # --- AFTER successful upsert, before response ---

    configured = is_ai_settings_configured(
        db_data.get("business_name")
        or (stored_business_name if "stored_business_name" in dir() else None)
    )
    if not configured:
        try:
            row = db.table("businesses").select("business_name, url_slug").eq("user_id", user_id).maybe_single().execute()
            configured = is_ai_settings_configured((row.data or {}).get("business_name"))
            effective_slug = effective_slug or (row.data or {}).get("url_slug")
        except Exception:
            pass

    if configured and effective_slug:
        try:
            db.table("users").update({
                "ai_settings_configured": True,
                "store_slug": effective_slug,
                "updated_at": "now()",
            }).eq("firebase_uid", user_id).execute()
        except Exception as e:
            logger.warning(f"users denorm update failed (non-critical): {e}")

    response_body = {"success": True}
    if effective_slug:
        response_body["url_slug"] = effective_slug
    response_body["aiSettingsConfigured"] = configured
    return jsonify(response_body), 200
```

---

## 4. `frontend/lib/auth/authSyncCache.ts` (NEW)

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductDomain } from "@/types/auth.types";
import {
  generateAuthSyncWarmCacheKey,
  putAuthSyncWarmCache,
} from "@/lib/auth/authSyncIdempotency";

/** Must match route.ts private constants — export from shared module when refactoring. */
export const AUTH_SYNC_MEMORY_CACHE_TTL_MS = 60_000;

type MemoryCacheEntry = {
  statusCode: number;
  responseBody: unknown;
  expiresAt: number;
};

/** Registered by auth/sync route at module init. */
let memoryCacheRef: Map<string, MemoryCacheEntry> | null = null;
let buildMemoryCacheKeyRef:
  | ((uid: string, product: string, allowCreate: boolean) => string)
  | null = null;

export function registerAuthSyncMemoryCache(
  cache: Map<string, MemoryCacheEntry>,
  buildKey: (uid: string, product: string, allowCreate: boolean) => string,
): void {
  memoryCacheRef = cache;
  buildMemoryCacheKeyRef = buildKey;
}

export function invalidateAuthSyncMemoryCache(
  firebaseUid: string,
  product: ProductDomain,
): void {
  if (!memoryCacheRef || !buildMemoryCacheKeyRef) return;
  for (const allowCreate of [false, true]) {
    const key = buildMemoryCacheKeyRef(firebaseUid, product, allowCreate);
    memoryCacheRef.delete(key);
  }
}

export async function invalidateAuthSyncWarmCache(
  supabase: SupabaseClient,
  firebaseUid: string,
  product: ProductDomain,
): Promise<void> {
  for (const allowCreate of [false, true]) {
    const cacheKey = generateAuthSyncWarmCacheKey({ firebaseUid, product, allowCreate });
    // Overwrite with expired/minimal entry — delete RPC optional if added later
    try {
      await putAuthSyncWarmCache({
        supabase,
        cacheKey,
        statusCode: 410,
        responseBody: { invalidated: true },
        ttlSeconds: 1,
      });
    } catch {
      // non-fatal
    }
  }
}

export async function invalidateAuthSyncCaches(params: {
  supabase: SupabaseClient;
  firebaseUid: string;
  product: ProductDomain;
}): Promise<void> {
  invalidateAuthSyncMemoryCache(params.firebaseUid, params.product);
  await invalidateAuthSyncWarmCache(params.supabase, params.firebaseUid, params.product);
  console.info("[AUTH_SYNC_CACHE_INVALIDATE]", {
    event: "auth_sync_cache_invalidated_on_save",
    firebase_uid_suffix: params.firebaseUid.slice(-6),
    product: params.product,
  });
}

/** Write-through after heal — keeps cache self-consistent. */
export async function writeThroughAuthSyncCache(params: {
  supabase: SupabaseClient;
  firebaseUid: string;
  product: ProductDomain;
  memoryCacheKey: string;
  warmCacheKey: string;
  statusCode: number;
  responseBody: unknown;
  memoryCacheSet: (key: string, entry: MemoryCacheEntry) => void;
}): Promise<void> {
  params.memoryCacheSet(params.memoryCacheKey, {
    statusCode: params.statusCode,
    responseBody: params.responseBody,
    expiresAt: Date.now() + AUTH_SYNC_MEMORY_CACHE_TTL_MS,
  });
  await putAuthSyncWarmCache({
    supabase: params.supabase,
    cacheKey: params.warmCacheKey,
    statusCode: params.statusCode,
    responseBody: params.responseBody,
    ttlSeconds: 60,
  });
}
```

---

## 5. `frontend/app/api/business/save/route.ts` (MODIFY)

```typescript
import { invalidateAuthSyncCaches } from "@/lib/auth/authSyncCache";
import { isAiSettingsConfigured } from "@/lib/store/resolve-store-slug";

// Inside POST handler, after response.ok:

      const businessName =
        typeof businessData.business_name === "string"
          ? businessData.business_name
          : typeof businessData.businessName === "string"
            ? businessData.businessName
            : "";

      const configured =
        data.aiSettingsConfigured === true || isAiSettingsConfigured(businessName);

      const storeSlug: string | undefined =
        typeof data.url_slug === "string"
          ? data.url_slug
          : typeof data.storeSlug === "string"
            ? data.storeSlug
            : undefined;

      if (configured && storeSlug) {
        try {
          const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });
          await supabase
            .from("users")
            .update({
              ai_settings_configured: true,
              store_slug: storeSlug,
            })
            .eq("firebase_uid", userId);

          // P0: invalidate auth sync caches — do NOT rely on 60s TTL
          await invalidateAuthSyncCaches({
            supabase,
            firebaseUid: userId,
            product: "shop",
          });
        } catch (err) {
          console.error("[Business Save Proxy] post-save update failed:", err);
        }

        data.aiSettingsConfigured = true;
        data.storeSlug = storeSlug;

        jsonResponse.cookies.set(
          UI_STATE_COOKIE,
          serializeUiState({
            ai_settings_configured: true,
            store_slug: storeSlug,
          }),
          getUiStateCookieOptions(),
        );
      }
```

---

## 6. `frontend/app/api/auth/sync/route.ts` (MODIFY — key sections)

```typescript
import {
  registerAuthSyncMemoryCache,
  writeThroughAuthSyncCache,
} from "@/lib/auth/authSyncCache";
import { resolveEffectiveStoreSlug } from "@/lib/store/resolve-store-slug";

const AUTH_SYNC_HEALER_ENABLED =
  process.env.AUTH_SYNC_HEALER_ENABLED !== "false";

// At module load:
registerAuthSyncMemoryCache(MEMORY_CACHE, buildMemoryCacheKey);

async function healAiSettingsIfNeeded(
  user: SupabaseUser,
  supabase: SupabaseClient,
  source: "memory_cache_hit" | "warm_cache_hit" | "login_fresh",
): Promise<Partial<SupabaseUser> | null> {
  if (!AUTH_SYNC_HEALER_ENABLED) return null;
  if (user.ai_settings_configured === true) return null;

  const { data: business, error } = await supabase
    .from("businesses")
    .select("business_name, url_slug")
    .eq("user_id", user.firebase_uid)
    .maybeSingle();

  if (error || !business?.business_name?.trim()) return null;

  // Lightweight custom_domain check — mirror shop domain feature gate
  let hasCustomDomain = false;
  try {
    const { data: trial } = await supabase
      .from("trials")
      .select("plan_slug, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const plan = trial?.plan_slug?.toLowerCase() ?? "starter";
    hasCustomDomain = ["business", "pro"].includes(plan);
  } catch {
    hasCustomDomain = false;
  }

  const resolvedSlug = resolveEffectiveStoreSlug({
    firebaseUid: user.firebase_uid,
    urlSlug: business.url_slug,
    hasCustomDomain,
  });

  console.info("[AUTH_SYNC_HEAL]", {
    event: "ai_settings_healed",
    firebase_uid_suffix: user.firebase_uid.slice(-6),
    store_slug: resolvedSlug,
    custom_domain: hasCustomDomain,
    source,
  });

  void supabase
    .from("users")
    .update({
      ai_settings_configured: true,
      store_slug: resolvedSlug,
      updated_at: new Date().toISOString(),
    })
    .eq("firebase_uid", user.firebase_uid);

  return { ai_settings_configured: true, store_slug: resolvedSlug };
}

async function resolveUserWithHeal(
  user: SupabaseUser,
  supabase: SupabaseClient,
  source: "memory_cache_hit" | "warm_cache_hit" | "login_fresh",
): Promise<SupabaseUser> {
  const patch = await healAiSettingsIfNeeded(user, supabase, source);
  return patch ? { ...user, ...patch } : user;
}

// Memory cache hit path — apply heal + write-through:
if (memoryHit) {
  const rawUser = (cachedBody as any).user as SupabaseUser;
  const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: AUTH_SYNC_SUPABASE_TIMEOUT_MS });
  const resolvedUser = await resolveUserWithHeal(rawUser, supabase, "memory_cache_hit");
  const patchedBody = { ...cachedBody, user: resolvedUser };
  if (resolvedUser !== rawUser) {
    await writeThroughAuthSyncCache({
      supabase,
      firebaseUid: resolvedUser.firebase_uid,
      product: currentProduct,
      memoryCacheKey,
      warmCacheKey: generateAuthSyncWarmCacheKey({ firebaseUid: resolvedUser.firebase_uid, product: currentProduct, allowCreate: false }),
      statusCode: memoryHit.statusCode,
      responseBody: patchedBody,
      memoryCacheSet: memoryCacheSet,
    });
  }
  const response = NextResponse.json(patchedBody, { status: memoryHit.statusCode });
  attachUiStateCookie(response, resolvedUser);
  // Set session cookie on response object if needed (same as login fix)
  return finalizeResponse(response);
}
```

---

## 7. `frontend/app/(dashboard)/layout.tsx` (MODIFY StoreIconRenderer)

```typescript
function StoreIconRenderer() {
  const { user } = useAuth();
  const { uiState, mergeUiState } = useUiState();

  useEffect(() => {
    if (user?.ai_settings_configured === true) {
      mergeUiState({
        ai_settings_configured: true,
        store_slug: user.store_slug || null,
      });
    }
  }, [user, mergeUiState]);

  // Priority: auth > cookie. Slug from winning source only.
  const authConfigured = user?.ai_settings_configured === true;
  const configured =
    authConfigured ||
    (!authConfigured && uiState.ai_settings_configured === true);

  const rawSlug = authConfigured ? user?.store_slug : uiState.store_slug;
  const effectiveSlug = rawSlug?.trim() || null;

  if (!configured || !effectiveSlug) return null;

  return (
    <a
      href={`/store/${effectiveSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", cursor: "pointer", marginRight: "24px" }}
      className="hover:opacity-80 transition-opacity"
      title="View Store"
    >
      <Store size={20} color="#ffffff" strokeWidth={2.25} />
    </a>
  );
}
```

---

## 8. `frontend/app/(dashboard)/components/BotSettingsView.tsx` (MODIFY handleSave)

```typescript
      const response = await fetchBusinessSave(correlationId, serializedBody);
      const responseData = await response.json(); // parse ONCE

      if (response.ok) {
        setInitialData(dataRef.current);
        setMessage({ type: "success", text: "Product saved successfully! 🎉" });

        if (responseData.aiSettingsConfigured) {
          const storeSlug = responseData.storeSlug || responseData.url_slug || undefined;
          updateUser({
            ai_settings_configured: true,
            store_slug: storeSlug,
          });
          mergeUiState({
            ai_settings_configured: true,
            store_slug: storeSlug || null,
          });
        }
      } else {
        throw new Error(responseData.error || "Failed to save");
      }
```

---

## 9. `supabase/migrations/20260629100000_fix_store_slug_plan_aware.sql` (NEW)

```sql
BEGIN;

DO $$
DECLARE
  affected_businesses INT;
  affected_users INT;
BEGIN
  -- Starter/trial: force uid[:8] slug when name-based slug was wrongly set
  UPDATE public.businesses b
  SET
    url_slug = LOWER(SUBSTRING(b.user_id FROM 1 FOR 8)),
    url_slug_lower = LOWER(SUBSTRING(b.user_id FROM 1 FOR 8)),
    updated_at = NOW()
  WHERE
    b.business_name IS NOT NULL
    AND TRIM(b.business_name) != ''
    AND b.url_slug IS DISTINCT FROM LOWER(SUBSTRING(b.user_id FROM 1 FOR 8))
    AND NOT EXISTS (
      SELECT 1 FROM public.trials t
      JOIN public.users u ON u.id = t.user_id
      WHERE u.firebase_uid = b.user_id
        AND t.status = 'active'
        AND LOWER(t.plan_slug) IN ('business', 'pro')
    );

  GET DIAGNOSTICS affected_businesses = ROW_COUNT;

  UPDATE public.users u
  SET
    ai_settings_configured = TRUE,
    store_slug = LOWER(SUBSTRING(u.firebase_uid FROM 1 FOR 8)),
    updated_at = NOW()
  FROM public.businesses b
  WHERE
    u.firebase_uid = b.user_id
    AND b.business_name IS NOT NULL
    AND TRIM(b.business_name) != ''
    AND u.store_slug IS DISTINCT FROM LOWER(SUBSTRING(u.firebase_uid FROM 1 FOR 8))
    AND NOT EXISTS (
      SELECT 1 FROM public.trials t
      WHERE t.user_id = u.id
        AND t.status = 'active'
        AND LOWER(t.plan_slug) IN ('business', 'pro')
    );

  GET DIAGNOSTICS affected_users = ROW_COUNT;
  RAISE NOTICE 'Corrected % businesses, % users to plan-aware uid[:8] slugs', affected_businesses, affected_users;
END $$;

COMMIT;
```

---

## 10. `.env.example` addition

```bash
# Auth sync healer — disable after migration verified (heal logs → ~0 for 7 days)
AUTH_SYNC_HEALER_ENABLED=true
```

---

## Files Checklist

| # | File | Action |
|---|------|--------|
| 1 | `backend/services/store_slug_resolver.py` | NEW |
| 2 | `backend/routes/shop_business.py` | MODIFY |
| 3 | `frontend/lib/store/resolve-store-slug.ts` | NEW |
| 4 | `frontend/lib/auth/authSyncCache.ts` | NEW |
| 5 | `frontend/app/api/business/save/route.ts` | MODIFY |
| 6 | `frontend/app/api/auth/sync/route.ts` | MODIFY |
| 7 | `frontend/app/(dashboard)/layout.tsx` | MODIFY |
| 8 | `frontend/app/(dashboard)/components/BotSettingsView.tsx` | MODIFY |
| 9 | `frontend/app/components/auth/AuthProvider.tsx` | MODIFY (remove debug logs) |
| 10 | `supabase/migrations/20260629100000_fix_store_slug_plan_aware.sql` | NEW |

---

**To implement:** say **"execute the plan"** or **"proceed"** and I will apply these changes to the codebase.
