# 🚀 QUICK START GUIDE

## ⚡ Get Up and Running in 30 Minutes

This guide gets you from zero to fully functional Facebook Login + WhatsApp Business integration.

---

## 📋 Prerequisites (5 minutes)

- [ ] Meta Developer account (https://developers.facebook.com)
- [ ] Facebook Business Manager (https://business.facebook.com)
- [ ] WhatsApp Business Account (can be created during setup)
- [ ] Your app deployed with HTTPS (Vercel/Netlify)

---

## STEP 1: Create Meta App (5 minutes)

1. Go to https://developers.facebook.com/apps
2. Click **"Create App"** → Select **"Business"**
3. Fill in:
   - **App Name**: "YourCompany WhatsApp Integration"
   - **Contact Email**: your@email.com
4. Click **"Create App"**

5. Add Products:
   - Click **"Add Product"** → **"Facebook Login"** → **"Set Up"**
   - Click **"Add Product"** → **"WhatsApp"** → **"Set Up"**

6. Get Credentials:
   - Go to **Settings → Basic**
   - Copy **App ID**
   - Copy **App Secret** (click "Show")

---

## STEP 2: Configure Meta App (5 minutes)

### App Settings

Go to **Settings → Basic**:

```
App Domains: reviseit.in
Privacy Policy URL: https://www.reviseit.in/privacy
Terms URL: https://www.reviseit.in/terms
Data Deletion URL: https://www.reviseit.in/data-deletion
```

### Facebook Login Settings

Go to **Facebook Login → Settings**:

```
Valid OAuth Redirect URIs:
  https://www.reviseit.in
  https://www.reviseit.in/onboarding
  http://localhost:3000 (for development)

✅ Enable: Login with the JavaScript SDK
✅ Enable: Use Strict Mode for Redirect URIs
```

---

## STEP 3: Set Environment Variables (3 minutes)

Create `frontend/.env.local`:

```bash
# Generate these:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Run twice to get two different keys ↓

# Meta
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
NEXT_PUBLIC_FACEBOOK_API_VERSION=v21.0

# WhatsApp
WHATSAPP_WEBHOOK_VERIFY_TOKEN=generated_key_1
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in

# Encryption
ENCRYPTION_KEY=generated_key_2

# Supabase (you already have these)
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

---

## STEP 4: Deploy Database Schema (2 minutes)

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `frontend/docs/facebook_whatsapp_schema.sql`
3. Paste and click **"Run"**
4. Verify tables created in Table Editor

---

## STEP 5: Deploy to Production (5 minutes)

### For Vercel:

```bash
cd frontend

# Deploy
vercel --prod

# Add environment variables in Vercel Dashboard:
# Project Settings → Environment Variables
# Add all variables from .env.local
```

### For Netlify:

```bash
cd frontend

# Deploy
netlify deploy --prod

# Add environment variables in Netlify Dashboard:
# Site settings → Environment variables
# Add all variables from .env.local
```

---

## STEP 6: Configure Webhook (3 minutes)

1. In Meta App Dashboard: **WhatsApp → Configuration**
2. Click **"Edit"** under Webhook
3. Enter:
   ```
   Callback URL: https://www.reviseit.in/api/webhooks/whatsapp
   Verify Token: (from WHATSAPP_WEBHOOK_VERIFY_TOKEN)
   ```
4. Click **"Verify and Save"**
5. Subscribe to fields: ✅ messages, ✅ message_status

---

## STEP 7: Test Locally (3 minutes)

```bash
cd frontend
npm run dev
```

Open http://localhost:3000/onboarding

1. Click "Connect WhatsApp Business"
2. Login with Facebook
3. Grant permissions
4. Select Business Manager (if you have multiple)

**Expected Result**: Should redirect through Facebook and return successfully

---

## STEP 8: Submit for App Review (2 minutes)

1. In Meta App Dashboard: **App Review → Permissions and Features**
2. Request Advanced Access for:
   - ✅ `business_management`
   - ✅ `whatsapp_business_management`
   - ✅ `whatsapp_business_messaging`

3. For each permission:
   - **Video**: Record 1-2 minute demo showing connection flow
   - **Description**: "Our SaaS platform allows businesses to connect their own WhatsApp Business Accounts to automate customer messaging."

4. Click **"Submit for Review"**

**Expected Time**: 3-7 business days for approval

---

## STEP 9: Test End-to-End (2 minutes)

While waiting for review approval, test with test users:

### Add Test User:
1. **Roles → Test Users** → Create
2. Login as test user
3. Test full connection flow

### Send Test Message:

```typescript
// In your code or API testing tool
const response = await fetch('/api/whatsapp/send-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '919876543210', // Your test number
    message: 'Hello from our platform!'
  })
});
```

---

## ✅ VERIFICATION CHECKLIST

- [ ] Meta app created
- [ ] Facebook Login product added
- [ ] WhatsApp product added
- [ ] App credentials obtained
- [ ] Environment variables set
- [ ] Database schema deployed
- [ ] App deployed to production (HTTPS)
- [ ] Webhook configured and verified
- [ ] Local testing successful
- [ ] App review submitted
- [ ] Test message sent successfully

---

## 🎉 YOU'RE DONE!

### What Happens Next:

**Immediately:**
- ✅ Test users can connect their WhatsApp
- ✅ You can test message sending
- ✅ Webhooks are receiving events

**After App Review (3-7 days):**
- ✅ Any Facebook user can connect
- ✅ Production customers can onboard
- ✅ Full WhatsApp messaging enabled

### Start Using:

```tsx
// Add to your onboarding page
import WhatsAppConnectionFlow from '@/app/components/facebook/WhatsAppConnectionFlow';

export default function Onboarding() {
  return <WhatsAppConnectionFlow />;
}
```

---

## 📚 Next Steps

### For Development:
- Read: `docs/FACEBOOK_WHATSAPP_README.md`
- Customize: UI components to match your brand
- Extend: Add features like template messages

### For Production:
- Monitor: Token expirations, webhook delivery
- Set up: Error tracking (Sentry)
- Configure: Alerts for failures

### For Scaling:
- Implement: Redis-based rate limiting
- Add: Background jobs for token refresh
- Build: Analytics dashboard

---

## 🐛 Quick Troubleshooting

### "Facebook SDK not loaded"
```bash
# Check env var is set
echo $NEXT_PUBLIC_FACEBOOK_APP_ID

# Restart dev server
npm run dev
```

### "Webhook verification failed"
```bash
# Check verify token matches in both places:
# 1. .env.local (WHATSAPP_WEBHOOK_VERIFY_TOKEN)
# 2. Meta Dashboard (Webhook verify token field)
```

### "Token expired"
- User needs to reconnect
- Check: `SELECT expires_at FROM connected_facebook_accounts`

---

## 📞 Need Help?

- **Setup Issues**: Check `docs/FACEBOOK_WHATSAPP_SETUP.md`
- **Architecture**: See `docs/ARCHITECTURE_SECURITY.md`
- **Meta Support**: https://developers.facebook.com/support

---

**⏱️ Total Time: ~30 minutes**

**🎯 Result: Fully functional multi-tenant WhatsApp integration**

**🚀 Ready to scale!**

---

*Last Updated: December 14, 2024*

