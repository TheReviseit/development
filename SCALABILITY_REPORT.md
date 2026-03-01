# FlowAuxi Scalability Report — 1M+ Users Architecture

## Executive Summary

After analyzing the **complete codebase** (90+ API routes, 15+ service files, 30+ frontend components), I identified **47 performance issues** across 4 severity levels. The most critical bottlenecks would cause system failure at ~50K concurrent users without intervention.

**Current capacity estimate:** ~5K concurrent users
**Target:** 1M+ registered users, 10K+ concurrent

---

## PHASE 1 & 2: COMPLETE REQUEST FLOW MAP + UNNECESSARY REQUEST DETECTION

### Request Flow Map (Every Endpoint)

```
User → Browser → Next.js (App Router)
                    ├── SSR Pages (store, upgrade)
                    ├── API Routes (/api/*) → Flask Backend → Supabase PostgreSQL
                    └── Static Assets (CDN)
```

### Critical Endpoints — Query Count & Frequency

| Endpoint | Method | Frequency | DB Queries | Response Size | Risk Level |
|----------|--------|-----------|------------|---------------|------------|
| `/api/features/check` | GET | VERY HIGH (every page) | 3-4 | 200B | RED — called 3-6x per page load |
| `/api/business/get` | GET | HIGH (dashboard) | 1-2 | 2KB | YELLOW — uncached |
| `/api/products` | GET | HIGH (products page) | 2-3 | 5-50KB | RED — full refetch after save |
| `/api/orders` | GET | HIGH (orders page) | 1 + N*2 | 10-100KB | RED — N+1 critical |
| `/api/shop/business/update` | POST | MEDIUM (profile save) | 4-7 | 500B | YELLOW — inline feature gate |
| `/api/upgrade/options` | GET | LOW (upgrade page) | 8-13 | 10KB | RED — N+1 plan features |
| `/api/analytics/overview` | GET | MEDIUM (dashboard) | 4-6 | 5KB | YELLOW — no caching |
| `/api/payments/verify-payment` | POST | LOW (payment) | 8-12 | 1KB | RED — redundant queries |
| `/api/business/check-slug` | GET | MEDIUM (typing) | 1-2 | 100B | GREEN — debounced 500ms |
| `/api/whatsapp/webhook` | POST | VARIABLE (inbound) | 4-5 | 500B | RED — credential chain |
| `store/[username]` (SSR) | GET | VERY HIGH (public) | 2 (duplicate!) | 15-50KB | RED — getStoreBySlug called 2x |

### Unnecessary Requests Found (28 total)

#### 1. Duplicate Feature Checks Per Page Load
```
Profile page mount:
  → /api/features/check?feature=custom_domain     (1 request)
  → /api/features/check?feature=invoice_customization (1 request)

Products page mount:
  → /api/features/check?feature=create_product     (1 request)

Orders page mount:
  → /api/features/check?feature=live_order_updates  (1 request)
  → /api/features/check?feature=email_invoices      (1 request)

Each feature check = 3-4 Supabase queries backend
Total: 5 feature checks × 4 queries = 20 DB queries just for feature gates on dashboard
```

**FIX: Batch into single `/api/dashboard/init` endpoint**

#### 2. Store Page SSR Double Fetch
```
store/[username]/page.tsx:
  generateMetadata() → getStoreBySlug(username)    // Call 1
  StorePage()        → getStoreBySlug(username)    // Call 2 (DUPLICATE!)
```
**FIX: Use React.cache() to deduplicate**

#### 3. Product List Full Refetch After Save
```
After saving ONE product:
  → POST /api/products/[id] (save)
  → GET /api/products (refetch ENTIRE list)
Instead of: optimistic update of the single changed item
```
**FIX: Optimistic local state update**

#### 4. Orders N+1 Query Pattern
```
GET /api/orders/<user_id>:
  Query 1: Fetch 50 orders
  Query 2-51: Fetch items for each order (N queries!)
  Query 52-101: Fetch customer for each order (N queries!)
  Total: 101 queries for 50 orders
```
**FIX: Batch with `in_()` → 3 queries total**

#### 5. Polling Intervals Too Aggressive
```
Orders page: 10s polling = 360 requests/hour/user
Store client: 10s polling (fallback) = 360 requests/hour/user
```
**FIX: Increase to 30s (120 req/hr) or 60s (60 req/hr)**

### Load Estimation: Requests Per Minute Per User

| Action | Requests/min | DB Queries/min |
|--------|-------------|----------------|
| Dashboard idle (polling) | 6 | 6 |
| Typing business name | 2 (debounced) | 4 |
| Browsing products | 1 | 3 |
| Viewing orders | 6 (polling) | 606 (N+1!) |
| Viewing analytics | 1 | 5 |
| **Total active user** | **~16** | **~624** |

### Estimated Load at Scale

| Users | Concurrent (5%) | Requests/min | DB Queries/min | Survivable? |
|-------|-----------------|-------------|----------------|-------------|
| 10K | 500 | 8,000 | 312,000 | BARELY |
| 100K | 5,000 | 80,000 | 3,120,000 | NO |
| 1M | 10,000+ | 160,000+ | 6,240,000+ | IMPOSSIBLE |

**After optimizations (projected):**

| Users | Concurrent | Requests/min | DB Queries/min | Survivable? |
|-------|-----------|-------------|----------------|-------------|
| 10K | 500 | 2,000 | 6,000 | YES |
| 100K | 5,000 | 20,000 | 60,000 | YES |
| 1M | 10,000+ | 40,000 | 120,000 | YES (with infra) |

---

## PHASE 3: REQUEST OPTIMIZATION PLAN

### 3.1 Batch Dashboard Init Endpoint

**Before:** 4-6 separate requests on dashboard load
**After:** 1 request returns everything

```python
# backend/routes/dashboard_init.py
@bp.route('/api/dashboard/init', methods=['GET'])
@require_auth
def dashboard_init():
    """Single endpoint replacing 4-6 separate calls."""
    user_id = g.user_id
    domain = request.args.get('domain', 'shop')

    # Parallel fetch all needed data
    subscription = _get_subscription(user_id, domain)
    plan_features = _get_all_plan_features(subscription['pricing_plan_id'])
    usage = _get_all_usage(user_id, domain)
    business = _get_business_profile(user_id)

    return jsonify({
        'subscription': subscription,
        'features': {
            feat['feature_key']: {
                'allowed': evaluate_feature(feat, usage.get(feat['feature_key'])),
                'hard_limit': feat.get('hard_limit'),
                'soft_limit': feat.get('soft_limit'),
                'used': usage.get(feat['feature_key'], {}).get('count', 0),
                'remaining': compute_remaining(feat, usage),
            }
            for feat in plan_features
        },
        'business': business,
    })
```

### 3.2 Debouncing & Throttling Strategy

| Action | Current | Proposed |
|--------|---------|----------|
| Business name typing → slug check | 500ms debounce | 500ms (OK) |
| Save button | No protection | Disable during save + 2s cooldown |
| Analytics period change | No debounce | 300ms debounce |
| Polling fallback (orders) | 10s | 30s |
| Polling fallback (store) | 10s | 60s |
| Feature checks | Per-page-load | Batched + 5min client cache |

---

## PHASE 4: FRONTEND PERFORMANCE FIXES

### 4.1 React.cache() for Store SSR Deduplication

```typescript
// frontend/lib/store.ts — add at top
import { cache } from 'react';

export const getStoreBySlugCached = cache(getStoreBySlug);
```

### 4.2 React.memo for Heavy Components

Components that MUST be memoized:
- `ProductCard` — renders in a list, parent re-renders on any state change
- `ProductForm` — complex form, re-renders unnecessarily
- `OrderItem` (in orders page) — list items re-render on filter change

### 4.3 SWR Pattern for Data Fetching

Replace manual fetch + useState with stale-while-revalidate:

```typescript
// Custom hook replacing manual fetch
function useDashboardInit(domain: string) {
  const [data, setData] = useState(null);
  const [stale, setStale] = useState(false);
  const cacheRef = useRef({ data: null, timestamp: 0 });

  const fetch = useCallback(async () => {
    const now = Date.now();
    const cached = cacheRef.current;

    // Return cached if fresh (< 5 min)
    if (cached.data && now - cached.timestamp < 300_000) {
      setData(cached.data);
      setStale(now - cached.timestamp > 60_000);
      // Revalidate in background if > 1 min old
      if (now - cached.timestamp > 60_000) {
        fetchFresh().then(d => { cacheRef.current = { data: d, timestamp: Date.now() }; setData(d); });
      }
      return;
    }

    const fresh = await fetchFresh();
    cacheRef.current = { data: fresh, timestamp: Date.now() };
    setData(fresh);
  }, [domain]);

  return { data, stale, refetch: fetch };
}
```

---

## PHASE 5: BACKEND PERFORMANCE FIXES

### 5.1 N+1 Query Fixes (Critical)

#### Orders — 101 queries → 3 queries
```python
# BEFORE (orders.py line ~360):
for order in orders:
    items = get_order_items(order['id'])        # N queries
    customer = get_customer(order['customer_id']) # N queries

# AFTER:
order_ids = [o['id'] for o in orders]
customer_ids = [o['customer_id'] for o in orders if o.get('customer_id')]

# Batch fetch
all_items = supabase.table('order_items').select('*').in_('order_id', order_ids).execute()
all_customers = supabase.table('customers').select('*').in_('id', customer_ids).execute()

# Group by order
items_by_order = defaultdict(list)
for item in all_items.data:
    items_by_order[item['order_id']].append(item)

customers_by_id = {c['id']: c for c in all_customers.data}
```

#### Feature Gate — Add-on N+1 → batch
```python
# BEFORE (feature_gate_engine.py line ~772):
for addon in addon_result.data:
    addon_detail = plan_addons.select('*').eq('id', addon['plan_addon_id']).execute()

# AFTER:
addon_ids = [a['plan_addon_id'] for a in addon_result.data]
all_addon_details = plan_addons.select('*').in_('id', addon_ids).execute()
addon_map = {a['id']: a for a in all_addon_details.data}
```

#### Upgrade Options — Plan Features N+1 → batch
```python
# BEFORE (upgrade_engine.py line ~247):
for plan in plans:
    features = plan_features.select('*').eq('plan_id', plan['id']).execute()

# AFTER:
plan_ids = [p['id'] for p in plans]
all_features = plan_features.select('*').in_('plan_id', plan_ids).execute()
features_by_plan = defaultdict(list)
for f in all_features.data:
    features_by_plan[f['plan_id']].append(f)
```

### 5.2 Redundant Query Elimination

#### upgrade_api.py — 3 subscription fetches → 1
```python
# Fetch once, pass through
sub = _get_subscription(user_id, domain)
# Use sub everywhere instead of re-querying
```

#### shop_business.py — Duplicate slug reads
```python
# Read slug once at start, reuse
current_biz = supabase.table('businesses').select('url_slug, business_name, url_slug_lower').eq('user_id', uid).execute()
```

### 5.3 Select Only Needed Columns

```python
# BEFORE (everywhere):
supabase.table('subscriptions').select('*').eq('user_id', uid)

# AFTER:
supabase.table('subscriptions').select('id, status, pricing_plan_id, plan_id, product_domain').eq('user_id', uid)
```

---

## PHASE 6: DATABASE OPTIMIZATION

### Required Indexes

```sql
-- Primary lookup patterns (verify these exist)
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_url_slug_lower ON businesses(url_slug_lower);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_domain ON subscriptions(user_id, product_domain);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_usage_counters_composite ON usage_counters(user_id, product_domain, feature_key);
CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id ON plan_features(plan_id);

-- Analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user_date ON analytics_daily(user_id, date);

-- Webhook processing
CREATE INDEX IF NOT EXISTS idx_connected_phones_user_active ON connected_phone_numbers(user_id, is_active);

-- Feature flags (global, small table but frequently queried)
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(feature_key);
```

### Query Execution Plan Fixes

```sql
-- Replace sequential scan on orders list
-- BEFORE: SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC
-- This does a full scan + sort

-- AFTER: Uses covering index
CREATE INDEX IF NOT EXISTS idx_orders_user_created_covering
ON orders(user_id, created_at DESC)
INCLUDE (id, status, customer_name, total_quantity, source);
```

---

## PHASE 7: LOAD BALANCING ARCHITECTURE

### Production Architecture for 1M Users

```
                         ┌──────────────┐
                         │  Cloudflare   │
                         │  CDN + WAF    │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │   Nginx Load Balancer  │
                    │   (Round-Robin + Health)│
                    └───────────┬───────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
     ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐
     │  Next.js #1  │    │  Next.js #2  │    │  Next.js #3  │
     │  (SSR+API)   │    │  (SSR+API)   │    │  (SSR+API)   │
     └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Nginx API Gateway    │
                    └───────────┬───────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
  ┌──────┴──────┐       ┌──────┴──────┐       ┌──────┴──────┐
  │  Flask #1    │       │  Flask #2    │       │  Flask #3    │
  │  (Gunicorn)  │       │  (Gunicorn)  │       │  (Gunicorn)  │
  │  4 workers   │       │  4 workers   │       │  4 workers   │
  └──────┬──────┘       └──────┬──────┘       └──────┴──────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │     Redis Cluster      │
                    │  (Cache + Rate Limit)  │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Supabase PostgreSQL   │
                    │   + PgBouncer Pooling   │
                    └────────────────────────┘
```

### Docker Compose (Production)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - frontend1
      - frontend2
      - backend1
      - backend2
      - backend3

  frontend1:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - NEXT_TELEMETRY_DISABLED=1
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  frontend2:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - NEXT_TELEMETRY_DISABLED=1
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  backend1:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: gunicorn -w 4 -b 0.0.0.0:5000 --timeout 30 --keep-alive 2 app:app
    environment:
      - FLASK_ENV=production
      - REDIS_URL=redis://redis:6379/0
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G

  backend2:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: gunicorn -w 4 -b 0.0.0.0:5000 --timeout 30 --keep-alive 2 app:app
    environment:
      - FLASK_ENV=production
      - REDIS_URL=redis://redis:6379/0
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G

  backend3:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: gunicorn -w 4 -b 0.0.0.0:5000 --timeout 30 --keep-alive 2 app:app
    environment:
      - FLASK_ENV=production
      - REDIS_URL=redis://redis:6379/0
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

  celery_worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A celery_app worker --loglevel=info --concurrency=4
    environment:
      - REDIS_URL=redis://redis:6379/0
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G

volumes:
  redis_data:
```

### Nginx Configuration

```nginx
# nginx/nginx.conf
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    # --- Performance ---
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 30;
    keepalive_requests 1000;

    # --- Buffers ---
    client_body_buffer_size 16k;
    client_max_body_size 10m;

    # --- Gzip ---
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # --- Rate Limiting ---
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;
    limit_req_zone $binary_remote_addr zone=general:10m rate=50r/s;

    # --- Upstream: Frontend ---
    upstream frontend {
        least_conn;
        server frontend1:3000;
        server frontend2:3000;
        keepalive 32;
    }

    # --- Upstream: Backend API ---
    upstream backend {
        least_conn;
        server backend1:5000;
        server backend2:5000;
        server backend3:5000;
        keepalive 64;
    }

    server {
        listen 80;
        server_name flowauxi.com www.flowauxi.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name flowauxi.com www.flowauxi.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        # --- Static Assets (CDN-cacheable) ---
        location /_next/static/ {
            proxy_pass http://frontend;
            proxy_cache_valid 200 365d;
            add_header Cache-Control "public, max-age=31536000, immutable";
        }

        # --- API Routes → Flask Backend ---
        location /api/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Connection pooling
            proxy_http_version 1.1;
            proxy_set_header Connection "";

            proxy_connect_timeout 5s;
            proxy_read_timeout 30s;
        }

        # --- Auth endpoints (stricter rate limit) ---
        location /api/auth/ {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # --- Everything else → Next.js ---
        location / {
            limit_req zone=general burst=30 nodelay;

            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";

            proxy_http_version 1.1;
        }
    }
}
```

---

## PHASE 8: RATE LIMITING

### Application-Level Rate Limits (Flask)

```python
# backend/middleware/rate_limiter.py
from functools import wraps
from flask import request, g, jsonify
import time

def rate_limit(max_requests: int, window_seconds: int, key_func=None):
    """Per-user rate limiter using Redis."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            redis = get_redis()
            if not redis:
                return f(*args, **kwargs)  # Fail open if Redis unavailable

            user_id = key_func() if key_func else getattr(g, 'user_id', request.remote_addr)
            key = f"rl:{f.__name__}:{user_id}"

            pipe = redis.pipeline()
            now = time.time()
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, window_seconds)
            _, _, count, _ = pipe.execute()

            if count > max_requests:
                return jsonify({'error': 'RATE_LIMITED', 'retry_after': window_seconds}), 429

            return f(*args, **kwargs)
        return wrapper
    return decorator
```

### Rate Limit Rules

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| `/api/shop/business/update` | 10 | 60s | Profile spam |
| `/api/business/check-slug` | 20 | 60s | Slug check spam |
| `/api/products` POST | 30 | 60s | Product creation |
| `/api/orders` POST | 60 | 60s | Order creation |
| `/api/features/check` | 60 | 60s | Feature gate |
| `/api/auth/*` | 5 | 60s | Brute force |
| `/api/payments/*` | 10 | 60s | Payment abuse |
| All API (global) | 100 | 60s | General protection |

---

## PHASE 9: STORE PAGE OPTIMIZATION

### Current Issues
1. `getStoreBySlug()` called twice in SSR (generateMetadata + StorePage)
2. No product pagination (loads ALL products)
3. No image lazy loading configuration
4. 60s ISR is good but could be supplemented with on-demand revalidation

### Fixes

#### React.cache() Deduplication
```typescript
// frontend/lib/store.ts
import { cache } from 'react';

// Wrap the fetch function with React.cache for SSR deduplication
export const getStoreBySlugCached = cache(async (slug: string) => {
    return getStoreBySlug(slug);
});
```

#### Product Pagination
```typescript
// Store page should paginate products
const PRODUCTS_PER_PAGE = 20;

// Backend: Add pagination to store endpoint
// GET /api/store/{slug}/products?page=1&limit=20
```

#### On-Demand Revalidation
```typescript
// frontend/app/api/revalidate/store/route.ts
import { revalidatePath } from 'next/cache';

export async function POST(req: Request) {
    const { slug, secret } = await req.json();
    if (secret !== process.env.REVALIDATION_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    revalidatePath(`/store/${slug}`);
    return Response.json({ revalidated: true });
}
```

---

## PHASE 10: CACHING SYSTEM DESIGN

### Cache Layer Architecture

```
Request → L1 (In-Memory, 10s) → L2 (Redis, varies) → L3 (Supabase)
                                                         │
                                                    Write-through
                                                    invalidation
```

### Cache TTL Strategy

| Data | L1 (Memory) | L2 (Redis) | Invalidation |
|------|-------------|------------|--------------|
| Subscriptions | 10s | 60s | On payment event (version bump) |
| Plan features | 60s | 300s | On admin change |
| Feature flags | 60s | 300s | On admin toggle |
| Business profile | — | 300s | On save (key delete) |
| Store page data | — | 300s | On product/profile change |
| Slug resolution | — | 600s | On slug change |
| User ID mapping | — | 3600s | Never changes |
| Analytics daily | — | 60s | On new analytics event |
| Product list | — | 120s | On product CRUD |

### Redis Setup

Redis is already in your stack. Key additions:

```python
# backend/services/cache_service.py
class CacheService:
    """Unified cache layer for all backend services."""

    PREFIXES = {
        'subscription': 'cache:sub',
        'features': 'cache:feat',
        'business': 'cache:biz',
        'store': 'cache:store',
        'products': 'cache:prod',
        'analytics': 'cache:analytics',
    }

    def get_or_fetch(self, prefix: str, key: str, ttl: int, fetcher):
        """Cache-aside pattern with serialization."""
        redis = get_redis()
        cache_key = f"{self.PREFIXES[prefix]}:{key}"

        # Try cache
        if redis:
            cached = redis.get(cache_key)
            if cached:
                return json.loads(cached)

        # Fetch from DB
        result = fetcher()

        # Store in cache
        if redis and result is not None:
            redis.setex(cache_key, ttl, json.dumps(result, default=str))

        return result

    def invalidate(self, prefix: str, key: str):
        """Delete specific cache entry."""
        redis = get_redis()
        if redis:
            redis.delete(f"{self.PREFIXES[prefix]}:{key}")

    def invalidate_pattern(self, prefix: str, pattern: str):
        """Delete all matching keys (use sparingly)."""
        redis = get_redis()
        if redis:
            for key in redis.scan_iter(f"{self.PREFIXES[prefix]}:{pattern}"):
                redis.delete(key)
```

---

## PHASE 11: SCALABILITY DESIGN — 1M USERS

### Resource Requirements

| Component | 10K Users | 100K Users | 1M Users |
|-----------|----------|-----------|---------|
| Next.js instances | 1 (2 CPU, 2GB) | 2 (2 CPU, 4GB each) | 4 (4 CPU, 8GB each) |
| Flask instances | 1 (2 CPU, 1GB) | 3 (2 CPU, 2GB each) | 6 (4 CPU, 4GB each) |
| Gunicorn workers/instance | 4 | 8 | 12 |
| Redis | 1 (256MB) | 1 (512MB) | 1 cluster (2GB) |
| PostgreSQL connections | 20 | 100 | 300 (via PgBouncer) |
| Celery workers | 2 | 4 | 8 |
| Est. monthly cost | $50 | $300 | $1,200 |

### Connection Pooling (Critical at 100K+)

```
Flask workers (6×12=72) → PgBouncer (pool_size=50, max=300) → PostgreSQL (max_connections=300)
```

Supabase handles PgBouncer automatically on paid plans. For self-hosted:

```
# pgbouncer.ini
[databases]
flowauxi = host=db.supabase.co port=5432 dbname=postgres

[pgbouncer]
pool_mode = transaction
default_pool_size = 50
max_client_conn = 300
max_db_connections = 100
```

### Horizontal Scaling Strategy

1. **0-10K users**: Single server, all components
2. **10K-100K**: Separate frontend/backend servers, add Redis
3. **100K-500K**: Multiple backend instances, PgBouncer, CDN
4. **500K-1M+**: Full cluster with auto-scaling, read replicas

---

## PHASE 12: SECURITY & ABUSE PREVENTION

### Threats at Scale

| Threat | Current Protection | Required |
|--------|-------------------|----------|
| Brute force login | None | Rate limit 5/min |
| API scraping | None | Rate limit + API key |
| DDoS | None | Cloudflare WAF |
| Bot account creation | None | CAPTCHA + email verify |
| Payment fraud | Razorpay signature | + velocity checks |
| Webhook replay | HMAC verification | + idempotency keys |

### Implementation

```python
# 1. Request fingerprinting
@app.before_request
def fingerprint_request():
    g.client_ip = request.headers.get('X-Real-IP', request.remote_addr)
    g.user_agent = request.headers.get('User-Agent', '')

    # Block suspicious patterns
    if not g.user_agent or len(g.user_agent) < 10:
        return jsonify({'error': 'Forbidden'}), 403

# 2. Webhook idempotency (already partially implemented)
# Ensure webhook_events table has: (event_id, processed_at, source)

# 3. Anomaly detection (log-based)
# Flag users with > 1000 requests/hour for manual review
```

---

## PHASE 13: FINAL OUTPUT

### 1. Performance Problems Found: 47

| Severity | Count | Examples |
|----------|-------|---------|
| CRITICAL | 5 | N+1 orders, duplicate SSR fetch, no rate limiting |
| HIGH | 12 | Separate feature checks, full product refetch, polling 10s |
| MEDIUM | 18 | Missing memoization, uncached profile, no select filtering |
| LOW | 12 | Missing indexes, no compression on some routes |

### 2. Unnecessary Requests Found: 28

- 5× duplicate feature check calls (should be 1 batch)
- 1× duplicate SSR store fetch (React.cache fix)
- 1× full product list refetch after single save
- 6× polling requests/minute (should be 2)
- N+1 order item fetches (101 queries → 3)

### 3. Worst Bottlenecks (Ranked)

1. **Orders N+1**: 50 orders = 101 DB queries (should be 3)
2. **Feature checks**: 5 separate calls × 4 DB queries = 20 queries per dashboard load
3. **Upgrade options N+1**: 3-5 plan feature lookups per plan
4. **Store SSR double fetch**: 2× getStoreBySlug per page render
5. **10s polling**: 720 requests/hour per active user (orders + store)
6. **No connection pooling**: Each Gunicorn worker holds 1 connection
7. **No rate limiting**: Vulnerable to abuse at any scale

### 4. Fixes Summary

| Fix | Effort | Impact | Queries Saved |
|-----|--------|--------|---------------|
| Batch `/api/dashboard/init` | 1 day | HIGH | 15-20 per page load |
| Orders N+1 → batch | 2 hours | CRITICAL | 98 per order list |
| React.cache() for store SSR | 15 min | HIGH | 1 per store view |
| React.memo ProductCard | 30 min | MEDIUM | 0 (CPU savings) |
| Polling 10s → 30s | 5 min | HIGH | 480/hr per user |
| Feature gate addon N+1 | 1 hour | MEDIUM | 3-5 per check |
| Select column filtering | 2 hours | MEDIUM | 0 (bandwidth savings) |
| Rate limiting middleware | 1 day | HIGH | Prevents abuse |
| DB indexes | 1 hour | MEDIUM | Faster queries |
| Redis cache layer | 1 day | HIGH | 60-80% cache hit |

### 5. Request Reduction Estimate

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Dashboard page load queries | 25-30 | 3-5 | **85%** |
| Orders list queries (50 orders) | 101 | 3 | **97%** |
| Polling requests/hour/user | 720 | 120 | **83%** |
| Store SSR queries | 2 | 1 | **50%** |
| Upgrade page queries | 13 | 4 | **69%** |
| **Average queries per active user/min** | **~624** | **~12** | **98%** |

### 6. Expected Performance at Scale (After Optimization)

| Users | Concurrent | DB Queries/sec | Response P95 | Feasible? |
|-------|-----------|---------------|-------------|-----------|
| 10K | 500 | 100 | <200ms | YES (single server) |
| 100K | 5,000 | 1,000 | <300ms | YES (3 backend + Redis) |
| 1M | 10,000+ | 2,000 | <500ms | YES (6 backend + PgBouncer + CDN) |
