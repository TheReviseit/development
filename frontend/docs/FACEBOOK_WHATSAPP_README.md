# Facebook Login + WhatsApp Business API Integration

## 📖 Complete Implementation for Multi-Tenant SaaS

This implementation allows **each customer** to connect **their own WhatsApp Business Account** via Facebook Login, enabling your SaaS platform to send/receive WhatsApp messages on their behalf.

---

## ✨ Features

### ✅ What's Implemented

- **Facebook OAuth Integration**: Secure Facebook Login with JavaScript SDK
- **Multi-Tenant Architecture**: Each customer connects their own WABA
- **Complete Connection Flow**: BM → WABA → Phone Number selection
- **Token Management**: Long-lived tokens (60 days) with encryption
- **WhatsApp Messaging**: Send/receive messages via customer's number
- **Webhook Handlers**: Real-time message delivery & status updates
- **Security**: AES-256-GCM encryption, signature verification, CSRF protection
- **Database Schema**: Complete PostgreSQL/Supabase schema with RLS
- **UI Components**: Pre-built React components for connection flow
- **Type Safety**: Full TypeScript support
- **Audit Logging**: Webhook events, message history
- **Compliance**: GDPR-ready, Meta policy compliant

---

## 📁 Project Structure

```
frontend/
├── app/
│   ├── api/
│   │   ├── facebook/
│   │   │   ├── login/route.ts              # OAuth handler
│   │   │   ├── business-managers/route.ts   # Fetch BMs
│   │   │   ├── whatsapp-accounts/route.ts   # Fetch WABAs
│   │   │   ├── phone-numbers/route.ts       # Fetch phone numbers
│   │   │   └── connect-phone/route.ts       # Finalize connection
│   │   ├── whatsapp/
│   │   │   └── send-message/route.ts        # Send messages
│   │   └── webhooks/
│   │       └── whatsapp/route.ts            # Webhook handler
│   └── components/
│       └── facebook/
│           ├── FacebookLoginButton.tsx      # Login button
│           └── WhatsAppConnectionFlow.tsx   # Complete flow UI
├── lib/
│   ├── facebook/
│   │   ├── facebook-sdk.ts                  # SDK integration
│   │   └── graph-api-client.ts              # Graph API wrapper
│   ├── supabase/
│   │   └── facebook-whatsapp-queries.ts     # Database queries
│   ├── security/
│   │   └── security-utils.ts                # Security helpers
│   └── encryption/
│       └── crypto.ts                        # Token encryption
├── types/
│   └── facebook-whatsapp.types.ts           # TypeScript types
└── docs/
    ├── facebook_whatsapp_schema.sql         # Database schema
    ├── FACEBOOK_WHATSAPP_SETUP.md           # Setup guide
    └── ARCHITECTURE_SECURITY.md             # Architecture docs
```

---

## 🚀 Quick Start

### 1. Install Dependencies

Already included in your existing `package.json`. No new dependencies needed!

### 2. Set Up Meta App

Follow the detailed guide: [`docs/FACEBOOK_WHATSAPP_SETUP.md`](./docs/FACEBOOK_WHATSAPP_SETUP.md)

Quick steps:
1. Create Meta app at https://developers.facebook.com
2. Add Facebook Login product
3. Add WhatsApp product
4. Get App ID and App Secret

### 3. Configure Environment Variables

```bash
# Add to .env.local
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_random_token
ENCRYPTION_KEY=your_64_char_hex_key
```

Generate keys:
```bash
# Encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Webhook verify token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy Database Schema

1. Open Supabase SQL Editor
2. Run `docs/facebook_whatsapp_schema.sql`

### 5. Set Up Webhook

1. In Meta app dashboard: WhatsApp → Configuration
2. Callback URL: `https://yourdomain.com/api/webhooks/whatsapp`
3. Verify Token: (from `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
4. Subscribe to: `messages`, `message_status`

### 6. Use in Your App

```tsx
// In your onboarding page
import WhatsAppConnectionFlow from '@/app/components/facebook/WhatsAppConnectionFlow';

export default function OnboardingPage() {
  return (
    <div>
      <h1>Connect Your WhatsApp Business</h1>
      <WhatsAppConnectionFlow />
    </div>
  );
}
```

---

## 🎯 Usage Examples

### Send a Message

```typescript
// From your frontend
const response = await fetch('/api/whatsapp/send-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '919876543210', // E.164 format, no +
    message: 'Hello from our platform!'
  })
});

const result = await response.json();
if (result.success) {
  console.log('Message sent:', result.data.messageId);
}
```

### Check Connection Status

```typescript
const response = await fetch('/api/facebook/login');
const data = await response.json();

if (data.connected) {
  console.log('Connected:', data.account.facebook_user_name);
} else {
  // Show connection flow
}
```

### Get Message History

```sql
SELECT * FROM whatsapp_messages 
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC 
LIMIT 50;
```

---

## 🔒 Security Features

### Token Security
- ✅ AES-256-GCM encryption
- ✅ Long-lived tokens (60 days)
- ✅ Automatic expiration monitoring
- ✅ Never sent to frontend

### API Security
- ✅ Firebase session authentication
- ✅ User ownership verification
- ✅ Rate limiting
- ✅ Input validation

### Webhook Security
- ✅ HMAC-SHA256 signature verification
- ✅ Timing-safe comparison
- ✅ Audit logging

### Data Security
- ✅ Encrypted at rest
- ✅ Soft deletes
- ✅ GDPR compliant
- ✅ Row Level Security (RLS) ready

---

## 📊 Database Schema

### Main Tables

1. **connected_facebook_accounts**: Facebook OAuth connections
2. **connected_business_managers**: Business Manager access
3. **connected_whatsapp_accounts**: WhatsApp Business Accounts
4. **connected_phone_numbers**: Phone numbers for messaging
5. **whatsapp_messages**: Message history (sent/received)
6. **webhook_events_log**: Webhook audit trail

### Relationships

```
users (existing)
  ↓
connected_facebook_accounts
  ↓
connected_business_managers
  ↓
connected_whatsapp_accounts
  ↓
connected_phone_numbers
  ↓
whatsapp_messages
```

---

## 🔄 Connection Flow

```
1. User clicks "Connect WhatsApp Business"
   ↓
2. Facebook Login popup → grants permissions
   ↓
3. Backend validates & stores encrypted token
   ↓
4. User selects Business Manager
   ↓
5. User selects WhatsApp Business Account
   ↓
6. User selects phone number
   ↓
7. Webhook subscribed
   ↓
8. Connection complete! ✅
```

---

## 📋 Required Permissions

| Permission | Purpose | Review Needed |
|------------|---------|---------------|
| `public_profile` | Basic user info | ❌ |
| `email` | User email | ❌ |
| `business_management` | Access Business Manager | ✅ |
| `whatsapp_business_management` | Manage WABA | ✅ |
| `whatsapp_business_messaging` | Send/receive messages | ✅ |

**Note**: Permissions marked with ✅ require Meta App Review (3-7 days)

---

## 🐛 Troubleshooting

### Common Issues

#### "Facebook SDK not loaded"
- Check `NEXT_PUBLIC_FACEBOOK_APP_ID` is set
- Verify domain whitelisted in Meta app settings

#### "Token expired"
- User needs to reconnect
- Check expiration: `SELECT expires_at FROM connected_facebook_accounts`

#### Webhook not receiving
- Verify webhook URL is HTTPS and publicly accessible
- Check verify token matches
- Ensure webhook subscriptions are active

#### "Permission denied"
- Request advanced access in Meta App Review
- While pending, only works for test users

See full troubleshooting guide: [`docs/FACEBOOK_WHATSAPP_SETUP.md`](./docs/FACEBOOK_WHATSAPP_SETUP.md#-part-8-troubleshooting)

---

## 🎓 Documentation

### Complete Guides

1. **[Setup Guide](./docs/FACEBOOK_WHATSAPP_SETUP.md)**: Step-by-step setup instructions
2. **[Architecture & Security](./docs/ARCHITECTURE_SECURITY.md)**: Technical deep-dive
3. **Database Schema**: `docs/facebook_whatsapp_schema.sql`

### Key Concepts

- **Multi-Tenant**: Each customer uses their own WABA
- **OAuth Flow**: Facebook Login → Token Exchange → Long-lived Token
- **Graph API**: Fetch BM, WABA, phone numbers
- **Webhooks**: Real-time message updates
- **Encryption**: AES-256-GCM for token storage

---

## 🔐 Meta App Review Tips

### What Meta Looks For

✅ **DO:**
- Clear explanation of your SaaS model
- Video showing connection flow
- Complete privacy policy
- Terms of service
- Data deletion instructions
- Show customers connect their own WABAs

❌ **DON'T:**
- Use your WABA for all customers
- Request unnecessary permissions
- Skip documentation
- Share credentials

### Timeline
- Standard permissions: Instant
- Advanced permissions: 3-7 business days

---

## 📈 Scaling Considerations

### Production Best Practices

1. **Rate Limiting**: Implement Redis-based rate limiting
2. **Token Refresh**: Background job to refresh expiring tokens
3. **Monitoring**: Set up alerts for:
   - Token expirations
   - Webhook failures
   - API errors
   - Message delivery rates

4. **Database**: 
   - Enable Supabase RLS
   - Regular backups
   - Index optimization

5. **Error Handling**:
   - Centralized error logging (Sentry)
   - Retry logic for failed messages
   - Dead letter queue for webhooks

---

## 🆘 Support Resources

- [Meta for Developers](https://developers.facebook.com)
- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Graph API Reference](https://developers.facebook.com/docs/graph-api)
- [Business Manager](https://business.facebook.com)

---

## 📝 License

Part of the ReviseIt SaaS Platform

---

## 🙏 Credits

Built with:
- Next.js 16
- TypeScript
- Supabase
- Meta Graph API
- WhatsApp Cloud API

---

## ✅ Production Checklist

Before going live:

- [ ] Meta app approved for advanced permissions
- [ ] Environment variables set in production
- [ ] Database schema deployed
- [ ] Webhooks verified
- [ ] SSL certificate active
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Data deletion instructions published
- [ ] Error logging configured
- [ ] Monitoring set up
- [ ] Rate limiting enabled
- [ ] Backup strategy in place

---

**Status**: ✅ Production Ready

**Last Updated**: December 2024

**Next Steps**: Follow the [Setup Guide](./docs/FACEBOOK_WHATSAPP_SETUP.md) to configure your Meta app and deploy!

