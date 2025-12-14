# 🚀 EMBEDDED SIGNUP SETUP GUIDE

## Configuration ID: `24485844957687744`

This guide shows you how to use Meta's **Embedded Signup** for streamlined WhatsApp Business onboarding.

---

## ✨ What is Embedded Signup?

**Embedded Signup** is Meta's pre-configured onboarding flow that handles:
- ✅ Facebook Login
- ✅ Business Manager selection
- ✅ WhatsApp Business Account selection  
- ✅ Phone number selection
- ✅ Permission granting

All in **one Meta-powered popup** - no custom UI needed!

---

## 📋 QUICK SETUP (10 minutes)

### Step 1: Add Configuration ID to Environment

```bash
# Add to frontend/.env.local
NEXT_PUBLIC_FACEBOOK_CONFIG_ID=24485844957687744
```

### Step 2: Verify Other Environment Variables

```bash
# Make sure these are also set:
NEXT_PUBLIC_FACEBOOK_APP_ID=716209008213794
FACEBOOK_APP_SECRET=your_app_secret
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in
ENCRYPTION_KEY=your_64_char_hex_key
```

### Step 3: Deploy Database Schema

If you haven't already:

1. Open Supabase SQL Editor
2. Run `frontend/docs/facebook_whatsapp_schema.sql`
3. Verify tables created

### Step 4: Use Embedded Signup Page

Two options:

#### Option A: New Embedded Page (Recommended)
```typescript
// Use the new embedded onboarding page
// Navigate users to: /onboarding-embedded
```

#### Option B: Replace Existing Onboarding
```bash
# Backup current onboarding
mv frontend/app/onboarding/page.tsx frontend/app/onboarding/page.manual.tsx

# Use embedded version
cp frontend/app/onboarding-embedded/page.tsx frontend/app/onboarding/page.tsx
```

---

## 🎯 HOW TO USE

### In Your App

```typescript
// Redirect new users to embedded onboarding
import EmbeddedSignupButton from '@/app/components/facebook/EmbeddedSignupButton';

export default function YourPage() {
  return (
    <div>
      <h1>Connect WhatsApp Business</h1>
      <EmbeddedSignupButton 
        onSuccess={() => console.log('Connected!')}
        onError={(error) => console.error(error)}
      />
    </div>
  );
}
```

### What Happens:

```
1. User clicks "Connect WhatsApp Business"
   ↓
2. Meta popup opens with your Configuration
   ↓
3. User logs in with Facebook
   ↓
4. Meta shows: Select Business Manager
   ↓
5. Meta shows: Select WhatsApp Account
   ↓
6. Meta shows: Select Phone Number
   ↓
7. User grants permissions
   ↓
8. Callback returns with all selections
   ↓
9. Backend stores everything automatically
   ↓
10. Redirect to dashboard ✅
```

---

## 🔧 CONFIGURATION SETTINGS

### In Meta Dashboard

1. Go to: **Facebook Login for Business → Configurations**
2. Click **"Edit"** on your Reviseit configuration
3. Verify settings:

#### Business Verification
```
✅ Enabled
✅ Connected to your Business Manager
```

#### Permissions
```
✅ business_management
✅ whatsapp_business_management  
✅ whatsapp_business_messaging
✅ public_profile
✅ email
```

#### Callback URL (if needed)
```
https://www.reviseit.in/onboarding-embedded
```

---

## 📊 COMPARISON: Manual vs Embedded

| Feature | Manual Flow | Embedded Signup |
|---------|-------------|-----------------|
| Setup Time | 30 min | 10 min |
| User Steps | 4 steps | 1 popup |
| UI Control | Full | Meta's UI |
| Code to Write | More | Less |
| Configuration Needed | No | Yes (you have it!) |
| User Experience | Custom | Faster |
| **Recommended** | Testing | Production ✅ |

---

## 🎨 UI COMPONENTS

### EmbeddedSignupButton

Simple button component:

```typescript
import EmbeddedSignupButton from '@/app/components/facebook/EmbeddedSignupButton';

<EmbeddedSignupButton 
  onSuccess={() => {
    // Handle success
    router.push('/dashboard');
  }}
  onError={(error) => {
    // Handle error
    console.error(error);
  }}
  className="custom-class"
/>
```

### Props:
- `onSuccess?: () => void` - Called after successful connection
- `onError?: (error: string) => void` - Called on error
- `className?: string` - Additional CSS classes

---

## 🔄 API ENDPOINTS

### POST `/api/facebook/embedded-signup`

Handles the complete embedded signup flow.

**Request:**
```json
{
  "accessToken": "EAABw...",
  "userID": "123456789",
  "expiresIn": 5183944,
  "grantedPermissions": ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"],
  "setupData": {}
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "facebookAccount": { "id": "...", "status": "active" },
    "businessManagers": [{ "id": "...", "business_name": "..." }],
    "whatsappAccounts": [{ "id": "...", "waba_id": "..." }],
    "phoneNumbers": [{ "id": "...", "display_phone_number": "+1234567890" }],
    "summary": {
      "businessManagersCount": 1,
      "whatsappAccountsCount": 1,
      "phoneNumbersCount": 1
    }
  }
}
```

**What it does:**
1. ✅ Validates user session
2. ✅ Exchanges token (short → long-lived)
3. ✅ Fetches user profile
4. ✅ Stores Facebook account (encrypted)
5. ✅ Fetches ALL Business Managers
6. ✅ Fetches ALL WhatsApp Accounts
7. ✅ Fetches ALL Phone Numbers
8. ✅ Sets up webhooks
9. ✅ Returns complete connection data

---

## 🧪 TESTING

### Test Locally

```bash
cd frontend
npm run dev
```

Open: http://localhost:3000/onboarding-embedded

1. Click "Connect WhatsApp Business"
2. Meta popup should open
3. Login with Facebook
4. Select your test Business Manager
5. Select test WABA
6. Select test phone number
7. Grant permissions
8. Should redirect to dashboard

### Verify in Database

```sql
-- Check Facebook connection
SELECT * FROM connected_facebook_accounts 
WHERE user_id = 'your-user-id';

-- Check Business Managers
SELECT * FROM connected_business_managers 
WHERE user_id = 'your-user-id';

-- Check WhatsApp Accounts
SELECT * FROM connected_whatsapp_accounts 
WHERE user_id = 'your-user-id';

-- Check Phone Numbers
SELECT * FROM connected_phone_numbers 
WHERE user_id = 'your-user-id';
```

---

## 🚨 TROUBLESHOOTING

### Issue: "Configuration ID not set"

**Solution:**
```bash
# Check .env.local
echo $NEXT_PUBLIC_FACEBOOK_CONFIG_ID

# Should output: 24485844957687744
# If not, add it and restart server
```

### Issue: Meta popup doesn't open

**Solution:**
1. Check browser console for errors
2. Verify `NEXT_PUBLIC_FACEBOOK_APP_ID` is set
3. Check Site URL in Meta dashboard matches your domain
4. Try clearing browser cache

### Issue: "Missing permissions"

**Solution:**
1. Check Configuration in Meta dashboard
2. Ensure all 5 permissions are included
3. Re-request permissions if needed

### Issue: Webhook not verified

**Solution:**
1. Go to: WhatsApp → Configuration
2. Click "Edit" under Webhook
3. Enter callback URL: `https://www.reviseit.in/api/webhooks/whatsapp`
4. Enter verify token from `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
5. Click "Verify and Save"

---

## 📦 WHAT'S INCLUDED

### New Files Created:

1. **`app/components/facebook/EmbeddedSignupButton.tsx`**
   - Ready-to-use button component
   - Permission info panel
   - Error handling

2. **`app/api/facebook/embedded-signup/route.ts`**
   - Complete backend handler
   - Token exchange
   - Data fetching & storage
   - Webhook setup

3. **`app/onboarding-embedded/page.tsx`**
   - Full onboarding page
   - Beautiful UI
   - Mobile responsive

4. **`lib/facebook/facebook-sdk.ts`** (updated)
   - Added `launchEmbeddedSignup()` method
   - Configuration ID support

---

## ✅ PRODUCTION CHECKLIST

Before going live:

- [ ] Configuration ID added to `.env.local`
- [ ] Configuration verified in Meta dashboard
- [ ] All permissions included in Configuration
- [ ] Database schema deployed
- [ ] Webhook configured and verified
- [ ] Tested full flow locally
- [ ] Tested with test users
- [ ] Environment variables in production (Vercel/Netlify)
- [ ] Meta app switched to Live mode
- [ ] Advanced permissions approved

---

## 🎯 NEXT STEPS

1. **Test locally**: Run `npm run dev` and test the flow
2. **Deploy**: Push to production with environment variables
3. **Configure webhook**: Set up in Meta dashboard
4. **Submit for review**: Request advanced permissions
5. **Go live**: After Meta approval (3-7 days)

---

## 🎉 BENEFITS OF EMBEDDED SIGNUP

✅ **Faster**: One popup vs multiple steps  
✅ **Simpler**: Less code to maintain  
✅ **Secure**: Meta handles the flow  
✅ **Tested**: Meta's proven UI/UX  
✅ **Mobile-friendly**: Works great on phones  
✅ **Auto-updates**: Meta keeps it current  

---

## 📞 SUPPORT

- **Setup Issues**: Check this guide first
- **Meta Configuration**: https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- **Graph API**: https://developers.facebook.com/docs/graph-api
- **WhatsApp Cloud API**: https://developers.facebook.com/docs/whatsapp/cloud-api

---

**🎉 You're using Embedded Signup - the fastest way to onboard customers!**

*Configuration ID: `24485844957687744`*  
*Last Updated: December 14, 2024*

