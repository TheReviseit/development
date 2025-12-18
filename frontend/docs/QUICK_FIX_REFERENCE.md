# Quick Fix Reference - Authorization Code Exchange

## 🚨 The Problem

**Error**: "Failed to exchange authorization code"

**Root Cause**: `redirect_uri` mismatch between authorization request and token exchange

## ✅ The Solution (3 Steps)

### Step 1: Add Redirect URIs to Meta App Settings

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps/)
2. Settings → Basic → Valid OAuth Redirect URIs
3. Add:
   - `https://yourdomain.com/`
   - `https://yourdomain.com/onboarding`

### Step 2: Verify Code Changes

✅ **Already Fixed** in your codebase:
- `app/api/facebook/embedded-signup/route.ts` - Enhanced error handling
- `lib/facebook/facebook-sdk.ts` - Consistent redirect_uri
- `app/components/facebook/EmbeddedSignupButton.tsx` - Uses SDK redirect_uri

### Step 3: Test

1. Clear browser cache
2. Try embedded signup flow
3. Check logs for redirect_uri values

## 🔍 Quick Debug

### Check Logs

**Success**:
```
✅ [Embedded Signup API] Code exchange succeeded
```

**Failure**:
```
❌ [Embedded Signup API] Code exchange failed
Meta Error: redirect_uri mismatch (36008)
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Error 36008 | Add redirect_uri to Meta App Settings |
| Error 100 (code) | Get new authorization code (restart flow) |
| Missing redirect_uri | Check frontend sends it in request body |

## 📋 Permission Summary

- **Step 1** (`business_management`): Facebook Login for Business
- **Step 2** (`whatsapp_business_management` + `whatsapp_business_messaging`): Embedded Signup

✅ Your flow is correct - not mixing permissions incorrectly.

## 🎯 Key Points

1. **redirect_uri must match exactly** (character-by-character)
2. **Authorization codes are single-use** (expire in ~10 minutes)
3. **Add redirect URIs to Meta App Settings** before testing
4. **Use HTTPS in production** (required by Meta)

## 📚 Full Documentation

See `WHATSAPP_OAUTH_COMPLETE_FIX.md` for complete details.

---

**Status**: ✅ Fixed and ready to deploy

