# Facebook Login + WhatsApp Business API - Architecture & Security

## 🏗️ Architecture Overview

### High-Level Flow

```
┌─────────────┐
│   Customer  │
│  (Business) │
└──────┬──────┘
       │ 1. Login with Facebook
       ▼
┌──────────────────────────────────────────────────┐
│          Your SaaS Platform                      │
│  ┌────────────────────────────────────────┐     │
│  │  Frontend (Next.js)                    │     │
│  │  - Facebook SDK                        │     │
│  │  - Connection Flow UI                  │     │
│  │  - Dashboard                           │     │
│  └────────────┬───────────────────────────┘     │
│               │ 2. Send Access Token             │
│               ▼                                  │
│  ┌────────────────────────────────────────┐     │
│  │  Backend API Routes                    │     │
│  │  - Facebook OAuth Handler              │     │
│  │  - Token Validation & Exchange         │     │
│  │  - Graph API Client                    │     │
│  │  - Webhook Handler                     │     │
│  └────────────┬───────────────────────────┘     │
│               │ 3. Encrypt & Store               │
│               ▼                                  │
│  ┌────────────────────────────────────────┐     │
│  │  Database (Supabase)                   │     │
│  │  - User accounts                       │     │
│  │  - Facebook connections (encrypted)    │     │
│  │  - Business Managers                   │     │
│  │  - WhatsApp Accounts                   │     │
│  │  - Phone Numbers                       │     │
│  │  - Messages                            │     │
│  │  - Webhook logs                        │     │
│  └────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
       │                    ▲
       │ 4. Fetch BM/WABA   │ 6. Webhook Events
       │                    │
       ▼                    │
┌──────────────────────────────────────────────────┐
│           Meta (Facebook) Platform               │
│  ┌────────────────────────────────────────┐     │
│  │  Graph API                             │     │
│  │  - /me/businesses                      │     │
│  │  - /{business}/owned_whatsapp_business │     │
│  │  - /{waba}/phone_numbers               │     │
│  │  - /{phone}/messages (send)            │     │
│  └────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────┐     │
│  │  WhatsApp Cloud API                    │     │
│  │  - Message sending                     │     │
│  │  - Webhook callbacks                   │     │
│  └────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
       │
       │ 7. Send/Receive Messages
       ▼
┌─────────────┐
│  End Users  │
│ (WhatsApp)  │
└─────────────┘
```

---

## 🔄 Detailed Connection Flow

### Phase 1: Facebook Authentication

```
User → Click "Connect WhatsApp"
  ↓
Frontend → Facebook SDK → FB.login()
  ↓
Facebook → Permission Dialog
  ↓ (User grants permissions)
Facebook → Return accessToken + userID
  ↓
Frontend → POST /api/facebook/login
  ↓
Backend:
  1. Validate session cookie (Firebase)
  2. Get user from database
  3. Exchange short-lived token → long-lived token (60 days)
  4. Fetch user profile from Graph API
  5. Encrypt access token
  6. Store in connected_facebook_accounts table
  ↓
Frontend → Show Business Manager selection
```

### Phase 2: Business Manager Selection

```
Frontend → GET /api/facebook/business-managers
  ↓
Backend:
  1. Verify user session
  2. Get Facebook account from DB
  3. Decrypt access token
  4. Call Graph API: GET /me/businesses
  5. Store in connected_business_managers table
  6. Return list to frontend
  ↓
Frontend → User selects Business Manager
  ↓
Frontend → Show WABA selection
```

### Phase 3: WhatsApp Account Selection

```
Frontend → POST /api/facebook/whatsapp-accounts
  { businessId: "123456" }
  ↓
Backend:
  1. Verify user session
  2. Get Facebook account & decrypt token
  3. Call Graph API: GET /{businessId}/owned_whatsapp_business_accounts
  4. Store in connected_whatsapp_accounts table
  5. Return list to frontend
  ↓
Frontend → User selects WABA
  ↓
Frontend → Show phone number selection
```

### Phase 4: Phone Number Selection

```
Frontend → POST /api/facebook/phone-numbers
  { wabaId: "789" }
  ↓
Backend:
  1. Verify user session
  2. Get Facebook account & decrypt token
  3. Call Graph API: GET /{wabaId}/phone_numbers
  4. Generate webhook verify token
  5. Store in connected_phone_numbers table
  6. Return list to frontend
  ↓
Frontend → User selects phone number
  ↓
Frontend → POST /api/facebook/connect-phone
  { phoneNumberId: "456", wabaId: "789", isPrimary: true }
  ↓
Backend:
  1. Subscribe to webhook (Graph API)
  2. Mark phone as active & primary
  3. Complete onboarding
  ↓
Redirect to Dashboard
```

---

## 💬 Message Sending Flow

### Outbound Message

```
User → Dashboard → Send message form
  ↓
Frontend → POST /api/whatsapp/send-message
  { to: "919876543210", message: "Hello!" }
  ↓
Backend:
  1. Verify user session
  2. Get user's primary phone number
  3. Verify user owns the phone number
  4. Get Facebook account & decrypt token
  5. Call Graph API: POST /{phoneNumberId}/messages
     {
       messaging_product: "whatsapp",
       to: "919876543210",
       type: "text",
       text: { body: "Hello!" }
     }
  6. Store in whatsapp_messages table (status: sent)
  7. Return messageId to frontend
  ↓
Meta → Send message to WhatsApp user
  ↓
Meta → Webhook callback: message status update
  ↓
Backend webhook → Update message status (delivered/read)
```

### Inbound Message

```
WhatsApp User → Send message
  ↓
Meta → POST /api/webhooks/whatsapp
  {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: "919876543210",
            text: { body: "Hi there!" }
          }]
        }
      }]
    }]
  }
  ↓
Backend:
  1. Verify webhook signature
  2. Log in webhook_events_log
  3. Get phone number from DB by phone_number_id
  4. Store in whatsapp_messages table (direction: inbound)
  5. Return 200 OK to Meta
  ↓
(Your app can now process the message)
```

---

## 🔐 Security Architecture

### Token Security

#### Encryption Flow

```
Facebook Access Token (plaintext)
  ↓
encryptToken() function
  1. Generate random IV (16 bytes)
  2. Use AES-256-GCM cipher
  3. Encrypt with ENCRYPTION_KEY
  4. Generate auth tag
  ↓
Encrypted format: "iv:authTag:encrypted"
  ↓
Store in database
  ↓
When needed:
  Retrieve from database
    ↓
  decryptToken() function
    1. Parse iv:authTag:encrypted
    2. Create decipher with IV
    3. Set auth tag
    4. Decrypt
    ↓
  Use plaintext token (server-side only)
  ↓
  Never send to frontend
```

#### Token Lifecycle

```
Short-lived Token (1 hour)
  ↓
Exchange with Meta
  ↓
Long-lived Token (60 days)
  ↓
Encrypt & Store
  ↓
Monitor expiration
  ↓
If expiring soon (< 7 days):
  - Notify user
  - Attempt refresh (if refresh token available)
  ↓
If expired:
  - Mark status as 'expired'
  - Require re-authentication
```

### Webhook Security

```
Meta sends webhook
  ↓
Include header: x-hub-signature-256
  ↓
Backend receives:
  1. Get raw request body
  2. Get signature from header
  3. Calculate HMAC-SHA256(body, APP_SECRET)
  4. Compare with received signature (timing-safe)
  5. If invalid → Reject (401)
  6. If valid → Process webhook
```

### OAuth State Protection

```
Frontend initiates login
  ↓
Generate random state token
  crypto.randomBytes(32).toString('base64url')
  ↓
Store in session/cookie
  ↓
Send to Facebook with login request
  ↓
Facebook redirects back with state
  ↓
Backend validates:
  1. Compare received state with stored state
  2. Use timing-safe comparison
  3. If mismatch → Reject (CSRF attack)
  4. If match → Continue
```

---

## 🛡️ Security Checklist

### ✅ Authentication & Authorization

- [x] User session validated on every API call (Firebase session cookie)
- [x] User ownership verified for all resources (phone numbers, messages)
- [x] Access tokens encrypted at rest (AES-256-GCM)
- [x] Tokens never sent to frontend
- [x] Short-lived tokens exchanged for long-lived tokens
- [x] Token expiration monitored and handled

### ✅ API Security

- [x] All API routes require authentication
- [x] Input validation on all endpoints
- [x] Phone numbers sanitized (E.164 format)
- [x] Rate limiting implemented (in-memory, consider Redis for production)
- [x] Error messages don't leak sensitive info
- [x] CORS configured properly

### ✅ Webhook Security

- [x] Signature verification for all webhooks
- [x] Timing-safe signature comparison
- [x] Webhook events logged for audit
- [x] Replay attack prevention (check timestamps)
- [x] Failed webhook processing logged

### ✅ Data Security

- [x] Encryption key stored in environment variables
- [x] Database credentials not in code
- [x] Supabase RLS (Row Level Security) recommended
- [x] Soft deletes implemented (no hard deletes)
- [x] Sensitive data masked in logs

### ✅ GDPR Compliance

- [x] Privacy policy published
- [x] Terms of service published
- [x] Data deletion instructions published
- [x] Users can revoke Facebook connection
- [x] Webhook events logged (audit trail)
- [x] Data minimization (only store necessary data)

### ✅ Meta Platform Policies

- [x] Least-privilege permissions requested
- [x] Customer owns their WABA (not shared)
- [x] User explicitly grants permissions
- [x] Permission descriptions shown to user
- [x] Complies with WhatsApp Business Policy

---

## 🚨 Common Security Pitfalls (Avoided)

### ❌ NEVER DO THIS

```typescript
// ❌ DON'T: Send encrypted token to frontend
return NextResponse.json({
  token: facebookAccount.access_token // WRONG!
});

// ✅ DO: Mask or exclude
return NextResponse.json({
  token: '[ENCRYPTED]' // CORRECT
});
```

```typescript
// ❌ DON'T: Log tokens
console.log('Token:', accessToken); // WRONG!

// ✅ DO: Mask in logs
console.log('Token:', maskSensitiveData(accessToken, 4)); // CORRECT
```

```typescript
// ❌ DON'T: Skip webhook verification
// Process webhook without checking signature // WRONG!

// ✅ DO: Always verify
if (!verifyMetaWebhookSignature(body, signature, appSecret)) {
  return NextResponse.json({ error: 'Invalid' }, { status: 401 });
}
```

```typescript
// ❌ DON'T: Use customer's token for your operations
// const token = customerToken; // WRONG!

// ✅ DO: Each customer has their own token
const token = decryptToken(customerAccount.access_token); // CORRECT
```

---

## 📊 Database Security

### Row Level Security (Recommended for Supabase)

```sql
-- Enable RLS on all tables
ALTER TABLE connected_facebook_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_business_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connected_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own data
CREATE POLICY "Users can view own Facebook account"
  ON connected_facebook_accounts
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own messages"
  ON whatsapp_messages
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role bypasses RLS (for your API)
-- Use service role key for backend operations
```

### Backup & Recovery

```bash
# Regular database backups (Supabase does this automatically)
# Additional backup strategy:

# 1. Export schema
pg_dump -s -h db.xxx.supabase.co -U postgres > schema_backup.sql

# 2. Export data
pg_dump -a -h db.xxx.supabase.co -U postgres > data_backup.sql

# 3. Store backups securely (encrypted)
```

---

## 🔍 Monitoring & Logging

### What to Log

```typescript
// ✅ DO LOG:
- User actions (login, connect, disconnect)
- API requests (endpoint, user, timestamp)
- Webhook events (all received webhooks)
- Error events (with stack traces)
- Token expiration events
- Rate limit violations

// ❌ DON'T LOG:
- Access tokens (plain or encrypted)
- User passwords
- Encryption keys
- API secrets
- Personal data (beyond necessary)
```

### Monitoring Queries

```sql
-- Check token expiration
SELECT 
  u.email,
  fa.expires_at,
  EXTRACT(DAY FROM (fa.expires_at - NOW())) as days_until_expiry
FROM connected_facebook_accounts fa
JOIN users u ON fa.user_id = u.id
WHERE fa.status = 'active'
  AND fa.expires_at < NOW() + INTERVAL '7 days';

-- Check webhook processing
SELECT 
  DATE(received_at) as date,
  COUNT(*) as total,
  SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as processed,
  SUM(CASE WHEN processed = false THEN 1 ELSE 0 END) as pending
FROM webhook_events_log
WHERE received_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(received_at);

-- Check message delivery rates
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_sent,
  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(100.0 * SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) / COUNT(*), 2) as delivery_rate
FROM whatsapp_messages
WHERE direction = 'outbound'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at);
```

---

## 🎯 Production Deployment Checklist

### Pre-Launch

- [ ] All environment variables set in production
- [ ] Encryption key generated (64 hex chars)
- [ ] Database schema deployed
- [ ] Database backups configured
- [ ] SSL/TLS certificate active (HTTPS)
- [ ] Meta app in live mode (not development)
- [ ] Advanced permissions approved by Meta
- [ ] Webhook URL verified by Meta
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Data deletion instructions published

### Monitoring

- [ ] Error tracking configured (Sentry, etc.)
- [ ] Log aggregation set up
- [ ] Database monitoring active
- [ ] API rate limiting enabled
- [ ] Alerting configured (Slack, email)
- [ ] Uptime monitoring (Pingdom, etc.)

### Security

- [ ] Penetration testing completed
- [ ] Security headers configured
- [ ] CORS properly configured
- [ ] Rate limiting tested
- [ ] Webhook signature verification tested
- [ ] Token encryption tested
- [ ] Access control tested

---

*Last Updated: December 2024*

