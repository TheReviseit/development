# Enterprise Credential Manager for Multi-Tenant WhatsApp Platform

## Overview

The **Enterprise Credential Manager** is a world-class, production-grade credential management system designed for multi-tenant WhatsApp platforms. It ensures that credentials are **NEVER unavailable** if they exist anywhere in the system.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ENTERPRISE CREDENTIAL MANAGER                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Request → L1 Cache → L2 Cache → Database → Environment Fallback       │
│              ↓           ↓           ↓              ↓                   │
│           Memory      Redis     Supabase       .env File                │
│           (Fast)    (Shared)    (Source)      (Last Resort)             │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ RETRY MECHANISM │  │ CIRCUIT BREAKER │  │  HEALTH CHECK   │         │
│  │  - 3 retries    │  │  - 5 failures   │  │  - Real-time    │         │
│  │  - Exp backoff  │  │  - Auto-reset   │  │  - Statistics   │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Multi-Layer Caching

- **L1 (Memory)**: Per-worker in-memory LRU cache with TTL (1 hour default)
- **L2 (Redis)**: Shared cache across all workers for consistency

### 2. Automatic Retry with Exponential Backoff

- 3 retry attempts
- Backoff: 100ms → 200ms → 400ms
- Maximum backoff capped at 2 seconds

### 3. Circuit Breaker Pattern

- Opens after 5 consecutive failures
- Auto-resets after 60 seconds (half-open state)
- Prevents cascade failures during outages

### 4. Guaranteed Fallback

- If all else fails, uses credentials from environment variables
- Ensures service continuity during database outages

### 5. Statistics & Monitoring

- Real-time hit rates
- Cache performance metrics
- Circuit breaker status

## Usage

### Basic Usage

```python
from credential_manager import get_credentials_by_phone_number_id

# Get credentials (uses all fallback layers automatically)
credentials = get_credentials_by_phone_number_id("829493816924844")

if credentials:
    print(f"Business: {credentials['business_name']}")
    print(f"Token: {credentials['access_token'][:20]}...")
```

### Health Check

```python
from credential_manager import credential_health_check, get_credential_stats

# Get health status
health = credential_health_check()
print(health)
# {
#     'status': 'healthy',
#     'l1_cache': 'ok',
#     'l2_cache': 'ok',
#     'supabase': 'ok',
#     'env_fallback': 'configured'
# }

# Get detailed statistics
stats = get_credential_stats()
print(stats)
# {
#     'total_requests': 1500,
#     'cache_hits': 1420,
#     'db_hits': 75,
#     'fallback_hits': 5,
#     'failures': 0,
#     'cache_hit_rate': 0.947,
#     'success_rate': 1.0
# }
```

### Invalidation

```python
from credential_manager import invalidate_credentials

# Force refresh credentials (e.g., after token update)
invalidate_credentials("829493816924844")
```

### Preloading (Warm-Up)

```python
from credential_manager import preload_credentials

# Warm up cache on startup
phone_numbers = ["829493816924844", "829493816924845", "829493816924846"]
preload_credentials(phone_numbers)
```

## API Endpoints

### GET /api/health/credentials

Returns credential manager health and statistics.

**Response:**

```json
{
  "status": "ok",
  "health": {
    "status": "healthy",
    "l1_cache": "ok",
    "l2_cache": "ok",
    "supabase": "ok",
    "env_fallback": "configured"
  },
  "stats": {
    "total_requests": 1500,
    "cache_hits": 1420,
    "cache_hit_rate": 0.947,
    "success_rate": 1.0
  }
}
```

### GET /api/health/detailed

Includes credential manager in the detailed health check.

## Configuration

| Environment Variable           | Description                       | Default            |
| ------------------------------ | --------------------------------- | ------------------ |
| `REDIS_URL`                    | Redis connection URL for L2 cache | None (L2 disabled) |
| `WHATSAPP_PHONE_NUMBER_ID`     | Fallback phone number ID          | None               |
| `WHATSAPP_ACCESS_TOKEN`        | Fallback access token             | None               |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Fallback business account ID      | None               |

## Error Handling

The credential manager handles errors at multiple levels:

1. **Database Errors**: Retried 3 times with exponential backoff
2. **Redis Errors**: Falls back to L1 cache + database
3. **All Failures**: Uses environment credentials as last resort

### Error Codes

| Error                                         | Description             | Action                            |
| --------------------------------------------- | ----------------------- | --------------------------------- |
| `[Errno 11] Resource temporarily unavailable` | Transient network error | Auto-retry                        |
| `PGRST116`                                    | No rows found           | Normal - credential doesn't exist |
| Circuit Breaker OPEN                          | Too many failures       | Auto-reset after 60s              |

## Performance

| Metric                 | Target  | Typical   |
| ---------------------- | ------- | --------- |
| L1 Cache Hit Rate      | > 80%   | 85-95%    |
| Overall Cache Hit Rate | > 90%   | 94-98%    |
| P99 Latency (cached)   | < 5ms   | 1-2ms     |
| P99 Latency (DB fetch) | < 500ms | 100-200ms |
| Success Rate           | > 99.9% | 99.99%    |

## Troubleshooting

### Circuit Breaker is OPEN

Check `/api/health/credentials` to see circuit breaker status. The circuit will auto-reset after 60 seconds.

### High Cache Miss Rate

- Check if credentials are being invalidated too frequently
- Verify Redis connection is stable
- Consider increasing L1 cache size

### Fallback Credentials Being Used

- Check database connectivity
- Verify Supabase service role key is valid
- Check for circuit breaker status

## Version History

- **v2.0.0** (2026-01-29): Enterprise Edition with multi-layer caching, circuit breaker, and retry mechanisms
- **v1.0.0**: Initial release with basic credential lookup
