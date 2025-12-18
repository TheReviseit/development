# Your WhatsApp Configuration for reviseit.in

## Environment Variables

Add these to your `.env.local` file:

```bash
# Webhook Verification Token (already generated)
FACEBOOK_WEBHOOK_VERIFY_TOKEN=c0f025bab2a6b90648f48c1c6ff920640053302311f268d7ab6e4d2d9af40d2c

# Site URL
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in

# Optional: Redirect URI (if not set, uses dynamic origin)
NEXT_PUBLIC_FACEBOOK_REDIRECT_URI=https://www.reviseit.in/onboarding
```

---

## Facebook App Dashboard Configuration

### 1. OAuth Settings

**Go to: App Dashboard → Facebook Login for Business → Settings**

**Enable these 6 toggles to YES:**

- ✅ Client OAuth login
- ✅ Web OAuth login
- ✅ Enforce HTTPS
- ✅ Embedded Browser OAuth Login
- ✅ Use Strict Mode for Redirect URIs
- ✅ Login with the JavaScript SDK

**Add to "Allowed Domains for the JavaScript SDK":**

```
localhost
www.reviseit.in
reviseit.in
```

**Add to "Valid OAuth Redirect URIs":**

```
http://localhost:3000/onboarding
https://www.reviseit.in/onboarding
https://reviseit.in/onboarding
```

Click **Save Changes**

---

### 2. Webhook Configuration

**Go to: App Dashboard → Webhooks**

#### For WhatsApp Business Account webhooks:

1. Click **Add Subscription** or select **WhatsApp Business Account**
2. **Callback URL**:
   ```
   https://www.reviseit.in/api/webhooks/whatsapp/account-update
   ```
3. **Verify Token**:
   ```
   c0f025bab2a6b90648f48c1c6ff920640053302311f268d7ab6e4d2d9af40d2c
   ```
4. Click **Verify and Save**
5. Subscribe to the **account_update** field
6. Click **Save**

---

## Testing Your Setup

### Test 1: Verify Webhook Endpoint

Your webhook endpoint should be accessible at:

```
https://www.reviseit.in/api/webhooks/whatsapp/account-update
```

Facebook will send a GET request like:

```
GET https://www.reviseit.in/api/webhooks/whatsapp/account-update?hub.mode=subscribe&hub.verify_token=c0f025bab2a6b90648f48c1c6ff920640053302311f268d7ab6e4d2d9af40d2c&hub.challenge=CHALLENGE_STRING
```

Your endpoint should respond with the challenge string.

### Test 2: Complete Embedded Signup Flow

1. Go to: https://www.reviseit.in/onboarding
2. Click "Connect WhatsApp Business"
3. Complete the flow
4. Check browser console for:
   ```
   📨 [Facebook SDK] WA_EMBEDDED_SIGNUP message event
   ✅ [Facebook SDK] Flow completed successfully
   🚀 [EmbeddedSignup] Calling onboarding API...
   🎉 [EmbeddedSignup] Customer onboarded successfully!
   ```

### Test 3: Verify Webhook Reception

After completing Embedded Signup, check your server logs for:

```
🔔 [Webhook] Received event
📨 [Webhook] Processing account_update event
✅ [Webhook] Customer business data: {...}
```

---

## Quick Checklist

- [ ] Add environment variables to `.env.local`
- [ ] Deploy to production (https://www.reviseit.in)
- [ ] Configure OAuth settings in Facebook App Dashboard
- [ ] Add webhook URL and verify token in Facebook App Dashboard
- [ ] Subscribe to `account_update` webhook field
- [ ] Test the complete flow on production

---

## Your URLs Summary

| Purpose                     | URL                                                          |
| --------------------------- | ------------------------------------------------------------ |
| **Production Site**         | https://www.reviseit.in                                      |
| **Onboarding Page**         | https://www.reviseit.in/onboarding                           |
| **Webhook Endpoint**        | https://www.reviseit.in/api/webhooks/whatsapp/account-update |
| **Customer Onboarding API** | https://www.reviseit.in/api/facebook/onboard-customer        |

---

## Troubleshooting

### Webhook verification fails

**Check:**

- Webhook URL is correct: `https://www.reviseit.in/api/webhooks/whatsapp/account-update`
- Verify token matches exactly: `c0f025bab2a6b90648f48c1c6ff920640053302311f268d7ab6e4d2d9af40d2c`
- Your production server is running
- SSL certificate is valid

### OAuth redirect_uri mismatch

**Check:**

- Added `https://www.reviseit.in/onboarding` to Valid OAuth Redirect URIs
- Added `www.reviseit.in` to Allowed Domains
- No trailing slashes in configuration

### Message events not captured

**Check:**

- Added `www.reviseit.in` to Allowed Domains
- SDK initialized properly (check browser console)
- No JavaScript errors blocking execution

---

## Next Steps After Configuration

1. **Deploy to Production**: Make sure your code is deployed to https://www.reviseit.in
2. **Test End-to-End**: Complete a full Embedded Signup flow
3. **Monitor Logs**: Watch for webhook events and onboarding success
4. **Customer Instructions**: Provide payment method setup link to customers

---

## Support

If you encounter issues:

- Check browser console for frontend errors
- Check server logs for backend errors
- Verify all URLs use HTTPS (not HTTP)
- Ensure Facebook App is in Live mode (not Development)
