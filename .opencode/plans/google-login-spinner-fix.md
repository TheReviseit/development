# Google Login Spinner Fix — Final Plan

## Root Cause Summary

### Issue A: Popup retry spawns unwanted second popup (UX BREAKER)
**File:** `frontend/lib/auth/firebase-auth.ts:52`
**Current:** `popupRetryAttempts: 1`
**Problem:** When user closes the Google popup, `classifyAuthError` returns `"popup_closed"` with `shouldRetry: true`. The hybrid auth waits 500ms then opens a **second popup**. User experiences: "once i closed and again its opening". The button spinner stays on during the 500ms delay and the second popup.
**Fix:** Changed to `popupRetryAttempts: 0` — no retry on popup close. The code falls through directly to the redirect fallback.

### Issue B: Login page perma-spinner on router.replace failure
**File:** `frontend/app/login/page.tsx:609`
**Current:** `router.replace(...)` called without `setGoogleLoading(false)` first.
**Problem:** If `router.replace` fails silently (Next.js error boundary, middleware redirect loop, 404 destination), the component stays mounted with `googleLoading = true`. Spinner never stops without manual refresh.
**Fix:** Added `setGoogleLoading(false)` immediately before `router.replace(...)`.

### Issue C: Signup page missing 10-second redirect safety net (LOAD-BEARING TIMEOUT)
**File:** `frontend/app/signup/page.tsx`
**Current:** Has `isRedirectPending` state (line 376) and shows "Completing sign up..." UI (line 915), but has **no timeout recovery**.
**Problem:** Login page has a `useEffect` safety net (login/page.tsx:389-400) that clears `isRedirectPending` and `googleLoading` after 10s. Signup page is missing this entirely. If `signInWithRedirect` silently fails (blocked redirect, storage quota, browser policy), the "Completing sign up..." spinner stays **indefinitely**.
**Fix:** Added identical `useEffect` with 10-second timeout that resets `isRedirectPending(false)`, `setGoogleLoading(false)`, and shows an error message.

### Issue D: (ALREADY FIXED in prior round) Signup page redirect case
**File:** `frontend/app/signup/page.tsx:718`
**Problem:** When `result.method === "redirect"`, the handler returned without calling `setGoogleLoading(false)`. The button spinner stayed on even though the redirect case expects it to stop.
**Fix:** Added `setGoogleLoading(false)` before `setIsRedirectPending(true)` in the redirect fallback case.

---

## Gap Audit Results (per your review feedback)

### Gap 1: What if `initiateRedirectSignIn` throws synchronously?
**Audited:** `frontend/lib/auth/firebase-auth.ts:310-337`

`initiateRedirectSignIn` wraps everything in a try-catch:
- `setRedirectInProgress()` — uses `safeSetStorageValue()` which has internal try-catch; never throws
- `signInWithRedirect()` — any error (sync or async) caught by the outer catch
- If caught: `clearRedirectInProgress()` is called, returns `{ success: false, error, method: "redirect" }`
- Login/signup handlers process `{ success: false }` in their else/catch blocks, which call `setGoogleLoading(false)`

**Verdict:** No fourth spinner-leak vector. The existing catch block correctly routes all errors through the `{ success: false }` path which both pages handle.

### Gap 2: Where is the 10-second safety net? Is it verified?
**Login page:** `frontend/app/login/page.tsx:389-400` ✅ Verified — uses `useEffect` with `isRedirectPending` dependency, cleanup clears the timeout.

**Signup page:** WAS MISSING ❌ — Now added via Issue C fix above.

---

## Post-Fix Behavior Flow

**User clicks Google → popup opens → user closes it:**

1. `attemptPopupSignIn` returns `{ success: false, error: auth/popup-closed-by-user }`
2. `classifyAuthError` → `{ shouldRetry: true, shouldFallback: true }`
3. **No retry** (popupRetryAttempts is `0`)
4. Falls directly to redirect fallback: `initiateRedirectSignIn`
5. `signInWithRedirect` saves OAuth state to sessionStorage

**Case A — Redirect navigates away:**
6. `window.location.assign(...)` → page navigates to Google OAuth
7. Component unmounts → all state lost → spinner gone

**Case B — Redirect silently fails:**
6. `signInWithRedirect` returns without navigating
7. `initiateRedirectSignIn` returns `{ success: true, method: "redirect" }`
8. Login/signup handler runs redirect case:
   - `setGoogleLoading(false)` → button spinner OFF
   - `setIsRedirectPending(true)` → "Completing sign-in..." UI ON
9. **10-second safety net fires:**
   - `setIsRedirectPending(false)` → page spinner OFF
   - `setGoogleLoading(false)` → button stays normal
   - `setError(...)` → user sees actionable error message

---

## Changes Applied

| # | File | Line | Change | Why |
|---|------|------|--------|-----|
| A | `frontend/lib/auth/firebase-auth.ts` | 52 | `popupRetryAttempts: 1` → `0` | Stops second popup from appearing after user closes first |
| B | `frontend/app/login/page.tsx` | 609 | Added `setGoogleLoading(false)` before `router.replace(...)` | Guards against silent router.replace failure leaving spinner forever |
| C | `frontend/app/signup/page.tsx` | 378-388 | Added 10s `useEffect` safety net (was missing entirely) | Prevents indefinite "Completing sign-up..." spinner |
| D | `frontend/app/signup/page.tsx` | 718 | Added `setGoogleLoading(false)` in redirect case | Already fixed in prior round |

## Blast Radius Analysis

- **Mobile/WebView** (`shouldPreferRedirect`): No change — already uses `enablePopupRetry: false`, so retry was already disabled
- **Cross-origin isolated** (`getRecommendedConfig`): No change — explicitly overrides with `popupRetryAttempts: 1`
- **Normal desktop** (`getRecommendedConfig` returns `{}`): Uses new default `popupRetryAttempts: 0` — no retry
- **GoogleSignInButton.tsx** (reusable component): Uses `useFirebaseAuth` hook which calls `signInWithGoogleHybrid` — inherits all fixes above. Verified `finally` block resets `localLoading`.
- **useFirebaseAuth.ts** (hook): Has `setLoading(false)` on all paths (redirect case line 166, success line 177, catch line 190) — no additional fix needed.
