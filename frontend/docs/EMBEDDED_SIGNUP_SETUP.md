# WhatsApp Embedded Signup v4 Setup Guide

This guide walks you through configuring your Facebook App for WhatsApp Embedded Signup v4, including webhooks and OAuth settings.

## Prerequisites

- A Facebook Developer account
- A Facebook App created in the [App Dashboard](https://developers.facebook.com/apps)
- Solution Partner or Tech Provider status
- A line of credit (for Solution Partners)
- SSL certificate for your production domain

---

## Step 1: Configure Client OAuth Settings

### Navigate to Facebook Login for Business Settings

1. Open your app in the [Facebook App Dashboard](https://developers.facebook.com/apps)
2. In the left sidebar, find **Facebook Login for Business**
3. Click on **Settings**
4. Under **Client OAuth Settings**, enable the following toggles to **Yes**:

   ✅ **Client OAuth login**  
   ✅ **Web OAuth login**  
   ✅ **Enforce HTTPS**  
   ✅ **Embedded Browser OAuth Login**  
   ✅ **Use Strict Mode for Redirect URIs**  
   ✅ **Login with the JavaScript SDK**

### Add Allowed Domains and OAuth Redirect URIs

In the same settings page:

**Allowed Domains for the JavaScript SDK**:

```
localhost  (for local development)
YOUR_PRODUCTION_DOMAIN.com
```

**Valid OAuth Redirect URIs**:

```
http://localhost:3000/onboarding  (for local development)
https://YOUR_PRODUCTION_DOMAIN.com/onboarding
```

> [!IMPORTANT]
> Only domains with HTTPS enabled are supported in production. For local development, you can use `http://localhost:3000`.

**Click Save Changes** at the bottom of the page.

---

## Step 2: Create Facebook Login for Business Configuration

### Option A: Use Template (Recommended)

1. In the App Dashboard, go to **Facebook Login for Business** → **Configurations**
2. Click **Create from template**
3. Select **WhatsApp Embedded Signup Configuration With 60 Expiration Token**
4. This pre-configures the most commonly used permissions and access levels
5. **Copy the Configuration ID** - you'll need this for your `.env` file

### Option B: Create Custom Configuration

1. Go to **Facebook Login for Business** → **Configurations**
2. Click **Create configuration**
3. Give it a descriptive name (e.g., "WhatsApp Embedded Signup Production")
4. Select **WhatsApp Embedded Signup** as the login variation
5. Choose permissions:
   - ✅ `whatsapp_business_management` (required)
   - ✅ `whatsapp_business_messaging` (required)
   - ✅ `business_management` (if you need Business Manager access)
6. Select assets you need (only select what you'll actually use)
7. **Copy the Configuration ID**

### Update Your Environment Variables

Add the Configuration ID to your `.env.local`:

```bash
NEXT_PUBLIC_FACEBOOK_CONFIG_ID=your_configuration_id_here
```

---

## Step 3: Set Up account_update Webhook

The `account_update` webhook is triggered when a customer completes the Embedded Signup flow. It contains critical business data (WABA ID, phone number ID, business ID).

### 3.1: Set Webhook Verify Token

Create a secure random string for webhook verification:

```bash
# Generate a random token (run this in your terminal)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add it to your `.env.local`:

```bash
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_random_token_here
```

### 3.2: Configure Webhook in App Dashboard

1. In the App Dashboard, go to **Webhooks** in the left sidebar
2. Click **Add Subscription** or select **WhatsApp Business Account**
3. Enter your webhook endpoint URL:

   **For Production**:

   ```
   https://YOUR_PRODUCTION_DOMAIN.com/api/webhooks/whatsapp/account-update
   ```

   **For Local Testing** (use ngrok or similar):

   ```
   https://YOUR_NGROK_SUBDOMAIN.ngrok.io/api/webhooks/whatsapp/account-update
   ```

4. Enter the **Verify Token** (the same one you added to `.env.local`)
5. Click **Verify and Save**

> [!NOTE]
> Facebook will send a GET request to verify the webhook. Your endpoint at `/api/webhooks/whatsapp/account-update/route.ts` handles this automatically.

### 3.3: Subscribe to account_update Field

After the webhook is verified:

1. In the same Webhooks page, find **WhatsApp Business Account**
2. Click **Subscribe to this object**
3. Check the **account_update** field
4. Click **Save**

> [!IMPORTANT]
> The `account_update` webhook is REQUIRED for Embedded Signup v4. It sends critical business data when customers complete the signup flow.

---

## Step 4: Local Development Setup (Optional)

For testing webhooks locally, you need to expose your local server to the internet.

### Using ngrok

1. Install ngrok: https://ngrok.com/download
2. Start your Next.js dev server:
   ```bash
   npm run dev
   ```
3. In a new terminal, start ngrok:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Use this URL in the Facebook App Dashboard webhook configuration
6. Add it to allowed domains and redirect URIs

> [!WARNING]
> ngrok URLs change every time you restart (unless you have a paid plan). You'll need to update the App Dashboard each time.

---

## Step 5: Environment Variables Checklist

Make sure your `.env.local` has all required variables:

```bash
# Facebook App Configuration
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
NEXT_PUBLIC_FACEBOOK_CONFIG_ID=your_configuration_id

# Webhook Configuration
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_random_verify_token

# Optional: Redirect URI (uses dynamic origin if not set)
NEXT_PUBLIC_FACEBOOK_REDIRECT_URI=https://yourdomain.com/onboarding
```

---

## Step 6: Testing the Setup

### Test Webhook Verification

1. In the App Dashboard, add your webhook URL
2. Enter the verify token
3. Click **Verify and Save**
4. Check your application logs - you should see:
   ```
   🔔 [Webhook] Verification request received
   ✅ [Webhook] Verification successful
   ```

### Test Embedded Signup Flow

1. Navigate to your onboarding page (e.g., `/onboarding`)
2. Open browser DevTools Console (press F12)
3. Click "Connect WhatsApp Business"
4. Complete the flow in the Facebook popup
5. Check console for:
   ```
   📨 [Facebook SDK] WA_EMBEDDED_SIGNUP message event
   ✅ [Facebook SDK] Flow completed successfully
   ```
6. Check your application logs for webhook event:
   ```
   🔔 [Webhook] Received event
   📨 [Webhook] Processing account_update event
   ```

---

## Troubleshooting

### Webhook not receiving events

**Check:**

- Webhook URL is correct (HTTPS required for production)
- Verify token matches environment variable
- Subscribed to `account_update` field
- App Secret is correct in `.env.local`
- Check Application Logs for errors

### Message events not captured

**Check:**

- Browser Console for JavaScript errors
- Allowed domains include your current domain
- Origin check is passing (should end with `facebook.com`)
- SDK initialized properly

### OAuth redirect_uri mismatch

**Check:**

- Redirect URI in App Dashboard matches exactly (including protocol, domain, path)
- Using HTTPS in production
- No trailing slash differences

### SSL/HTTPS errors

**Solutions:**

- Use ngrok for local testing
- Ensure production domain has valid SSL certificate
- Check certificate is not expired

---

## Security Best Practices

1. **Never commit secrets to git**

   - Add `.env.local` to `.gitignore`
   - Use environment variables for all sensitive data

2. **Validate webhook signatures**

   - The webhook handler already validates signatures
   - Never process webhooks without signature verification

3. **Use HTTPS in production**

   - Required by Facebook
   - Protects user data in transit

4. **Rotate tokens regularly**
   - Refresh access tokens before expiration
   - Update verify tokens periodically

---

## Next Steps

After completing this setup:

1. Test the full Embedded Signup flow end-to-end
2. Implement database storage in the webhook handler (see TODO in `account-update/route.ts`)
3. Set up monitoring for webhook failures
4. Configure error alerting for critical flows
5. Test with Facebook's test users before going live

---

## Useful Links

- [Facebook App Dashboard](https://developers.facebook.com/apps)
- [WhatsApp Embedded Signup Documentation](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [Webhook Reference](https://developers.facebook.com/docs/graph-api/webhooks)
- [Meta for Developers Support](https://developers.facebook.com/support)

---

## Support

If you encounter issues:

1. Check the [Facebook Developer Community](https://developers.facebook.com/community)
2. Review error logs in App Dashboard → App Roles → Roles
3. Use the session_id and error_id from error events when contacting support
4. Check [WhatsApp Business API Status](https://status.fb.com/)
