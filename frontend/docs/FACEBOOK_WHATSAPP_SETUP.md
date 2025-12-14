# Facebook Login + WhatsApp Business Cloud API Setup Guide

## 🎯 Overview

This guide explains how to set up Facebook Login and WhatsApp Business Cloud API integration for your multi-tenant SaaS platform. Each customer connects their own WhatsApp Business Account.

---

## 📋 Prerequisites

Before starting, ensure you have:

1. ✅ A Facebook Business Manager account
2. ✅ A Meta Developer account (https://developers.facebook.com)
3. ✅ Your application domain (e.g., `https://www.reviseit.in`)
4. ✅ Access to your hosting platform environment variables

---

## 🔧 Part 1: Meta App Setup

### Step 1: Create a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/apps)
2. Click **"Create App"**
3. Select **"Business"** as the app type
4. Fill in app details:
   - **App Name**: Your SaaS Name (e.g., "ReviseIt WhatsApp Integration")
   - **Contact Email**: Your business email
   - **Business Account**: Select your Business Manager

### Step 2: Get App Credentials

1. In your app dashboard, go to **Settings → Basic**
2. Copy the following:
   - **App ID**
   - **App Secret** (click "Show" to reveal)
3. Save these securely - you'll need them for environment variables

### Step 3: Configure App Domain

1. In **Settings → Basic**, add your domains:
   - **App Domains**: `reviseit.in` (without https://)
   - **Privacy Policy URL**: `https://www.reviseit.in/privacy`
   - **Terms of Service URL**: `https://www.reviseit.in/terms`
   - **Data Deletion Instructions URL**: `https://www.reviseit.in/data-deletion`

2. Scroll to **"Tell us how you use this app"** and select:
   - ✅ **Integrate Facebook Login**

### Step 4: Add Products

#### Add Facebook Login

1. Click **"Add Product"** in the sidebar
2. Find **"Facebook Login"** and click **"Set Up"**
3. Choose **"Web"** platform
4. Enter your Site URL: `https://www.reviseit.in`
5. In **Facebook Login → Settings**:
   - **Valid OAuth Redirect URIs**: 
     ```
     https://www.reviseit.in
     https://www.reviseit.in/onboarding
     http://localhost:3000 (for development)
     ```
   - **Login with the JavaScript SDK**: Enable
   - **Use Strict Mode for Redirect URIs**: Enable

#### Add WhatsApp Product

1. Click **"Add Product"** again
2. Find **"WhatsApp"** and click **"Set Up"**
3. Follow the wizard to:
   - Link your Business Manager
   - Create or select a test WhatsApp Business Account
   - Get a test phone number

---

## 🔐 Part 2: Environment Variables

### Required Environment Variables

Create/update `.env.local` in your `frontend` directory:

```bash
# ========================================
# META (FACEBOOK) CONFIGURATION
# ========================================

# Facebook App Credentials
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here

# Facebook API Version (use latest stable)
NEXT_PUBLIC_FACEBOOK_API_VERSION=v21.0

# ========================================
# WHATSAPP WEBHOOK CONFIGURATION
# ========================================

# Webhook Verify Token (generate a random string)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_random_verify_token_here

# Your site URL (for webhook callbacks)
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in

# ========================================
# ENCRYPTION (REQUIRED FOR TOKEN STORAGE)
# ========================================

# Generate using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_64_char_hex_encryption_key_here

# ========================================
# SUPABASE (DATABASE)
# ========================================

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ========================================
# FIREBASE (EXISTING AUTH)
# ========================================

NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key
```

### How to Generate Required Values

#### Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Webhook Verify Token
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Part 3: Database Setup

### Run the Schema Migration

Execute the SQL schema in your Supabase dashboard:

```bash
# File: frontend/docs/facebook_whatsapp_schema.sql
```

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `facebook_whatsapp_schema.sql`
4. Click **"Run"**

This creates:
- `connected_facebook_accounts` table
- `connected_business_managers` table
- `connected_whatsapp_accounts` table
- `connected_phone_numbers` table
- `whatsapp_messages` table
- `webhook_events_log` table
- Helper functions and views

---

## 🔗 Part 4: Webhook Setup

### Configure Webhook in Meta

1. In your Meta app dashboard, go to **WhatsApp → Configuration**
2. Click **"Edit"** under **Webhook**
3. Enter:
   - **Callback URL**: `https://www.reviseit.in/api/webhooks/whatsapp`
   - **Verify Token**: (use the value from `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
4. Click **"Verify and Save"**

### Subscribe to Webhook Fields

After verification, subscribe to:
- ✅ `messages` - Incoming messages
- ✅ `message_status` - Message delivery status

### Test Your Webhook

1. Send a test message to your WhatsApp test number
2. Check your webhook logs in Supabase:
   ```sql
   SELECT * FROM webhook_events_log ORDER BY received_at DESC LIMIT 10;
   ```

---

## 🔒 Part 5: App Review & Permissions

### Required Permissions

Your app needs these permissions (some require Meta review):

| Permission | Purpose | Review Required |
|------------|---------|-----------------|
| `public_profile` | Basic user info | ❌ No |
| `email` | User email | ❌ No |
| `business_management` | Access Business Manager | ✅ Yes |
| `whatsapp_business_management` | Manage WABA | ✅ Yes |
| `whatsapp_business_messaging` | Send/receive messages | ✅ Yes |

### Submit for App Review

1. In your Meta app dashboard, go to **App Review → Permissions and Features**
2. Click **"Request Advanced Access"** for:
   - `business_management`
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`

3. For each permission, provide:
   - **Video/Screenshots** showing how you use it
   - **Detailed description** of your use case
   - **Privacy Policy** link
   - **Terms of Service** link

### Tips for Approval

✅ **DO:**
- Clearly explain your SaaS business model
- Show that customers connect their own WABAs
- Demonstrate data security measures
- Provide complete documentation

❌ **DON'T:**
- Share credentials with customers
- Use your own WABA for all users
- Request more permissions than needed
- Skip privacy policy/terms

### Review Timeline

- Standard permissions: Instant
- Advanced permissions: 3-7 business days
- Can take longer during high volume

---

## 🚀 Part 6: Testing

### Development Mode Testing

Before app review, you can test with:
- ✅ Test users added to your app
- ✅ Test phone numbers
- ✅ Your own Business Manager

Add test users:
1. Go to **Roles → Test Users**
2. Create test users
3. Test the full flow

### Production Checklist

Before going live:

- [ ] All environment variables set in production
- [ ] Database schema deployed
- [ ] SSL certificate configured (https)
- [ ] Webhooks verified
- [ ] App reviewed and approved
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Data deletion instructions published
- [ ] Error logging configured
- [ ] Monitoring set up

---

## 📖 Part 7: Usage Examples

### Frontend: Connect WhatsApp

```tsx
import WhatsAppConnectionFlow from '@/app/components/facebook/WhatsAppConnectionFlow';

export default function OnboardingPage() {
  return <WhatsAppConnectionFlow />;
}
```

### Backend: Send Message

```typescript
// In your API route
import { sendWhatsAppMessage } from '@/lib/facebook/graph-api-client';

const response = await fetch('/api/whatsapp/send-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '919876543210', // E.164 format without +
    message: 'Hello from our platform!'
  })
});
```

### Check Connection Status

```typescript
const response = await fetch('/api/facebook/login');
const data = await response.json();

if (data.connected) {
  console.log('WhatsApp connected:', data.account);
} else {
  // Show connection flow
}
```

---

## 🐛 Part 8: Troubleshooting

### Common Issues

#### Facebook SDK Not Loading

**Error:** "Facebook SDK not loaded"

**Solution:**
- Check that `NEXT_PUBLIC_FACEBOOK_APP_ID` is set
- Verify your domain is whitelisted in Meta app settings
- Check browser console for errors

#### Token Expired

**Error:** "Facebook token expired"

**Solution:**
- Token refresh happens automatically
- If failed, user needs to reconnect
- Check `expires_at` in `connected_facebook_accounts` table

#### Webhook Not Receiving Messages

**Error:** No entries in `webhook_events_log`

**Solution:**
- Verify webhook URL is accessible (not localhost)
- Check webhook verify token matches
- Ensure webhook subscriptions are active
- Check Meta app is in live mode (not development)

#### Permission Denied

**Error:** "Missing permission: whatsapp_business_messaging"

**Solution:**
- Request advanced access in App Review
- While pending, only works for test users
- Check permission status in Meta app dashboard

### Debug Mode

Enable detailed logging:

```typescript
// Add to your API routes
console.log('Request:', {
  userId: user.id,
  endpoint: request.url,
  timestamp: new Date().toISOString()
});
```

### Check Database State

```sql
-- View all connections for a user
SELECT * FROM user_whatsapp_connections 
WHERE user_email = 'user@example.com';

-- Check message history
SELECT * FROM whatsapp_messages 
WHERE user_id = 'uuid-here' 
ORDER BY created_at DESC 
LIMIT 50;

-- View webhook events
SELECT * FROM webhook_events_log 
WHERE processed = false;
```

---

## 🔐 Security Best Practices

### Token Storage

✅ **DO:**
- Always encrypt access tokens using `encryptToken()`
- Store encrypted tokens in database
- Never send decrypted tokens to frontend
- Rotate encryption keys periodically

❌ **DON'T:**
- Store plain text tokens
- Log tokens in error messages
- Send tokens in URL parameters
- Share tokens between users

### API Security

```typescript
// Rate limiting example
import { rateLimiter } from '@/lib/security/security-utils';

const limit = rateLimiter.checkLimit(userId, 10, 60000); // 10 req/min
if (!limit.allowed) {
  return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
}
```

### Webhook Verification

Always verify webhook signatures:

```typescript
import { verifyMetaWebhookSignature } from '@/lib/security/security-utils';

const isValid = verifyMetaWebhookSignature(
  body,
  signature,
  process.env.FACEBOOK_APP_SECRET!
);

if (!isValid) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
}
```

---

## 📚 Additional Resources

- [Meta for Developers](https://developers.facebook.com)
- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Business Manager](https://business.facebook.com)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer)
- [WhatsApp Policy](https://www.whatsapp.com/legal/business-policy)

---

## 🆘 Support

If you encounter issues:

1. Check this documentation first
2. Review [Meta's developer docs](https://developers.facebook.com/docs)
3. Check [Meta's changelog](https://developers.facebook.com/docs/graph-api/changelog) for API changes
4. Contact Meta support for platform-specific issues

---

*Last Updated: December 2024*

