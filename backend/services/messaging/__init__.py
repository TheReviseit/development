"""
FlowAuxi Omni-Channel Messaging Module
=======================================

Production-grade, FAANG-level messaging infrastructure supporting:
- Multi-channel (Instagram, WhatsApp, Messenger, future platforms)
- Unified message abstraction (NormalizedMessage)
- Transactional outbox pattern (crash-safe delivery)
- Three-layer idempotency (Redis → DB → state machine)
- Distributed conversation locking (prevents race conditions)
- Adaptive backpressure control (load shedding)
- Per-service circuit breakers (cascade failure prevention)
- Per-tenant AI rate governance (cost + latency control)
- Internal SDK (single entry point for all messaging)

Architecture:
    Webhook → Normalizer → IdempotencyGuard → ConversationLock →
    RuleEngine → FlowEngine → AIBrain → OutboxWriter → 
    Dispatcher → Provider → Platform API

Author: FlowAuxi Engineering
Version: 1.0.0
"""

__version__ = "1.0.0"
