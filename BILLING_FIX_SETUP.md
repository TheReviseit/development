# Billing ECONNREFUSED Fix - Production-Grade Setup Guide

## Problem Summary

**Error:** `Failed to proxy http://127.0.0.1:5000/api/billing/checkout-session Error: connect ECONNREFUSED 127.0.0.1:5000`

**Root Cause:** The Flask backend server on port 5000 is not running. The Next.js rewrite proxy fails when trying to forward API requests.

## Solution Implemented

### 1. Production-Grade API Proxy Client (`frontend/lib/api/proxy-client.ts`)
- **Circuit Breaker Pattern:** Prevents cascading failures when backend is down
- **Health Monitoring:** Continuous health checks with exponential backoff
- **Graceful Degradation:** Returns meaningful 503 errors instead of 500
- **Retry Logic:** Automatic retries with exponential backoff
- **Request Timeouts:** Prevents hanging requests

### 2. Next.js API Route Handler (`frontend/app/api/billing/checkout-session/route.ts`)
- **Input Validation:** Strict validation of planSlug and idempotencyKey
- **Authentication:** JWT and session cookie validation
- **Rate Limiting:** 10 requests per minute per user
- **Backend Health Check:** Pre-proxy health verification
- **Structured Error Responses:** Actionable error messages for users

### 3. Backend Health API (`backend/routes/health_api.py`)
- **Liveness Probe:** `/api/health` - Basic uptime check
- **Readiness Probe:** `/api/health/ready` - Dependency checks
- **Deep Health:** `/api/health/deep` - Comprehensive diagnostics
- **Dependency Checks:** Database, Firebase, Razorpay, Redis

### 4. Updated Middleware Error Handling
- **Connection Error Detection:** Detects ECONNREFUSED and other connection errors
- **Specific Error Codes:** Returns `BACKEND_UNAVAILABLE` for connection failures
- **Timeout Handling:** 5-second timeout for token validation

## Quick Start

### Step 1: Start the Backend Server

```bash
cd backend
python app.py
```

The backend will start on `http://localhost:5000`.

### Step 2: Start the Frontend Server

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:3001`.

### Step 3: Verify Health Check

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00+00:00",
  "uptime_seconds": 123
}
```

## Environment Variables

### Frontend (`frontend/.env.local`)

```bash
# Backend API URL (REQUIRED)
NEXT_PUBLIC_API_URL=http://localhost:5000

# Alternative backend URL for server-side (optional)
BACKEND_URL=http://localhost:5000

# Firebase Config (REQUIRED)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Backend (`backend/.env`)

```bash
# Flask Environment
FLASK_ENV=development
PORT=5000

# Database
DATABASE_URL=postgresql://user:password@localhost/flowauxi

# Firebase Admin
FIREBASE_ADMIN_SDK_PATH=path/to/service-account.json

# Razorpay (REQUIRED for billing)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=your_secret_key

# Redis (optional)
REDIS_URL=redis://localhost:6379/0
```

## Architecture Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User Browser  │────▶│  Next.js (3001)  │────▶│  Flask (5000)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  /api/billing/*       │
                    │  (Next.js API Route)  │
                    │  - Circuit Breaker    │
                    │  - Health Checks    │
                    │  - Rate Limiting    │
                    └─────────────────────┘
                               │
                    (fallback rewrites)
                               │
                    ┌──────────▼──────────┐
                    │  /api/* (other)     │
                    │  (Flask Backend)    │
                    └─────────────────────┘
```

## Error Handling

### When Backend is Down

**Before Fix:** 500 Internal Server Error with cryptic message

**After Fix:** 503 Service Unavailable with actionable message:
```json
{
  "success": false,
  "error": {
    "code": "BACKEND_UNAVAILABLE",
    "message": "Payment service is temporarily unavailable. Our team has been notified.",
    "details": {
      "suggestion": "Please ensure the backend server is running on port 5000 (python app.py)"
    }
  }
}
```

### Circuit Breaker States

- **CLOSED:** Normal operation, requests pass through
- **OPEN:** Backend failing, requests fail fast with 503
- **HALF_OPEN:** Testing if backend recovered

## Monitoring

### Health Check Endpoints

| Endpoint | Purpose | Response Time |
|----------|---------|---------------|
| `GET /api/health` | Liveness probe | <10ms |
| `GET /api/health/ready` | Readiness probe | <100ms |
| `GET /api/health/deep` | Full diagnostics | <500ms |

### Logs to Watch

```bash
# Backend starting
curl http://localhost:5000/api/health

# Circuit breaker state changes
# [CircuitBreaker] Transitioning to HALF_OPEN
# [CircuitBreaker] OPENED after 5 failures
# [CircuitBreaker] Closed - backend recovered

# Request logging
# [Proxy] req_1234567890_abcd1234 - Attempt 1/3 to http://localhost:5000/api/billing/checkout-session
# [Checkout] req_1234567890_abcd1234 - Success
```

## Testing

### Test Backend Down Scenario

1. Stop the backend: `Ctrl+C` in the backend terminal
2. Try to create checkout session from frontend
3. Observe 503 error with meaningful message
4. Start backend again: `python app.py`
5. Wait for circuit breaker to close (~60 seconds)
6. Retry checkout - should succeed

### Test Rate Limiting

```bash
# Send 11 requests rapidly (limit is 10 per minute)
for i in {1..11}; do
  curl -X POST http://localhost:3001/api/billing/checkout-session \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{"planSlug":"starter","idempotencyKey":"test-'$i'"}'
done
```

## Production Deployment

### 1. Environment Variables

Set in your deployment platform:

```bash
# Vercel
vercel env add NEXT_PUBLIC_API_URL production

# Railway
railway variables set NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# AWS Elastic Beanstalk
eb setenv NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### 2. Health Check Configuration

**Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 3. Monitoring & Alerting

Set up alerts for:
- Circuit breaker OPEN state
- Health check failures
- Error rate > 1%
- Response time > 2s

## Troubleshooting

### Backend Connection Refused

**Symptom:** `ECONNREFUSED 127.0.0.1:5000`

**Fix:**
1. Check if backend is running: `curl http://localhost:5000/api/health`
2. Start backend: `cd backend && python app.py`
3. Verify port: Check if port 5000 is already in use

### Circuit Breaker Stuck Open

**Symptom:** All requests return 503 even though backend is healthy

**Fix:**
1. Check backend health: `curl http://localhost:5000/api/health`
2. Wait 60 seconds for circuit breaker to reset
3. Restart Next.js dev server if needed

### Authentication Errors

**Symptom:** 401 Unauthorized

**Fix:**
1. Check session cookie is set
2. Verify Firebase configuration
3. Check `session` or `flowauxi_session` cookie exists

## Support

For issues not covered here:
1. Check logs in both frontend and backend terminals
2. Verify environment variables are set correctly
3. Ensure all dependencies are installed (`pip install -r requirements.txt`, `npm install`)
4. Check the Network tab in browser DevTools for request details
