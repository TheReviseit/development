# Token Exchange Fix - redirect_uri Issue ✅

## Problem

The backend was NOT using the `redirect_uri` when exchanging the authorization code for an access token, causing a 400 error:

```
POST https://www.reviseit.in/api/facebook/login-for-business 400 (Bad Request)
[LoginForBusiness] Backend error: Failed to exchange authorization code
```

## Root Cause

The `/api/facebook/login-for-business` endpoint had a comment saying:

```typescript
// IMPORTANT: Do NOT include redirect_uri when using FB SDK popup flow
```

But this was incorrect! Facebook DOES require the redirect_uri to match what was used in the OAuth dialog, even for popup flows.

## Fix Applied

Updated `app/api/facebook/login-for-business/route.ts` to:

1. Read `redirectUri` from request body
2. Include it in the token exchange request
3. Log it for debugging

**Before:**

```typescript
const params = new URLSearchParams({
  client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
  client_secret: process.env.FACEBOOK_APP_SECRET!,
  code,
  // redirect_uri was NOT included
});
```

**After:**

```typescript
const params = new URLSearchParams({
  client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
  client_secret: process.env.FACEBOOK_APP_SECRET!,
  code,
});

// Add redirect_uri if provided
if (redirectUri) {
  params.append("redirect_uri", redirectUri);
}
```

## Next Steps

1. **Deploy this fix** to production
2. **Try the flow again** - it should work now!

The frontend is already sending the correct `redirect_uri`:

```
https://www.reviseit.in/onboarding
```

And now the backend will use it properly.

## Testing

After deploying, try the Facebook Login for Business flow again. You should see in the server logs:

```
✅ [Login for Business API] Using redirect_uri: https://www.reviseit.in/onboarding
✅ [Login for Business API] Code exchange succeeded
```

Instead of the 400 error.
