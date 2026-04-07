# Billing Security Architecture

## Overview

This document describes the FAANG-grade security architecture for the Flowauxi billing and payment system.

**Version:** 1.0.0  
**Security Level:** FAANG Production  
**Last Updated:** 2024

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Firebase Auth (Client SDK)                                               │
│  • Token refresh via getIdToken(true)                                       │
│  • Billing API Client with circuit breaker                                  │
│  • NEVER trusts pricing from client config                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS MIDDLEWARE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Strict CSP Headers (script-src, frame-ancestors, base-uri)              │
│  • Rate Limiting (IP: 100/min, User: 20/min)                               │
│  • Tenant Resolution from Host header                                       │
│  • Token structure validation                                               │
│  • Redirects unauthenticated to /login                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SERVER COMPONENT (/payment)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Server-side auth validation                                              │
│  • Fetches pricing from backend (server-to-server)                         │
│  • Subscription state validation                                            │
│  • NO PAYMENT UI if unauthenticated                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND API LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Billing Security Middleware                                          │   │
│  │ • Firebase verify_id_token(check_revoked=True) - STRICT             │   │
│  │ • Multi-tier rate limiting (IP, User, Tenant)                       │   │
│  │ • Confidence-based abuse detection (0-100 score)                    │   │
│  │   - IP reputation (0-30 points)                                     │   │
│  │   - Behavioral velocity (0-30 points)                               │   │
│  │   - Device fingerprint (0-20 points)                                │   │
│  │   - Cross-domain access (0-20 points)                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Billing API Routes                                                   │   │
│  │ • GET /pricing - Domain-specific pricing                             │   │
│  │ • GET /subscription-state - User subscription status                  │   │
│  │ • POST /checkout-session - Secure checkout creation                   │   │
│  │   - Plan slug validation (NOT price_id)                              │   │
│  │   - Server-side Razorpay plan ID resolution                          │   │
│  │   - Idempotency with user binding (prevent hijacking)                │   │
│  │   - Circuit breaker for Razorpay integration                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RAZORPAY LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Checkout session creation                                                │
│  • Webhook handling with HMAC signature verification                        │
│  • Idempotency keys to prevent duplicate charges                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Controls

### 1. Authentication (AC #1)

**No Grace Periods - Strict Validation:**
- Firebase tokens validated with `check_revoked=True`
- Expired tokens return 401 immediately
- Client must call `user.getIdToken(true)` to refresh
- `/api/auth/session` accepts only valid tokens, issues HTTP-only cookies

**Token Validation Cache (30 seconds):**
- Middleware caches successful token validations for 30 seconds
- Trade-off: Reduces backend load by ~90%, but revoked tokens remain valid for 30s
- Acceptable for payment pages because:
  - Token revocation is rare
  - Actual checkout creation validates fresh with Firebase Admin
  - Immediate revocation available by setting cache TTL to 0
- **Security Note:** For high-risk operations, bypass cache by calling backend directly

**Protection Against:**
- Token replay attacks
- Session hijacking via expired tokens
- Authentication bypass

### 2. Tenant Isolation

**Domain Resolution:**
- Resolved from `Host` header ONLY (never client)
- Hardcoded mapping in both frontend and backend
- Cross-domain plan access blocked with 403

**Database Enforcement:**
```sql
UNIQUE(product_domain, plan_slug, billing_cycle)
```

**Protection Against:**
- Cross-tenant data leakage
- Wrong pricing display
- Subscription to wrong domain plans

### 3. Rate Limiting

| Type | Limit | Window |
|------|-------|--------|
| IP | 100 | 60 seconds |
| User | 20 | 60 seconds |
| Tenant | 500 | 60 seconds |
| Checkout | 5 | 60 seconds (strict) |

**Response Headers:**
```
Retry-After: 30
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705312800
```

### 4. Abuse Detection (AC #2)

**Confidence Scoring (0-100):**

| Signal | Weight | Detection |
|--------|--------|-----------|
| IP reputation | 0-30 | Request rate, blocklist checks |
| Behavioral velocity | 0-30 | Plan enumeration, request spikes |
| Device fingerprint | 0-20 | Multiple devices per user |
| Cross-domain access | 0-20 | Accessing multiple domains |

**Actions:**
- Score 0-30: ALLOW
- Score 31-60: CHALLENGE (CAPTCHA) - Returns 200 with challenge payload
- Score 61-80: RATE_LIMIT (aggressive)
- Score 81-100: BLOCK + Alert

**No Binary Blocks:** Corporate NATs with 20+ users trigger CAPTCHA, not 403.

### 5. Idempotency (AC #4)

**Key Generation:**
```python
SHA256(user_id + plan_slug + domain + month)
```

**Security Features:**
- Keys bound to user_id (prevent session hijacking)
- 24-hour TTL
- User ownership verification on lookup

**Negative Test:** Different user with same key → Blocked

### 6. Circuit Breaker (AC #3)

**Configuration:**
- Failure threshold: 5 errors
- Recovery timeout: 30 seconds
- Half-open max calls: 3

**States:**
- CLOSED: Normal operation
- OPEN: Failing fast with 503
- HALF_OPEN: Testing recovery

**User Experience:**
```json
{
  "success": false,
  "error": "SERVICE_UNAVAILABLE",
  "message": "Payment service temporarily unavailable. Please try again in a moment."
}
```

### 7. CSP Headers (AC #5)

**Payment Page CSP:**
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
frame-src 'self' https://checkout.razorpay.com;
connect-src 'self' https://api.flowauxi.com https://lumberjack.razorpay.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

---

## API Endpoints

### GET /api/billing/pricing

**Auth:** Required  
**Rate Limit:** 10/min per user

**Response:**
```json
{
  "success": true,
  "domain": "shop",
  "displayName": "Shop",
  "plans": [
    {
      "id": "plan_uuid",
      "name": "Starter",
      "slug": "starter",
      "price": 199900,
      "priceDisplay": "₹1,999",
      "currency": "INR",
      "description": "Perfect for getting started",
      "features": ["Feature 1", "Feature 2"],
      "popular": false
    }
  ]
}
```

**Security:**
- Domain resolved from Host header
- Only returns plans for current domain
- User cannot access pricing for other domains

---

### GET /api/billing/subscription-state

**Auth:** Required  
**Rate Limit:** 20/min per user

**Response:**
```json
{
  "success": true,
  "hasSubscription": false,
  "hasActiveTrial": false,
  "trialExpired": true,
  "canSubscribe": true,
  "reason": "expired_trial_can_subscribe"
}
```

---

### POST /api/billing/checkout-session

**Auth:** Required  
**Rate Limit:** 5/min per user (strict)

**Request:**
```json
{
  "planSlug": "starter",
  "idempotencyKey": "uuid-v4-client-generated"
}
```

**Response:**
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.razorpay.com/v1/checkout/...",
  "sessionId": "sub_xxx",
  "plan": {
    "name": "Starter",
    "amount": 199900,
    "currency": "INR"
  }
}
```

**Security:**
- Plan slug validated against domain whitelist
- Razorpay plan ID resolved server-side
- Idempotency prevents duplicate subscriptions
- Circuit breaker protects against Razorpay outages

---

## Testing

### Run Security Tests

```bash
cd backend
pytest tests/test_billing_security.py -v
```

### Test Coverage

- Authentication bypass prevention
- Tenant isolation enforcement
- Rate limiting effectiveness
- Idempotency security (positive + negative tests)
- Abuse detection accuracy
- Circuit breaker functionality
- CSP header validation

---

## Audit Logging

All billing events are logged with structured format including user_id, tenant_id, action, and outcome.

---

## Acceptance Criteria Verification

| AC | Status | Verification |
|----|--------|--------------|
| #1 | ✅ | Token refresh via /api/auth/session, no grace periods |
| #2 | ✅ | Confidence-based abuse detection, 200+challenge payload |
| #3 | ✅ | Circuit breaker with 503 fallback on Razorpay outage |
| #4 | ✅ | Idempotency keys bound to user_id, negative tests |
| #5 | ✅ | Strict CSP headers on /payment routes |
