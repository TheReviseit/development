# Production Setup Guide

This guide covers the complete production setup for the WhatsApp Chatbot API with all performance optimizations.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Installation](#installation)
4. [Production Deployment](#production-deployment)
5. [Celery Workers](#celery-workers)
6. [Monitoring](#monitoring)
7. [Load Testing](#load-testing)
8. [Performance Tuning](#performance-tuning)

---

## Prerequisites

- **Python 3.11+**
- **Redis 7.0+** (for caching and Celery)
- **Supabase** (PostgreSQL database)
- **Firebase** (for push notifications)

---

## Environment Variables

Create a `.env` file with the following variables:

```bash
# =============================================================================
# Core Configuration
# =============================================================================
FLASK_ENV=production
FLASK_PORT=5000
FRONTEND_URL=https://your-frontend.vercel.app

# =============================================================================
# WhatsApp API
# =============================================================================
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
FACEBOOK_APP_SECRET=your_app_secret

# =============================================================================
# OpenAI (AI Brain)
# =============================================================================
OPENAI_API_KEY=sk-your-api-key
AI_BRAIN_LLM_MODEL=gpt-4o-mini
AI_BRAIN_TEMPERATURE=0.7

# =============================================================================
# Database
# =============================================================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# =============================================================================
# Redis (Caching & Celery)
# =============================================================================
REDIS_URL=redis://localhost:6379/0

# =============================================================================
# Server Configuration
# =============================================================================
GUNICORN_WORKERS=4
GUNICORN_WORKER_CLASS=gevent
GUNICORN_TIMEOUT=120
GUNICORN_MAX_REQUESTS=1000

# =============================================================================
# Caching
# =============================================================================
CACHE_L1_MAX_SIZE=500
CACHE_L1_TTL=300
CACHE_L2_TTL=3600

# =============================================================================
# Celery
# =============================================================================
CELERY_CONCURRENCY=4

# =============================================================================
# Monitoring
# =============================================================================
ENABLE_PROFILER=true
LOG_LEVEL=INFO
LOG_FORMAT=json
PROFILER_USERNAME=admin
PROFILER_PASSWORD=your_secure_password

# =============================================================================
# Rate Limiting
# =============================================================================
RATE_LIMIT_PER_USER=10
VALIDATE_WEBHOOK=true
```

---

## Installation

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Verify Installation

```bash
python -c "from app import app; print('✅ App loads successfully')"
```

### 3. Start Redis

```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Or using local Redis
redis-server
```

---

## Production Deployment

### Using Gunicorn (Recommended)

```bash
# Using Procfile
gunicorn app:app --bind 0.0.0.0:$PORT --workers 4 --worker-class gevent --timeout 120

# Using gunicorn.conf.py
gunicorn -c gunicorn.conf.py app:app
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
```

### Render.com Deployment

The `Procfile` and `render.yaml` are already configured. Just:

1. Connect your GitHub repo
2. Set environment variables
3. Deploy

---

## Celery Workers

### Start Worker

```bash
# Start worker with all queues
celery -A celery_app worker --loglevel=info --concurrency=4 -Q high,default,low

# Start worker for specific queue
celery -A celery_app worker --loglevel=info -Q high
```

### Start Beat Scheduler (for periodic tasks)

```bash
celery -A celery_app beat --loglevel=info
```

### Start Flower (monitoring UI)

```bash
pip install flower
celery -A celery_app flower --port=5555
```

---

## Monitoring

### Flask Profiler

Access the profiler dashboard at `/profiler/` (requires auth).

### Prometheus Metrics

Metrics are exposed at `/metrics` in Prometheus format.

### Health Checks

- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed status with KPIs
- `/api/metrics` - Performance metrics

---

## Load Testing

### Using Locust

```bash
# Install locust
pip install locust

# Run with web UI
locust -f tests/load_test.py --host=http://localhost:5000

# Headless mode
locust -f tests/load_test.py --host=http://localhost:5000 \
    --users 100 --spawn-rate 10 --run-time 5m --headless
```

### Quick Load Test

```bash
python tests/load_test.py quick http://localhost:5000 100
```

---

## Performance Tuning

### Worker Calculation

```
Workers = 2-4 × CPU cores

For 2-core server: 4-8 workers
For 4-core server: 8-16 workers
```

### Cache TTLs

| Content Type | TTL |
|-------------|-----|
| Session | 5 min |
| User Profile | 1 hour |
| Static Content | 24 hours |
| AI Responses | 5-60 min (by intent) |

### KPI Targets

| Metric | Target |
|--------|--------|
| p95 Response Time | < 200ms |
| p99 Response Time | < 500ms |
| Messages/second | 100+ |
| Cache Hit Rate | > 40% |
| Error Rate | < 5% |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                             │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
┌───────────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
│   Gunicorn        │ │   Gunicorn    │ │   Gunicorn    │
│   + gevent        │ │   + gevent    │ │   + gevent    │
│   (Worker 1)      │ │   (Worker 2)  │ │   (Worker N)  │
└───────────────────┘ └───────────────┘ └───────────────┘
         │                    │                 │
         └────────────────────┼─────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────┐
│                       Flask App                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ Rate Limiter │ │ Compression  │ │   Profiler   │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                            │
│  ┌──────────────────────────────────────────────────┐     │
│  │               AI Brain                            │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐     │     │
│  │  │ Intent  │ │ Context │ │ Response        │     │     │
│  │  │ Detect  │ │ Manager │ │ Generator       │     │     │
│  │  └─────────┘ └─────────┘ └─────────────────┘     │     │
│  └──────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
         │              │               │
┌────────▼────────┐ ┌───▼───┐ ┌────────▼────────┐
│   Multi-Layer   │ │ Redis │ │    Celery       │
│     Cache       │ │       │ │    Workers      │
│  ┌───────────┐  │ │       │ │ ┌─────────────┐ │
│  │ L1: Memory│  │ │       │ │ │ High Queue  │ │
│  ├───────────┤  │ │       │ │ ├─────────────┤ │
│  │ L2: Redis │  │ │       │ │ │ Default Q   │ │
│  └───────────┘  │ │       │ │ ├─────────────┤ │
└─────────────────┘ └───────┘ │ │ Low Queue   │ │
                              │ └─────────────┘ │
                              └─────────────────┘
         │                           │
┌────────▼───────────────────────────▼────────┐
│                  Supabase                    │
│              (PostgreSQL)                    │
└─────────────────────────────────────────────┘
```

---

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping

# Check connection from Python
python -c "import redis; r = redis.from_url('$REDIS_URL'); print(r.ping())"
```

### Celery Not Processing Tasks

```bash
# Check Celery is connected to Redis
celery -A celery_app inspect ping

# Check queues
celery -A celery_app inspect active_queues
```

### Slow Response Times

1. Check cache hit rate: `/api/metrics`
2. Review slow request logs
3. Profile endpoints: `/profiler/`
4. Scale workers if CPU-bound

---

## Support

For issues, check:
- Logs: `docker logs <container>` or application logs
- Metrics: `/api/metrics`
- Health: `/api/health/detailed`

