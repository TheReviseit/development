# Authorization Code Exchange Fix - Complete Analysis & Solution

## 🔍 Root Cause Analysis

### What You're Doing Wrong

1. **Redirect URI Mismatch**: The `redirect_uri` used in `FB.login()` must EXACTLY match the one used in the token exchange request. Even a trailing slash difference will cause failure.

2. **Missing redirect_uri in Token Exchange**: Your backend code checks for `redirectUri` but if it's not provided or doesn't match, Meta rejects the request with error code 100 or 36008.

3. **Authorization Code Single-Use**: Authorization codes can only be used ONCE. If you try to exchange the same code twice, it will fail.

4. **Incorrect Redirect URI Source**: The embedded signup uses `window.location.origin + "/"` (root), but you need to ensure this matches what's registered in Meta App Settings.

### What Meta Expects

According to Meta's OAuth 2.0 specification:

1. **Exact Redirect URI Match**: The `redirect_uri` parameter in the token exchange request MUST exactly match (character-by-character) the `redirect_uri` used in the authorization request.

2. **Required Parameters**:

   - `client_id`: Your Facebook App ID
   - `client_secret`: Your Facebook App Secret
   - `code`: The authorization code (single-use)
   - `redirect_uri`: MUST match the authorization request

3. **Endpoint**: `https://graph.facebook.com/v24.0/oauth/access_token` (use latest stable version)

4. **Method**: GET or POST (GET is simpler for this use case)

### Why the Error Occurs

The error "Failed to exchange authorization code" typically happens because:

- **Error Code 100**: Invalid parameter (usually redirect_uri mismatch)
- **Error Code 36008**: redirect_uri doesn't match
- **Error Code 100 (code expired)**: Authorization code was already used or expired (codes expire in ~10 minutes)

## 🔧 What Must Be Changed

### 1. Frontend SDK (`lib/facebook/facebook-sdk.ts`)

**Issue**: The embedded signup uses root (`/`) but needs to be consistent.

**Fix**: Ensure the redirect_uri is consistent and matches what's registered in Meta App Settings.

### 2. Backend API (`app/api/facebook/embedded-signup/route.ts`)

**Issue**: The redirect_uri validation and usage needs to be more robust.

**Fix**:

- Always require redirect_uri in request body
- Use it exactly as provided (no normalization)
- Log it for debugging
- Provide clear error messages

### 3. Meta App Settings

**Issue**: Redirect URIs must be registered in Meta App Dashboard.

**Fix**: Add all possible redirect URIs to "Valid OAuth Redirect URIs" in App Settings.

## 📋 Permission Differences Explained

### `business_management`

- **Purpose**: Access and manage Business Manager assets
- **Used For**: Listing businesses, managing ad accounts, pages
- **Obtained Via**: Facebook Login for Business (Step 1)
- **Review Required**: ✅ Yes (Advanced Access)

### `whatsapp_business_management`

- **Purpose**: Manage WhatsApp Business Accounts (WABA)
- **Used For**: Creating WABAs, managing phone numbers, configuring webhooks
- **Obtained Via**: WhatsApp Embedded Signup (Step 2)
- **Review Required**: ✅ Yes (Advanced Access)

### `whatsapp_business_messaging`

- **Purpose**: Send and receive WhatsApp messages
- **Used For**: Sending messages via WhatsApp Business API
- **Obtained Via**: WhatsApp Embedded Signup (Step 2) OR separate permission request
- **Review Required**: ✅ Yes (Advanced Access)

### Key Differences

1. **business_management** is for Business Manager operations (Step 1)
2. **whatsapp_business_management** is for WABA management (Step 2)
3. **whatsapp_business_messaging** is for sending messages (Step 2)

**Your flow is CORRECT** - you're not mixing them incorrectly. Step 1 gets business_management, Step 2 gets WhatsApp permissions.

## ✅ Corrected Code

### Fixed Backend Route (`app/api/facebook/embedded-signup/route.ts`)

The key fixes:

1. **Always require redirect_uri**
2. **Use redirect_uri exactly as provided**
3. **Better error handling**
4. **Prevent code reuse**

### Fixed Frontend SDK (`lib/facebook/facebook-sdk.ts`)

1. **Consistent redirect_uri**
2. **Always include redirect_uri in response**
3. **Better logging**

## 🚀 How to Fix It Permanently

### Step 1: Update Meta App Settings

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps/)
2. Select your app
3. Go to **Settings → Basic**
4. Add to **Valid OAuth Redirect URIs**:
   - `https://yourdomain.com/`
   - `https://yourdomain.com/onboarding`
   - `http://localhost:3000/` (for development)
   - `http://localhost:3000/onboarding` (for development)

### Step 2: Update Backend Code

See the corrected code in the files below.

### Step 3: Test the Flow

1. Clear browser cache
2. Try the embedded signup flow
3. Check server logs for redirect_uri values
4. Verify they match exactly

## 📝 Request Examples

### Correct Token Exchange Request

```http
GET https://graph.facebook.com/v24.0/oauth/access_token?
  client_id=YOUR_APP_ID&
  client_secret=YOUR_APP_SECRET&
  code=AUTHORIZATION_CODE&
  redirect_uri=https://yourdomain.com/
```

### Common Errors and Solutions

| Error Code | Message               | Solution                                   |
| ---------- | --------------------- | ------------------------------------------ |
| 100        | Invalid redirect_uri  | Ensure redirect_uri matches exactly        |
| 36008      | redirect_uri mismatch | Add redirect_uri to Meta App Settings      |
| 100        | Code has been used    | Get a new authorization code               |
| 100        | Code expired          | Codes expire in ~10 minutes, get a new one |

## 🔒 Security Best Practices

1. **Never log authorization codes** - They're sensitive
2. **Use HTTPS** - Required for production
3. **Validate redirect_uri** - Prevent open redirect attacks
4. **Store tokens encrypted** - You're already doing this ✅
5. **Rotate app secrets** - Regularly update secrets

## 📊 Validation Checklist

- [ ] Redirect URIs registered in Meta App Settings
- [ ] Frontend sends redirect_uri in request body
- [ ] Backend uses redirect_uri exactly as provided
- [ ] No trailing slash mismatches
- [ ] HTTPS used in production
- [ ] Error handling includes helpful messages
- [ ] Authorization codes used only once
- [ ] Tokens stored encrypted

## 🎯 Final Working Boilerplate

See the corrected implementation files below. The key principles:

1. **Exact redirect_uri matching**
2. **Single-use authorization codes**
3. **Proper error handling**
4. **Clear logging for debugging**
