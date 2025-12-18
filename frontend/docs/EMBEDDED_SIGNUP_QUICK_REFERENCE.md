# WhatsApp Embedded Signup v4 - Quick Reference

## 🎯 What Changed

### New Files Created

1. **Webhook Handler**: `/app/api/webhooks/whatsapp/account-update/route.ts`
2. **Setup Guide**: `/docs/EMBEDDED_SIGNUP_SETUP.md`

### Files Modified

1. **SDK**: `/lib/facebook/facebook-sdk.ts` - Added message event listener
2. **UI**: `/app/components/facebook/EmbeddedSignupButton.tsx` - Captures message events

---

## ⚙️ Configuration Required

### 1. Environment Variables

Add to `.env.local`:

```bash
# Generate this token first:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_random_token_here
```

### 2. Facebook App Dashboard

**Go to: App Dashboard → Facebook Login for Business → Settings**

Enable these 6 toggles to **Yes**:

- ✅ Client OAuth login
- ✅ Web OAuth login
- ✅ Enforce HTTPS
- ✅ Embedded Browser OAuth Login
- ✅ Use Strict Mode for Redirect URIs
- ✅ Login with the JavaScript SDK

Add your domains:

- **Allowed Domains**: `localhost`, `yourdomain.com`
- **Valid OAuth Redirect URIs**: `http://localhost:3000/onboarding`, `https://yourdomain.com/onboarding`

**Go to: App Dashboard → Webhooks**

1. Add subscription for WhatsApp Business Account
2. Webhook URL: `https://yourdomain.com/api/webhooks/whatsapp/account-update`
3. Verify token: (same as `FACEBOOK_WEBHOOK_VERIFY_TOKEN`)
4. Subscribe to `account_update` field

---

## 🧪 Quick Test

### Test Message Events

```bash
# 1. Start your dev server
npm run dev

# 2. Open browser DevTools Console (F12)
# 3. Navigate to /onboarding
# 4. Click "Connect WhatsApp Business"
# 5. Complete the flow

# Expected in console:
# 📨 [Facebook SDK] WA_EMBEDDED_SIGNUP message event
# ✅ [Facebook SDK] Flow completed successfully
```

### Test Webhook (Local)

```bash
# 1. Install ngrok
# Download from: https://ngrok.com/download

# 2. Start ngrok
ngrok http 3000

# 3. Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# 4. Add to App Dashboard webhook settings
# 5. Complete Embedded Signup flow
# 6. Check server logs for webhook event
```

---

## 📊 What Gets Captured

### From Message Events

- ✅ WABA ID (WhatsApp Business Account ID)
- ✅ Phone Number ID
- ✅ Business Portfolio ID
- ✅ Flow abandonment tracking
- ✅ User-reported errors

### From Webhooks

- ✅ Same data via `account_update` event
- ✅ Server-side verification

---

## 🔍 Debugging

**Message events not captured?**

```bash
# Check browser console for:
"[Facebook SDK] Message event listener registered"

# If missing, check:
- SDK initialized properly
- No JavaScript errors
- Allowed domains configured
```

**Webhook not receiving events?**

```bash
# Check server logs for:
"🔔 [Webhook] Verification request received"

# If missing:
- Webhook URL correct (HTTPS)
- Verify token matches .env
- Subscribed to account_update
```

---

## 📚 Full Documentation

- **Setup Guide**: [EMBEDDED_SIGNUP_SETUP.md](file:///c:/Users/Sugan001/Desktop/reviseit/frontend/docs/EMBEDDED_SIGNUP_SETUP.md)
- **Implementation Details**: [walkthrough.md](file:///C:/Users/Sugan001/.gemini/antigravity/brain/4afe1bab-6069-4425-98ea-9e8b7b4934e5/walkthrough.md)
