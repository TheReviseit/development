# Instagram DM Automation System — Implementation Plan

## Problem Definition

FlowAuxi currently has a **production WhatsApp automation platform** (Flask backend, Supabase PostgreSQL, Redis, Celery, AI Brain) serving multi-tenant businesses. The goal is to **add Instagram DM automation** as a second channel, while refactoring the architecture into a **unified omni-channel messaging platform** that can absorb future channels (Messenger, SMS, etc.) with near-zero marginal cost.

### Functional Requirements
- Receive and process Instagram DMs via webhooks
- Send automated replies (keyword-based, flow-based, AI-powered)
- Support Instagram-specific message types (Stories, Reels mentions, Quick Replies)
- Manage Instagram OAuth 2.0 token lifecycle (IGBA → Facebook Login)
- Unified inbox view across WhatsApp + Instagram
- Per-tenant Instagram account connection (multi-tenant)
- Rate limit compliance with Instagram Messaging API (200 API calls/user/hour)

### Non-Functional Requirements
- 10K+ messages/sec throughput
- P99 latency < 200ms for webhook acknowledgment
- 99.9% uptime SLA
- Multi-tenant isolation
- Full audit trail for all messages
- GDPR/Meta Platform compliance

### Explicit Assumptions
- Instagram accounts are connected via **Facebook Login for Business** (IGBA lifecycle)
- We reuse the existing Supabase PostgreSQL, Redis, and Celery infrastructure
- The Flask backend is the primary API server (not migrating to a new framework)
- Instagram Graph API v21.0+ is used for messaging
- The AI Brain module is channel-agnostic (text in → text out) and can be reused as-is

---

## Phase 0: System Understanding & Gap Analysis

### Existing System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT FLOWAUXI SYSTEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend (Next.js)                                              │
│  ├── Dashboard (shop.flowauxi.com)                               │
│  ├── Marketing (marketing.flowauxi.com)                          │
│  └── Store Pages (pages.flowauxi.com)                            │
│                                                                  │
│  Backend (Flask + Gunicorn)                                      │
│  ├── app.py — Main Flask app (2162 lines, monolith)              │
│  ├── whatsapp_service.py — WhatsApp Cloud API client (1107 lines)│
│  ├── credential_manager.py — Multi-layer cred caching (680 lines)│
│  ├── ai_brain/ — AI conversation engine (32 files, 400K+ LoC)   │
│  ├── routes/ — 33 API route files                                │
│  ├── services/ — 24 service files                                │
│  ├── middleware/ — 11 middleware files                            │
│  ├── domain/ — DDD entities, schemas, exceptions                 │
│  ├── tasks/ — 14 Celery task files                               │
│  └── config/ — Production configuration                          │
│                                                                  │
│  Infrastructure                                                  │
│  ├── Supabase PostgreSQL (primary DB)                            │
│  ├── Redis (cache + Celery broker + rate limiting)               │
│  ├── Celery (background tasks, 3 priority queues)                │
│  ├── Firebase (auth + Firestore + push notifications)            │
│  └── Razorpay (billing/subscriptions)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Reusability Matrix

| Component | Reusable? | Modifications Needed |
|-----------|-----------|---------------------|
| `credential_manager.py` | ✅ Extend | Add Instagram credential chain (IG → IGBA → FB token) |
| `ai_brain/` | ✅ As-is | Channel-agnostic text processing. Add IG context to prompts |
| `notification_service.py` | ✅ Extend | Add `INSTAGRAM` to `NotificationChannel` enum |
| `webhook_processor.py` | ⚠️ Partially | Current one is Razorpay-specific. Need new IG webhook processor |
| `celery_app.py` | ✅ Extend | Add IG task queues and routing |
| `middleware/rate_limiter.py` | ✅ Extend | Add IG-specific rate limit rules |
| `domain/entities.py` | ✅ Extend | Add `Message` entity for omni-channel |
| `supabase_client.py` | ✅ Extend | Add IG-specific DB operations |
| `WhatsAppService` | ❌ WhatsApp-specific | Build parallel `InstagramService`. Extract common interface |
| `extensions.py` | ✅ As-is | Caching/compression works for all channels |
| `monitoring/` | ✅ Extend | Add IG-specific metrics |

### Gap Analysis

| Gap | Impact | Solution |
|-----|--------|----------|
| No unified messaging interface | Can't add channels cleanly | Create `MessageProvider` ABC |
| WhatsApp service is concrete, not abstract | Tight coupling | Extract `BaseMessagingService` interface |
| No Instagram DB tables | Can't store IG data | Create migration for IG tables |
| No Instagram OAuth flow | Can't authenticate | Build IG OAuth service |
| No webhook routing per channel | All webhooks are WhatsApp | Create channel-aware webhook router |
| No unified inbox data model | Chat view is WhatsApp-only | Create `unified_messages` table |
| `app.py` is 2162 lines | Hard to maintain | Already modularized with routes/, but webhook handler is inline |

---

## System Architecture

### High-Level Architecture (Omni-Channel)

```
                         ┌──────────────────┐
                         │   Meta Platform    │
                         │  ┌──────┐ ┌─────┐ │
                         │  │ IGMA │ │ WA  │ │
                         │  │ API  │ │ API │ │
                         │  └──┬───┘ └──┬──┘ │
                         └─────┼────────┼────┘
                               │        │
                    ╔══════════╧════════╧══════════╗
                    ║   WEBHOOK GATEWAY LAYER       ║
                    ║  ┌──────────────────────────┐ ║
                    ║  │ Signature Verification    │ ║
                    ║  │ Channel Router            │ ║
                    ║  │ Replay Protection         │ ║
                    ║  └──────────┬───────────────┘ ║
                    ╚═════════════╪═════════════════╝
                                  │
                    ╔═════════════╧═════════════════╗
                    ║   MESSAGE NORMALIZATION LAYER  ║
                    ║  ┌──────────────────────────┐  ║
                    ║  │ Channel-specific → Unified │  ║
                    ║  │ NormalizedMessage          │  ║
                    ║  └──────────┬───────────────┘  ║
                    ╚═════════════╪═══════════════════╝
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────┴─────────┐ ┌──────┴──────┐ ┌─────────┴─────────┐
    │  AUTOMATION ENGINE │ │  AI BRAIN   │ │  FLOW ENGINE      │
    │  (Keyword/Trigger) │ │  (GPT/Gemini│ │  (Workflow Steps) │
    │  Rule Matching     │ │   Response) │ │  Conditional Logic│
    └─────────┬─────────┘ └──────┬──────┘ └─────────┬─────────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                    ╔═════════════╧═════════════════╗
                    ║   MESSAGE DISPATCH LAYER       ║
                    ║  ┌──────────────────────────┐  ║
                    ║  │ Unified → Channel-specific│  ║
                    ║  │ Rate Limiting             │  ║
                    ║  │ Retry + DLQ               │  ║
                    ║  └──────────┬───────────────┘  ║
                    ╚═════════════╪═══════════════════╝
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────┴─────────┐ ┌──────┴──────┐ ┌─────────┴─────────┐
    │ InstagramProvider  │ │ WhatsApp    │ │ MessengerProvider  │
    │ (IG Graph API)     │ │ Provider    │ │ (Future)           │
    └────────────────────┘ └─────────────┘ └────────────────────┘
```

### Service-by-Service Breakdown

| Service | Responsibility | Tech | Location |
|---------|---------------|------|----------|
| **Webhook Gateway** | Receive, verify, deduplicate webhooks from all channels | Flask Blueprint | `routes/webhooks/` |
| **Message Normalizer** | Convert channel-specific payloads to `NormalizedMessage` | Python | `services/messaging/normalizers/` |
| **Automation Engine** | Keyword triggers, rule matching, flow execution | Python | `services/messaging/automation/` |
| **Message Dispatcher** | Convert `NormalizedMessage` to channel-specific API calls | Python + Celery | `services/messaging/providers/` |
| **Instagram Service** | Instagram Graph API client (send, receive, media) | Python | `services/messaging/providers/instagram_provider.py` |
| **Token Lifecycle** | OAuth 2.0 token management, refresh, rotation | Python + Celery Beat | `services/messaging/token_manager.py` |
| **Credential Manager** | Multi-channel credential resolution with caching | Python | `credential_manager.py` (extended) |
| **Unified Inbox** | Cross-channel conversation view | Flask + Supabase | `routes/inbox.py` |

---

## Database Schema (Multi-Tenant SaaS)

### New Tables

```sql
-- ===================================================================
-- Channel Connections (extends connected_phone_numbers pattern)
-- ===================================================================
CREATE TABLE channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,               -- Firebase UID (tenant)
    channel TEXT NOT NULL,               -- 'whatsapp', 'instagram', 'messenger'
    
    -- Channel-specific identifiers
    channel_account_id TEXT NOT NULL,     -- IG: instagram_business_account_id, WA: phone_number_id
    channel_display_name TEXT,           -- Business name on the channel
    channel_username TEXT,               -- IG: @username
    channel_profile_pic_url TEXT,
    
    -- Auth / Token
    access_token TEXT NOT NULL,          -- Encrypted at rest
    token_expires_at TIMESTAMPTZ,
    refresh_token TEXT,                  -- For long-lived token refresh
    token_type TEXT DEFAULT 'user',      -- 'user', 'system_user', 'page'
    
    -- Facebook hierarchy
    facebook_page_id TEXT,              -- Required for IG messaging
    facebook_account_id UUID REFERENCES connected_facebook_accounts(id),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_webhook_at TIMESTAMPTZ,
    
    -- Metadata
    permissions JSONB DEFAULT '[]',      -- Granted permissions
    metadata JSONB DEFAULT '{}',         -- Channel-specific config
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, channel, channel_account_id)
);

CREATE INDEX idx_channel_conn_user_channel ON channel_connections(user_id, channel);
CREATE INDEX idx_channel_conn_account ON channel_connections(channel_account_id);
CREATE INDEX idx_channel_conn_page ON channel_connections(facebook_page_id);

-- ===================================================================
-- Unified Messages (cross-channel message store)
-- ===================================================================
CREATE TABLE unified_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant
    user_id TEXT NOT NULL,               -- Firebase UID (business owner)
    
    -- Channel
    channel TEXT NOT NULL,               -- 'whatsapp', 'instagram', 'messenger'
    channel_connection_id UUID REFERENCES channel_connections(id),
    
    -- Message identity
    channel_message_id TEXT NOT NULL,     -- Platform-specific message ID (wamid, ig_mid)
    conversation_id UUID,                -- Logical conversation grouping
    thread_id TEXT,                       -- Platform thread/conversation ID
    
    -- Direction
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    
    -- Participants
    sender_id TEXT NOT NULL,             -- Platform-specific sender ID
    sender_name TEXT,
    recipient_id TEXT NOT NULL,          -- Platform-specific recipient ID
    recipient_name TEXT,
    
    -- Content
    message_type TEXT NOT NULL,          -- 'text', 'image', 'video', 'story_mention',
                                        -- 'story_reply', 'reel_mention', 'quick_reply',
                                        -- 'interactive', 'template', 'reaction'
    message_body TEXT,                   -- Text content
    media_url TEXT,                      -- Media attachment URL
    media_type TEXT,                     -- 'image', 'video', 'audio', 'document'
    media_id TEXT,                       -- Platform media ID
    
    -- Instagram-specific
    story_id TEXT,                       -- If story mention/reply
    reel_id TEXT,                        -- If reel mention
    referral_source TEXT,               -- 'ad', 'organic', 'story', 'reel'
    
    -- Status
    status TEXT DEFAULT 'received',     -- 'received', 'read', 'sent', 'delivered', 'failed'
    error_message TEXT,
    
    -- AI/Automation
    is_automated BOOLEAN DEFAULT FALSE,
    automation_rule_id UUID,            -- Which rule triggered this response
    ai_model_used TEXT,                 -- 'gemini', 'gpt-4', 'local'
    ai_confidence FLOAT,
    
    -- Timestamps
    platform_timestamp TIMESTAMPTZ,     -- When Meta says it happened
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Idempotency
    UNIQUE(channel, channel_message_id)
);

CREATE INDEX idx_unified_msgs_user_channel ON unified_messages(user_id, channel, created_at DESC);
CREATE INDEX idx_unified_msgs_conversation ON unified_messages(conversation_id, created_at ASC);
CREATE INDEX idx_unified_msgs_sender ON unified_messages(user_id, sender_id, channel);
CREATE INDEX idx_unified_msgs_thread ON unified_messages(thread_id, created_at ASC);

-- ===================================================================
-- Conversations (cross-channel conversation tracking)
-- ===================================================================
CREATE TABLE unified_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant
    user_id TEXT NOT NULL,
    
    -- Channel
    channel TEXT NOT NULL,
    channel_connection_id UUID REFERENCES channel_connections(id),
    
    -- Contact
    contact_platform_id TEXT NOT NULL,   -- IGSID for IG, phone for WA
    contact_name TEXT,
    contact_username TEXT,               -- IG: @username
    contact_profile_pic TEXT,
    
    -- Thread
    thread_id TEXT,                      -- Platform thread ID
    
    -- State
    status TEXT DEFAULT 'active',       -- 'active', 'archived', 'blocked'
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    unread_count INT DEFAULT 0,
    is_starred BOOLEAN DEFAULT FALSE,
    
    -- Labels/Tags
    labels JSONB DEFAULT '[]',
    
    -- Automation state
    automation_active BOOLEAN DEFAULT TRUE,
    current_flow_id UUID,               -- If in mid-flow
    flow_state JSONB,                   -- Flow execution state
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, channel, contact_platform_id)
);

CREATE INDEX idx_unified_convos_user ON unified_conversations(user_id, channel, last_message_at DESC);
CREATE INDEX idx_unified_convos_contact ON unified_conversations(contact_platform_id, channel);

-- ===================================================================
-- Automation Rules (cross-channel)
-- ===================================================================
CREATE TABLE automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    
    -- Scope
    name TEXT NOT NULL,
    description TEXT,
    channels TEXT[] NOT NULL DEFAULT '{instagram,whatsapp}',  -- Which channels
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,             -- Higher = checked first
    
    -- Trigger
    trigger_type TEXT NOT NULL,         -- 'keyword', 'story_mention', 'reel_mention',
                                        -- 'new_follower', 'first_message', 'regex'
    trigger_config JSONB NOT NULL,     -- {"keywords": ["hi", "hello"], "match_type": "contains"}
    
    -- Action
    action_type TEXT NOT NULL,          -- 'reply_text', 'reply_template', 'start_flow',
                                        -- 'ai_response', 'assign_label', 'webhook'
    action_config JSONB NOT NULL,      -- {"message": "Hi! How can I help?"}
    
    -- Conditions
    conditions JSONB DEFAULT '[]',     -- [{"field": "time", "op": "between", "value": ["9:00","17:00"]}]
    
    -- Stats
    trigger_count INT DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_rules_user ON automation_rules(user_id, is_active, priority DESC);

-- ===================================================================
-- Automation Flows (multi-step workflows)
-- ===================================================================
CREATE TABLE automation_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    
    name TEXT NOT NULL,
    description TEXT,
    channels TEXT[] NOT NULL DEFAULT '{instagram,whatsapp}',
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Flow definition (JSON graph)
    steps JSONB NOT NULL,              -- Array of step definitions
    -- Step schema:
    -- {
    --   "id": "step_1",
    --   "type": "send_message" | "wait_for_reply" | "condition" | "delay" | "ai_response",
    --   "config": { ... },
    --   "next": "step_2" | {"yes": "step_3", "no": "step_4"}
    -- }
    
    -- Variables available in flow
    variables JSONB DEFAULT '{}',
    
    -- Stats
    total_runs INT DEFAULT 0,
    completed_runs INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_flows_user ON automation_flows(user_id, is_active);

-- ===================================================================
-- Webhook Events (cross-channel replay protection)
-- ===================================================================
-- Extends existing webhook_events table pattern
CREATE TABLE channel_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,      -- Platform event ID
    channel TEXT NOT NULL,
    event_type TEXT NOT NULL,           -- 'messages', 'messaging_postbacks', etc.
    raw_payload JSONB NOT NULL,
    processing_result TEXT,
    processing_time_ms FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channel_webhooks_event ON channel_webhook_events(event_id);
CREATE INDEX idx_channel_webhooks_created ON channel_webhook_events(created_at DESC);

-- ===================================================================
-- Token Lifecycle Tracking
-- ===================================================================
CREATE TABLE token_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_connection_id UUID REFERENCES channel_connections(id),
    event_type TEXT NOT NULL,           -- 'created', 'refreshed', 'expired', 'revoked'
    old_expires_at TIMESTAMPTZ,
    new_expires_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Event-Driven Message Flow (Step-by-Step)

```
1. META WEBHOOK → POST /api/webhooks/meta
   │
2. VERIFY: HMAC-SHA256 signature check (shared app secret)
   │
3. ACK: Return 200 immediately (Meta requires < 20s response)
   │
4. ROUTE: Channel router identifies channel from webhook object field
   │  object="instagram" → Instagram handler
   │  object="whatsapp_business_account" → WhatsApp handler
   │
5. DEDUPLICATE: Check channel_webhook_events for event_id
   │
6. NORMALIZE: Convert channel-specific payload → NormalizedMessage
   │  Instagram: messaging.message → NormalizedMessage
   │  WhatsApp: entry.changes.value.messages → NormalizedMessage
   │
7. RESOLVE TENANT: channel_account_id → channel_connections → user_id
   │
8. STORE: Insert into unified_messages (inbound, status=received)
   │
9. UPDATE CONVERSATION: Upsert unified_conversations (last_message, unread++)
   │
10. DISPATCH TO CELERY: tasks.messaging.process_inbound_message.delay(msg_id)
    │
    ├── 11a. RULE ENGINE: Match against automation_rules (priority-ordered)
    │   ├── keyword match → reply_text action
    │   ├── story_mention → start_flow action
    │   └── no match → fall through to AI
    │
    ├── 11b. FLOW ENGINE: If conversation is mid-flow, execute next step
    │   ├── wait_for_reply → check response, advance flow
    │   ├── condition → evaluate, route to next step
    │   └── send_message → queue outbound message
    │
    └── 11c. AI BRAIN: Generate contextual response
        ├── Load business context (products, FAQs)
        ├── Load conversation history (last 20 messages)
        └── Generate response (Gemini/GPT)
    │
12. ENQUEUE RESPONSE: tasks.messaging.send_outbound_message.delay(response)
    │
13. DISPATCH: MessageDispatcher routes to correct provider
    │  channel="instagram" → InstagramProvider.send()
    │  channel="whatsapp" → WhatsAppProvider.send()
    │
14. RATE LIMIT CHECK: Sliding window per channel_connection_id
    │  Instagram: 200 calls/hour/IGBA
    │  WhatsApp: 80 messages/second (Tier dependent)
    │
15. API CALL: Send message via platform API
    │
16. STORE RESPONSE: Insert into unified_messages (outbound, status=sent)
    │
17. UPDATE STATUS: Webhook delivery receipts → update status to delivered/read
```

---

## API Design

### Webhook Endpoint (Unified)

```
POST /api/webhooks/meta
  Headers: X-Hub-Signature-256
  Body: Meta webhook payload
  Response: 200 "EVENT_RECEIVED"

GET /api/webhooks/meta
  Query: hub.mode, hub.verify_token, hub.challenge
  Response: hub.challenge (webhook verification)
```

### Instagram Connection API

```
POST /api/channels/instagram/connect
  Body: { code: "oauth_code", redirect_uri: "..." }
  Response: { channel_connection_id, instagram_account: {...} }

DELETE /api/channels/instagram/disconnect
  Body: { channel_connection_id }
  Response: { success: true }

GET /api/channels/instagram/status
  Response: { connected: true, account: {...}, token_expires_at: "..." }
```

### Automation Rules API

```
GET    /api/automation/rules           → List rules (with pagination)
POST   /api/automation/rules           → Create rule
GET    /api/automation/rules/:id       → Get rule details
PUT    /api/automation/rules/:id       → Update rule
DELETE /api/automation/rules/:id       → Delete rule
POST   /api/automation/rules/:id/test  → Test rule against sample message
```

### Automation Flows API

```
GET    /api/automation/flows           → List flows
POST   /api/automation/flows           → Create flow
GET    /api/automation/flows/:id       → Get flow details
PUT    /api/automation/flows/:id       → Update flow
DELETE /api/automation/flows/:id       → Delete flow
```

### Unified Inbox API

```
GET  /api/inbox/conversations
  Query: channel, status, search, page, limit
  Response: { conversations: [...], total, page }

GET  /api/inbox/conversations/:id/messages
  Query: before, limit
  Response: { messages: [...], has_more }

POST /api/inbox/conversations/:id/send
  Body: { message_type, message_body, media_url }
  Response: { message_id, status }

PATCH /api/inbox/conversations/:id
  Body: { status, labels, automation_active }
  Response: { conversation }
```

---

## Example Automation Workflow

```json
{
  "name": "Instagram Story Mention → Product Catalog",
  "channels": ["instagram"],
  "trigger": {
    "type": "story_mention",
    "config": {}
  },
  "flow": {
    "steps": [
      {
        "id": "step_1",
        "type": "send_message",
        "config": {
          "message": "Hey {{contact.name}}! Thanks for the story mention! 🙏"
        },
        "next": "step_2"
      },
      {
        "id": "step_2",
        "type": "delay",
        "config": { "seconds": 3 },
        "next": "step_3"
      },
      {
        "id": "step_3",
        "type": "send_message",
        "config": {
          "message": "Here's our latest collection! Which one catches your eye?",
          "quick_replies": [
            { "title": "T-Shirts 👕", "payload": "category_tshirts" },
            { "title": "Sneakers 👟", "payload": "category_sneakers" },
            { "title": "Browse All 🛍️", "payload": "catalog_all" }
          ]
        },
        "next": "step_4"
      },
      {
        "id": "step_4",
        "type": "wait_for_reply",
        "config": { "timeout_seconds": 3600 },
        "next": {
          "category_tshirts": "step_show_tshirts",
          "category_sneakers": "step_show_sneakers",
          "catalog_all": "step_show_catalog",
          "timeout": "step_followup"
        }
      }
    ]
  }
}
```

---

## Scaling Strategy (Real Numbers)

| Metric | Phase 1 (0-10K users) | Phase 2 (10K-100K) | Phase 3 (100K-1M+) |
|--------|----------------------|--------------------|--------------------|
| **Backend** | 3 Flask workers (Gunicorn) | 6 workers + 2 replicas | 12 workers + 4 replicas + HPA |
| **Celery** | 4 workers, 3 queues | 8 workers, 5 queues | 16 workers, dedicated IG queue |
| **Redis** | 512MB single node | 1GB + read replica | 2GB Redis Cluster (3 shards) |
| **PostgreSQL** | Supabase Pro (2 cores) | Supabase Team (4 cores) | Dedicated PG (8 cores + read replicas) |
| **Messages/sec** | ~100/s | ~1K/s | ~10K/s |
| **Webhook latency** | < 50ms P99 | < 100ms P99 | < 200ms P99 |

### Rate Limit Handling (Instagram-Specific)

Instagram Messaging API enforces: **200 API calls per user per hour per IGBA**.

Strategy:
1. **Sliding window counter** per `channel_connection_id` in Redis
2. **Backpressure**: If at 180/200, delay non-critical messages by 60s
3. **Overflow queue**: Messages exceeding limit go to DLQ with retry at next window
4. **Monitoring**: Alert at 150/200 threshold

---

## Failure Scenarios + Mitigation

| Scenario | Detection | Mitigation | Recovery |
|----------|-----------|------------|----------|
| **Meta webhook delivery failure** | Meta retries up to 7 times over 36h | Webhook endpoint returns 200 immediately, processes async | Replay protection prevents duplicates |
| **Instagram token expiration** | `token_expires_at` check in Celery Beat (daily) | Exchange short-lived for 60-day long-lived token | Auto-refresh 7 days before expiry |
| **Rate limit hit (429)** | API response code + Redis counter | Exponential backoff + message queuing in DLQ | Process DLQ messages in next rate window |
| **AI Brain timeout** | 10s timeout per request | Fallback to rule-based response or "We'll get back to you" | Circuit breaker (5 failures → 60s cooldown) |
| **Database connection pool exhaustion** | Connection timeout metrics | PgBouncer pool (50 connections) | Auto-scaling read replicas |
| **Celery worker crash** | Heartbeat monitoring | Task acknowledgment + visibility timeout | Auto-restart via supervisor/K8s |
| **Credential decryption failure** | Exception in `crypto_utils` | Fallback to environment credentials | Alert + manual key rotation |
| **Webhook signature mismatch** | HMAC verification failure | Reject webhook, log for investigation | Check if app secret was rotated |

---

## Production Folder Structure

```
backend/
├── services/
│   └── messaging/                     # [NEW] Omni-channel messaging module
│       ├── __init__.py
│       ├── base.py                    # MessageProvider ABC, NormalizedMessage
│       ├── dispatcher.py             # MessageDispatcher (routes to providers)
│       ├── normalizers/
│       │   ├── __init__.py
│       │   ├── instagram_normalizer.py
│       │   └── whatsapp_normalizer.py
│       ├── providers/
│       │   ├── __init__.py
│       │   ├── instagram_provider.py  # Instagram Graph API client
│       │   └── whatsapp_provider.py   # Wraps existing WhatsAppService
│       ├── automation/
│       │   ├── __init__.py
│       │   ├── rule_engine.py         # Keyword/trigger matching
│       │   ├── flow_engine.py         # Multi-step flow execution
│       │   └── personalization.py     # Template variable resolution
│       └── token_manager.py           # OAuth token lifecycle
│
├── routes/
│   └── webhooks/                      # [NEW] Channel webhook handlers
│       ├── __init__.py
│       ├── meta_webhook.py            # Unified Meta webhook endpoint
│       ├── instagram_handler.py       # IG-specific webhook processing
│       └── whatsapp_handler.py        # WA-specific webhook processing
│   └── channels/                      # [NEW] Channel management API
│       ├── __init__.py
│       ├── instagram_api.py           # IG connect/disconnect/status
│       └── channels_api.py            # Generic channel operations
│   └── automation_api.py              # [NEW] Automation rules + flows CRUD
│   └── inbox_api.py                   # [NEW] Unified inbox API
│
├── tasks/
│   ├── instagram_messaging.py         # [NEW] IG message processing tasks
│   ├── token_refresh.py               # [NEW] Token lifecycle tasks
│   └── automation_execution.py        # [NEW] Flow execution tasks
│
├── migrations/
│   ├── 070_channel_connections.sql     # [NEW]
│   ├── 071_unified_messages.sql        # [NEW]
│   ├── 072_unified_conversations.sql   # [NEW]
│   ├── 073_automation_rules.sql        # [NEW]
│   ├── 074_automation_flows.sql        # [NEW]
│   ├── 075_channel_webhook_events.sql  # [NEW]
│   └── 076_token_lifecycle_events.sql  # [NEW]
│
└── tests/
    └── messaging/                     # [NEW]
        ├── test_instagram_provider.py
        ├── test_normalizers.py
        ├── test_rule_engine.py
        ├── test_flow_engine.py
        └── test_webhook_handler.py
```

---

## Proposed Changes (by Component)

### Messaging Module (Core — New)

#### [NEW] [base.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/services/messaging/base.py)
- `MessageProvider` abstract base class with `send_text()`, `send_media()`, `send_quick_replies()`
- `NormalizedMessage` dataclass (channel-agnostic message representation)
- `MessageDirection`, `MessageType`, `Channel` enums

#### [NEW] [instagram_provider.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/services/messaging/providers/instagram_provider.py)
- Instagram Graph API v21.0 client
- Methods: `send_text()`, `send_image()`, `send_quick_replies()`, `send_generic_template()`
- Rate limit tracking (200/hour/IGBA sliding window in Redis)

#### [NEW] [whatsapp_provider.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/services/messaging/providers/whatsapp_provider.py)
- Wrapper around existing `WhatsAppService` conforming to `MessageProvider` interface

#### [NEW] [dispatcher.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/services/messaging/dispatcher.py)
- Routes `NormalizedMessage` to correct provider
- Handles rate limiting, retry, DLQ
- Idempotency check before dispatch

---

### Webhook Handling (New)

#### [NEW] [meta_webhook.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/routes/webhooks/meta_webhook.py)
- Unified POST endpoint for all Meta webhooks (IG + WA)
- GET endpoint for webhook verification
- HMAC-SHA256 signature verification
- Channel detection from `object` field
- Async processing via Celery

#### [NEW] [instagram_handler.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/routes/webhooks/instagram_handler.py)
- Process IG-specific messaging events: `messages`, `messaging_postbacks`, `messaging_referrals`
- Handle story mention, reel mention, reactions

---

### Automation Engine (New)

#### [NEW] [rule_engine.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/services/messaging/automation/rule_engine.py)
- Priority-ordered rule matching
- Keyword matching (exact, contains, regex)
- Trigger type matching (story_mention, first_message, etc.)
- Condition evaluation (time-based, sender-based)

#### [NEW] [flow_engine.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/services/messaging/automation/flow_engine.py)
- Multi-step flow execution with state persistence
- Step types: `send_message`, `wait_for_reply`, `condition`, `delay`, `ai_response`
- Conditional branching based on user input
- Timeout handling with fallback steps

---

### Infrastructure (Extend Existing)

#### [MODIFY] [celery_app.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/celery_app.py)
- Add task includes: `tasks.instagram_messaging`, `tasks.token_refresh`, `tasks.automation_execution`
- Add queue: `instagram` (dedicated queue for IG message processing)
- Add task routes for IG-specific tasks
- Add Celery Beat schedule for token refresh (daily at 4 AM UTC)

#### [MODIFY] [credential_manager.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/credential_manager.py)
- Add `get_instagram_credentials(channel_connection_id)` method
- Extend the L1/L2 cache strategy for IG credentials
- Support the `channel_connections` table lookup chain

#### [MODIFY] [app.py](file:///c:/Users/Sugan001/Desktop/Flowauxi/backend/app.py)
- Register new blueprints: `webhooks_bp`, `channels_bp`, `automation_bp`, `inbox_bp`
- Add IG-specific CORS origins if needed

---

## Security Model

| Layer | Implementation |
|-------|---------------|
| **Webhook Verification** | HMAC-SHA256 with Meta app secret (constant-time comparison) |
| **Token Encryption** | AES-256-GCM via existing `crypto_utils.py` for access_token at rest |
| **API Authentication** | Firebase JWT verification (existing middleware) |
| **Multi-Tenant Isolation** | All queries filtered by `user_id` (Firebase UID) |
| **Rate Limiting** | Per-user + per-channel sliding window in Redis |
| **Input Sanitization** | Message content sanitized before storage/display |
| **RBAC** | Existing subscription_guard middleware gates IG features |
| **Audit Logging** | All token operations logged to `token_lifecycle_events` |

---

## Observability Plan

| Signal | Implementation | Alert Threshold |
|--------|---------------|-----------------|
| **Webhook latency** | `X-Response-Time` header + Prometheus histogram | P99 > 200ms |
| **Message processing time** | Celery task duration metric | P95 > 5s |
| **Webhook failure rate** | Counter of 4xx/5xx responses | > 1% in 5 min |
| **Token expiry countdown** | Celery Beat check, Prometheus gauge | < 7 days remaining |
| **Rate limit proximity** | Redis counter / 200 per IGBA | > 80% utilization |
| **DLQ depth** | Redis list length metric | > 100 messages |
| **Circuit breaker state** | State gauge per service | Any OPEN state |
| **AI Brain latency** | Existing `ai_response_time_ms` metric | P95 > 8s |

### Structured Logging Format
```python
logger.info(
    "msg_processed",
    extra={
        "channel": "instagram",
        "direction": "inbound",
        "tenant_id": user_id[:15],
        "message_type": "story_mention",
        "processing_time_ms": elapsed,
        "correlation_id": correlation_id,
    }
)
```

---

## Testing Strategy

### Unit Tests
- `test_instagram_provider.py` — Mock Instagram Graph API responses
- `test_normalizers.py` — Verify IG/WA payload → NormalizedMessage conversion
- `test_rule_engine.py` — Keyword matching, priority ordering, condition evaluation
- `test_flow_engine.py` — Step execution, branching, timeout handling
- `test_webhook_handler.py` — Signature verification, channel routing, replay protection

### Integration Tests
- End-to-end webhook → message store → automation → response flow
- Token refresh lifecycle simulation
- Rate limit enforcement test
- Multi-tenant isolation verification

### Commands
```bash
# Unit tests
pytest backend/tests/messaging/ -v

# Integration tests (requires Redis + Supabase)
pytest backend/tests/messaging/ -v -m integration

# Load test (webhook throughput)
locust -f backend/tests/load/webhook_load.py --host=http://localhost:5000
```

---

## Rollback Strategy

| Change | Rollback Method |
|--------|----------------|
| Database migrations | Each migration includes explicit `-- ROLLBACK:` section |
| New Python modules | Feature-flagged imports in `app.py` (existing pattern) |
| Celery tasks | Remove from `include` list → tasks become no-ops |
| Webhook endpoint | Route to old handler via feature flag |
| Credential manager changes | Non-breaking additions, original methods untouched |

---

## Execution Plan (Atomic Steps)

### Phase 1: Core Abstractions (Week 1)
1. Create `services/messaging/base.py` — MessageProvider ABC + NormalizedMessage
2. Create `services/messaging/providers/whatsapp_provider.py` — Wrap existing WhatsAppService
3. Create `services/messaging/providers/instagram_provider.py` — IG Graph API client
4. Create `services/messaging/dispatcher.py` — Route messages to providers
5. Write unit tests for all base classes

### Phase 2: Database + Instagram Integration (Week 2)
6. Create all database migrations (070-076)
7. Create `services/messaging/normalizers/instagram_normalizer.py`
8. Create `services/messaging/normalizers/whatsapp_normalizer.py`
9. Create `routes/webhooks/meta_webhook.py` — Unified webhook endpoint
10. Create `routes/webhooks/instagram_handler.py` — IG message processing
11. Create `routes/channels/instagram_api.py` — OAuth + connection API
12. Create `services/messaging/token_manager.py` — Token lifecycle

### Phase 3: Automation Engine (Week 3)
13. Create `services/messaging/automation/rule_engine.py`
14. Create `services/messaging/automation/flow_engine.py`
15. Create `services/messaging/automation/personalization.py`
16. Create `routes/automation_api.py` — CRUD API
17. Create `tasks/instagram_messaging.py` — Celery tasks
18. Create `tasks/automation_execution.py` — Flow execution tasks

### Phase 4: Integration + Inbox (Week 4)
19. Create `routes/inbox_api.py` — Unified inbox API
20. Modify `celery_app.py` — Add IG queues and task routing
21. Modify `credential_manager.py` — Add IG credential chain
22. Modify `app.py` — Register all new blueprints
23. Create `tasks/token_refresh.py` — Celery Beat token refresh

### Phase 5: Testing + Polish (Week 5)
24. Write integration tests
25. Load testing with Locust
26. Security audit (token storage, HMAC verification)
27. Observability setup (metrics, alerts)

---

## Open Questions

> [!IMPORTANT]
> **1. Instagram API Access**: Do you already have an approved Meta App with Instagram Messaging API (`instagram_manage_messages` and `pages_messaging` permissions)? If not, this needs to be set up in the Meta Developer Console first.

> [!IMPORTANT]
> **2. Data Migration Strategy**: Should existing WhatsApp messages be migrated to the new `unified_messages` table, or should the old `messages` table remain and the unified table only be used for new messages going forward? Migration is safer long-term but requires a backfill script.

> [!WARNING]
> **3. Billing/Feature Gating**: Instagram automation should likely be a paid feature (Business+ plan or higher). Should we gate it behind the existing feature entitlement system (`feature_gate_engine.py`)? If yes, what plan tier should it start from?

> [!IMPORTANT]
> **4. AI Brain Channel Context**: The AI Brain currently generates responses optimized for WhatsApp formatting (*bold*, etc.). Should we create channel-aware formatters that adapt AI responses for Instagram (where markdown isn't supported)?

> [!NOTE]
> **5. Deployment Priority**: Do you want to ship Phase 1+2 (Instagram receive/reply) first as an MVP, then add automation (Phase 3) as a follow-up? Or do you want the full automation engine before any public release?

---

## Verification Plan

### Automated Tests
```bash
# Run all messaging tests
pytest backend/tests/messaging/ -v --cov=services/messaging --cov-report=html

# Run webhook signature verification tests
pytest backend/tests/messaging/test_webhook_handler.py -v

# Run automation engine tests
pytest backend/tests/messaging/test_rule_engine.py backend/tests/messaging/test_flow_engine.py -v
```

### Manual Verification
1. **Instagram webhook**: Connect test IG account → send DM → verify webhook received
2. **Auto-reply**: Set up keyword rule → send matching DM → verify automated response
3. **Story mention flow**: Mention test account in story → verify DM flow starts
4. **Token refresh**: Set token expiry to 1 hour → verify Celery Beat refreshes it
5. **Rate limiting**: Send 201 messages rapidly → verify 201st is queued, not failed
6. **Unified inbox**: Open inbox → verify both WA and IG conversations appear together

### Browser Testing
- Navigate to `/dashboard/channels` → Connect Instagram flow
- Navigate to `/dashboard/automation` → Create rule + flow
- Navigate to `/dashboard/inbox` → Send manual IG reply
