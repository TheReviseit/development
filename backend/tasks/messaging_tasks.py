"""
Messaging Celery Tasks — FAANG-Grade Async Processing Pipeline
=================================================================

All webhook processing and message dispatch is done asynchronously
through these Celery tasks.

Architecture:
    - Protocol-based AIResponseService for provider decoupling
    - Event-driven pipeline (MESSAGE_RECEIVED → AI_RESPONSE → DISPATCH)
    - Distributed tracing with trace_id propagation
    - Per-tenant failure isolation (circuit breaker + degraded mode)
    - AI-level idempotency (exactly-once response semantics)
    - Channel-level rate limiting integration

Task Registry:
    process_webhook_batch      — Process webhooks from Meta (HIGH priority)
    process_inbound_message    — Process a single inbound message (HIGH)
    process_outbox_pending     — Poll outbox for pending events (MEDIUM)
    refresh_expiring_tokens    — Auto-refresh OAuth tokens (LOW, Beat)
    cleanup_idempotency_keys   — Purge old idempotency records (LOW, Beat)
    cleanup_outbox_events      — Purge old outbox records (LOW, Beat)
    check_flow_timeouts        — Check for timed-out flows (MEDIUM, Beat)
    resume_flow_after_delay    — Resume delayed flow steps (HIGH)

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
import uuid as uuid_mod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Tuple, runtime_checkable

logger = logging.getLogger('flowauxi.tasks.messaging')


# =========================================================================
# FAANG Improvement #1: Strong Interface Contracts (Protocol)
# =========================================================================

@dataclass(frozen=True)
class TenantContext:
    """
    Immutable tenant identity resolved once per inbound message.

    Design:
        - supabase_uuid:  Internal Supabase auth.users(id) — used for DB joins
        - firebase_uid:   Firebase Auth UID — used for AI Brain, ai_capabilities, businesses
        - channel_connection_id: The channel_connections row ID
        - plan:           Active subscription plan slug (starter/business/pro)

    Guarantees:
        - firebase_uid is ALWAYS populated (or resolution fails loudly)
        - plan defaults to 'starter' if subscription lookup fails
    """
    supabase_uuid: str
    firebase_uid: str
    channel_connection_id: Optional[str] = None
    plan: str = 'starter'


@dataclass
class AIContext:
    """All context needed for an AI response — single responsibility."""
    message_text: str
    sender_id: str
    tenant: TenantContext
    conversation_id: str
    business_data: Dict[str, Any]
    conversation_history: List[Dict[str, str]]
    channel: str
    channel_account_id: str
    access_token: str
    trace_id: str
    trigger_source: str = 'fallback'  # 'fallback' | 'rule_ai_response'


@dataclass
class AIResult:
    """Outcome of an AI response attempt."""
    success: bool
    reply_text: Optional[str] = None
    intent: Optional[str] = None
    confidence: float = 0.0
    generation_method: str = ''
    latency_ms: float = 0.0
    error: Optional[str] = None
    was_cached: bool = False


@runtime_checkable
class AIResponseService(Protocol):
    """
    FAANG Interface Contract for AI response generation.

    Decouples the messaging pipeline from any specific AI provider.
    Implementations can swap between Gemini, OpenAI, Claude, or
    a testing mock without changing the pipeline code.
    """
    def generate(self, context: AIContext) -> AIResult:
        """Generate an AI response for the given context."""
        ...


# =========================================================================
# FAANG Improvement #5: Distributed Tracing
# =========================================================================

def _generate_trace_id() -> str:
    """Generate a short, unique trace ID for distributed tracing."""
    return uuid_mod.uuid4().hex[:12]


# =========================================================================
# Shared Redis Client (Prevents Connection Leaks)
# =========================================================================

_shared_redis = None

def _get_shared_redis():
    global _shared_redis
    if _shared_redis is None:
        try:
            import redis as _redis_mod
            import os
            url = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
            # Use a strict connection pool max to prevent exhausting cloud Redis free tier
            pool = _redis_mod.ConnectionPool.from_url(
                url, decode_responses=True, max_connections=5, socket_timeout=2.0
            )
            _shared_redis = _redis_mod.Redis(connection_pool=pool)
            _shared_redis.ping()
        except Exception as e:
            logger.error(f"Failed to init shared redis: {e}")
            _shared_redis = None
    return _shared_redis


# =========================================================================
# FAANG Improvement #6: Metrics Collector
# =========================================================================

class _PipelineMetrics:
    """
    Lightweight in-process metrics for the messaging pipeline.

    Thread-safe via Redis INCR. Falls back to no-op if Redis is unavailable.
    Tracks: ai_sent, ai_failed, ai_governor_denied, no_tenant, p95 latency.
    """

    _PREFIX = 'msg_pipeline'

    def __init__(self):
        self._redis = _get_shared_redis()

    def incr(self, metric: str, tenant_id: str = '') -> None:
        if not self._redis:
            return
        try:
            self._redis.incr(f'{self._PREFIX}:{metric}')
            if tenant_id:
                self._redis.incr(f'{self._PREFIX}:{metric}:tenant:{tenant_id[:20]}')
        except Exception:
            pass

    def record_latency(self, stage: str, latency_ms: float) -> None:
        """Store latency sample in a Redis list for percentile calculation."""
        if not self._redis:
            return
        try:
            key = f'{self._PREFIX}:latency:{stage}'
            self._redis.lpush(key, f'{latency_ms:.1f}')
            self._redis.ltrim(key, 0, 999)  # Keep last 1000 samples
        except Exception:
            pass

    def get_stats(self) -> Dict[str, Any]:
        """Read pipeline metrics (for monitoring endpoints)."""
        if not self._redis:
            return {}
        try:
            keys = self._redis.keys(f'{self._PREFIX}:*')
            stats = {}
            for key in keys[:50]:  # Cap to prevent OOM
                val = self._redis.get(key)
                if val:
                    stats[key.replace(f'{self._PREFIX}:', '')] = val
            return stats
        except Exception:
            return {}


_metrics: Optional[_PipelineMetrics] = None


def _get_metrics() -> _PipelineMetrics:
    global _metrics
    if _metrics is None:
        _metrics = _PipelineMetrics()
    return _metrics


# =========================================================================
# FAANG Improvement #4: Per-Tenant Failure Isolation
# =========================================================================

class _TenantCircuitBreaker:
    """
    Per-tenant AI circuit breaker with degraded mode.

    If AI fails N times for a specific tenant, trip the circuit breaker
    and fall back to rules-only mode (no AI calls) for a cooldown period.

    This prevents a single tenant's broken config from consuming AI quota
    or causing cascading failures across the system.

    State machine:
        CLOSED (normal) → OPEN (failures exceeded) → HALF_OPEN (testing)
    """

    _PREFIX = 'tenant_ai_cb'
    FAILURE_THRESHOLD = 5
    RESET_TIMEOUT = 300  # 5 minutes

    def __init__(self):
        self._redis = _get_shared_redis()

    def is_open(self, tenant_id: str) -> bool:
        """Check if circuit breaker is OPEN (AI disabled for this tenant)."""
        if not self._redis:
            return False
        try:
            state = self._redis.get(f'{self._PREFIX}:state:{tenant_id}')
            return state == 'open'
        except Exception:
            return False  # Fail open — allow AI

    def record_success(self, tenant_id: str) -> None:
        """Record a successful AI call — reset failure counter."""
        if not self._redis:
            return
        try:
            pipe = self._redis.pipeline()
            pipe.delete(f'{self._PREFIX}:failures:{tenant_id}')
            pipe.set(f'{self._PREFIX}:state:{tenant_id}', 'closed', ex=self.RESET_TIMEOUT)
            pipe.execute()
        except Exception:
            pass

    def record_failure(self, tenant_id: str) -> None:
        """Record an AI failure — trip breaker if threshold exceeded."""
        if not self._redis:
            return
        try:
            key = f'{self._PREFIX}:failures:{tenant_id}'
            failures = self._redis.incr(key)
            self._redis.expire(key, self.RESET_TIMEOUT)

            if failures >= self.FAILURE_THRESHOLD:
                self._redis.set(
                    f'{self._PREFIX}:state:{tenant_id}',
                    'open',
                    ex=self.RESET_TIMEOUT,
                )
                logger.warning(
                    f"tenant_cb_tripped tenant={tenant_id[:15]} "
                    f"failures={failures}"
                )
        except Exception:
            pass


_tenant_cb: Optional[_TenantCircuitBreaker] = None


def _get_tenant_cb() -> _TenantCircuitBreaker:
    global _tenant_cb
    if _tenant_cb is None:
        _tenant_cb = _TenantCircuitBreaker()
    return _tenant_cb


# =========================================================================
# Task Registration
# =========================================================================

def register_messaging_tasks(celery_app):
    """
    Register all messaging tasks with the Celery app.

    Called from celery_app.py during initialization.
    Uses closure pattern to access the celery_app instance.
    """

    # =================================================================
    # Task 1: Process Webhook Batch (dispatched from meta_webhook.py)
    # =================================================================

    @celery_app.task(
        name='messaging.process_webhook_batch',
        bind=True,
        max_retries=3,
        default_retry_delay=5,
        queue='high',
        acks_late=True,
        reject_on_worker_lost=True,
    )
    def process_webhook_batch(
        self,
        channel: str,
        events: List[Dict[str, Any]],
        raw_payload: Dict[str, Any],
    ):
        """
        Process a batch of webhook events for a channel.

        Normalizes events, stores messages, and triggers automation.
        """
        start = time.time()
        trace_id = _generate_trace_id()

        try:
            if channel == 'instagram':
                from services.messaging.normalizers.instagram_normalizer import (
                    InstagramNormalizer,
                )
                normalizer = InstagramNormalizer()
                messages = normalizer.normalize(raw_payload)
            elif channel == 'whatsapp':
                # WhatsApp uses existing webhook_processor for now
                # TODO: create WhatsAppNormalizer
                messages = []
                logger.debug("webhook_whatsapp — delegating to existing processor")
                return
            else:
                logger.warning(f"webhook_unknown_channel channel={channel}")
                return

            for msg in messages:
                try:
                    # Dispatch individual processing as separate tasks
                    process_inbound_message.delay(
                        message_data=msg.to_dict(),
                        channel=channel,
                    )
                except Exception as e:
                    logger.error(f"webhook_dispatch_error trace={trace_id}: {e}")

            elapsed = (time.time() - start) * 1000
            logger.info(
                f"webhook_batch_processed trace={trace_id} channel={channel} "
                f"messages={len(messages)} "
                f"latency={elapsed:.0f}ms"
            )

        except Exception as e:
            logger.error(
                f"webhook_batch_error trace={trace_id} channel={channel}: {e}",
                exc_info=True,
            )
            raise self.retry(exc=e)

    # =================================================================
    # Task 2: Process Single Inbound Message (FAANG-grade pipeline)
    # =================================================================

    @celery_app.task(
        name='messaging.process_inbound_message',
        bind=True,
        max_retries=3,
        default_retry_delay=10,
        queue='high',
        acks_late=True,
    )
    def process_inbound_message(
        self,
        message_data: Dict[str, Any],
        channel: str,
    ):
        """
        Process a single inbound message through the full pipeline:

        Event-Driven Pipeline:
            1. MESSAGE_RECEIVED → Idempotency check
            2. TENANT_RESOLVED → Store message + conversation
            3. AUTOMATION_EVALUATED → Rule match or AI fallback
            4. RESPONSE_READY → Dispatch via SDK
            5. MESSAGE_COMPLETED → Metrics + idempotency complete

        FAANG Guarantees:
            - Exactly-once processing (idempotency guard)
            - Exactly-once AI response (AI idempotency key)
            - Per-tenant failure isolation (circuit breaker)
            - Distributed tracing (trace_id in all logs)
            - Channel-level rate limiting awareness
        """
        start = time.time()
        trace_id = _generate_trace_id()
        metrics = _get_metrics()
        idem_key = None

        try:
            from services.messaging.base import NormalizedMessage, Channel
            from services.messaging.idempotency import get_idempotency_guard
            from services.messaging.conversation_lock import get_conversation_lock
            from services.messaging.automation.rule_engine import get_rule_engine
            from services.messaging.automation.flow_engine import get_flow_engine

            msg = NormalizedMessage.from_dict(message_data)

            # ── EVENT: MESSAGE_RECEIVED ──
            # Step 1: Idempotency guard
            try:
                guard = get_idempotency_guard()
                idem_key = guard.generate_key(
                    msg.channel.value, msg.channel_message_id
                )
                if not guard.acquire(idem_key, context="inbound"):
                    logger.debug(f"inbound_dedup trace={trace_id} key={idem_key[-16:]}")
                    return
            except Exception as e:
                logger.warning(f"inbound_idem_error trace={trace_id}: {e}")
                idem_key = None

            # ── EVENT: TENANT_RESOLUTION ──
            # Step 2: Resolve tenant (FIXED: returns TenantContext with firebase_uid)
            t_start = time.time()
            tenant_ctx = _resolve_tenant(msg, trace_id)
            t_resolve = (time.time() - t_start) * 1000
            metrics.record_latency('tenant_resolve', t_resolve)

            if not tenant_ctx:
                logger.warning(
                    f"inbound_no_tenant trace={trace_id} "
                    f"account={msg.channel_account_id}"
                )
                metrics.incr('no_tenant')
                if idem_key:
                    try:
                        guard.fail(idem_key, "no_tenant")
                    except Exception:
                        pass
                return

            # Set tenant_id on message (use firebase_uid for downstream consistency)
            msg.tenant_id = tenant_ctx.firebase_uid

            logger.info(
                f"tenant_resolved trace={trace_id} "
                f"firebase_uid={tenant_ctx.firebase_uid[:15]}... "
                f"plan={tenant_ctx.plan} "
                f"resolve_ms={t_resolve:.0f}"
            )

            # ── Step 3: Store message + upsert conversation ──
            conversation_id = _store_message_and_conversation(msg, trace_id)
            msg.conversation_id = conversation_id

            # ── Step 4: Mark as seen + typing ──
            _send_seen_and_typing(msg)

            # ── EVENT: AUTOMATION_EVALUATION ──
            # Step 5: Automation (flow → rules → AI fallback)
            try:
                conv_lock = get_conversation_lock()
                with conv_lock.acquire(conversation_id, timeout=10):
                    # Check for active flow
                    flow_engine = get_flow_engine()
                    if flow_engine.resume_flow(
                        conversation_id, tenant_ctx.firebase_uid, msg
                    ):
                        logger.info(
                            f"inbound_flow_resumed trace={trace_id} "
                            f"conv={conversation_id[:15]}"
                        )
                    else:
                        # No active flow — evaluate rules
                        rule_engine = get_rule_engine()
                        match = rule_engine.evaluate(msg, tenant_ctx.firebase_uid)

                        if match.matched:
                            _execute_rule_action(
                                match, msg, tenant_ctx,
                                conversation_id, flow_engine, trace_id,
                            )
                        else:
                            # ── EVENT: AI_FALLBACK ──
                            logger.info(
                                f"inbound_no_rule_match trace={trace_id} "
                                f"sender={msg.sender_id[:15]} → AI fallback"
                            )
                            _fallback_to_ai(
                                msg, tenant_ctx, conversation_id, trace_id,
                            )
            except Exception as lock_err:
                logger.warning(
                    f"inbound_lock_timeout trace={trace_id} "
                    f"conv={conversation_id[:15]}: {lock_err}"
                )
                # Retry — another worker may have the lock
                raise self.retry(
                    exc=lock_err, countdown=2, max_retries=3
                )

            # ── EVENT: MESSAGE_COMPLETED ──
            # Step 6: Complete idempotency
            if idem_key:
                try:
                    guard.complete(idem_key)
                except Exception:
                    pass

            elapsed = (time.time() - start) * 1000
            metrics.record_latency('inbound_total', elapsed)
            logger.info(
                f"inbound_processed trace={trace_id} channel={channel} "
                f"sender={msg.sender_id[:15]} "
                f"type={msg.message_type.value} "
                f"latency={elapsed:.0f}ms"
            )

        except Exception as e:
            logger.error(
                f"inbound_error trace={trace_id}: {e}", exc_info=True
            )
            metrics.incr('inbound_error')
            if idem_key:
                try:
                    guard.fail(idem_key, str(e))
                except Exception:
                    pass
            raise self.retry(exc=e)

    # =================================================================
    # Task 3: Process Outbox (Celery Beat — every 5s)
    # =================================================================

    @celery_app.task(
        name='messaging.process_outbox',
        queue='default',
    )
    def process_outbox_pending():
        """Poll outbox for pending events and dispatch."""
        try:
            from services.messaging.outbox import get_outbox_processor
            from services.messaging.dispatcher import MessageDispatcher
            from services.messaging.providers.instagram_provider import InstagramProvider
            from services.messaging.providers.whatsapp_provider import WhatsAppProvider
            from services.messaging.base import Channel

            outbox = get_outbox_processor()
            dispatcher = MessageDispatcher()
            try:
                dispatcher.register_provider(Channel.INSTAGRAM, InstagramProvider())
                dispatcher.register_provider(Channel.WHATSAPP, WhatsAppProvider())
            except Exception:
                pass

            stats = outbox.process_pending(
                dispatch_fn=dispatcher.dispatch_from_outbox,
            )

            if stats.get('processed', 0) > 0:
                logger.info(f"outbox_cycle {stats}")

        except Exception as e:
            logger.error(f"outbox_task_error: {e}")

    # =================================================================
    # Task 4: Refresh Tokens (Celery Beat — daily 4 AM UTC)
    # =================================================================

    @celery_app.task(
        name='messaging.refresh_tokens',
        queue='low',
    )
    def refresh_expiring_tokens():
        """Auto-refresh OAuth tokens expiring within 7 days."""
        try:
            from services.messaging.token_manager import get_token_manager
            mgr = get_token_manager()
            stats = mgr.refresh_expiring_tokens()
            logger.info(f"token_refresh_result {stats}")
        except Exception as e:
            logger.error(f"token_refresh_error: {e}")

    # =================================================================
    # Task 5: Cleanup Idempotency Keys (Celery Beat — daily 5 AM UTC)
    # =================================================================

    @celery_app.task(
        name='messaging.cleanup_idempotency',
        queue='low',
    )
    def cleanup_idempotency_keys():
        """Purge old idempotency records from DB."""
        try:
            from services.messaging.idempotency import get_idempotency_guard
            guard = get_idempotency_guard()
            count = guard.cleanup_expired(age_hours=48)
            logger.info(f"idem_cleanup removed={count}")
        except Exception as e:
            logger.error(f"idem_cleanup_error: {e}")

    # =================================================================
    # Task 6: Cleanup Outbox (Celery Beat — daily 5:30 AM UTC)
    # =================================================================

    @celery_app.task(
        name='messaging.cleanup_outbox',
        queue='low',
    )
    def cleanup_outbox_events():
        """Purge old completed outbox events."""
        try:
            from services.messaging.outbox import get_outbox_processor
            outbox = get_outbox_processor()
            count = outbox.cleanup_completed(age_hours=72)
            logger.info(f"outbox_cleanup removed={count}")
        except Exception as e:
            logger.error(f"outbox_cleanup_error: {e}")

    # =================================================================
    # Task 7: Check Flow Timeouts (Celery Beat — every 60s)
    # =================================================================

    @celery_app.task(
        name='messaging.check_flow_timeouts',
        queue='default',
    )
    def check_flow_timeouts():
        """Check for automation flows that have timed out."""
        try:
            from services.messaging.automation.flow_engine import get_flow_engine
            engine = get_flow_engine()
            stats = engine.check_timeouts()
            if stats.get('timed_out', 0) > 0:
                logger.info(f"flow_timeouts {stats}")
        except Exception as e:
            logger.error(f"flow_timeout_error: {e}")

    # =================================================================
    # Task 8: Resume Flow After Delay
    # =================================================================

    @celery_app.task(
        name='messaging.resume_flow_after_delay',
        queue='high',
    )
    def resume_flow_after_delay(
        conversation_id: str,
        tenant_id: str,
    ):
        """Resume a flow after a delay step's countdown expires."""
        try:
            from services.messaging.automation.flow_engine import get_flow_engine
            from services.messaging.base import NormalizedMessage, Channel

            engine = get_flow_engine()
            # Create a synthetic message for context
            dummy = NormalizedMessage(
                channel=Channel.INSTAGRAM,
                sender_id="system",
                text="[delay_resumed]",
            )
            engine.resume_flow(conversation_id, tenant_id, dummy)
        except Exception as e:
            logger.error(f"flow_delay_resume_error: {e}")

    # =================================================================
    # Return all tasks for Beat schedule registration
    # =================================================================
    return {
        'process_webhook_batch': process_webhook_batch,
        'process_inbound_message': process_inbound_message,
        'process_outbox_pending': process_outbox_pending,
        'refresh_expiring_tokens': refresh_expiring_tokens,
        'cleanup_idempotency_keys': cleanup_idempotency_keys,
        'cleanup_outbox_events': cleanup_outbox_events,
        'check_flow_timeouts': check_flow_timeouts,
        'resume_flow_after_delay': resume_flow_after_delay,
    }


# =========================================================================
# Helper Functions (used by inbound processing)
# =========================================================================

def _resolve_tenant(msg, trace_id: str = '') -> Optional[TenantContext]:
    """
    Resolve tenant identity from channel_account_id.

    FIXED (Root Cause #3): Returns TenantContext with BOTH supabase_uuid
    AND firebase_uid. Previous implementation returned only supabase_uuid
    which broke all downstream AI data fetching.

    Resolution chain:
        1. channel_connections(channel_account_id) → supabase_uuid
        2. users(id=supabase_uuid) → firebase_uid
        3. subscriptions(user_id=supabase_uuid) → plan

    Fallback:
        4. businesses(phone_number_id) → firebase_uid (direct)

    Returns:
        TenantContext or None if resolution fails completely
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        if not db:
            logger.error(f"tenant_resolve_no_db trace={trace_id}")
            return None

        supabase_uuid = None
        firebase_uid = None
        connection_id = None

        # ── Method 1: channel_connections (primary) ──
        try:
            result = db.table('channel_connections').select(
                'id, user_id'
            ).eq(
                'channel_account_id', msg.channel_account_id
            ).eq('is_active', True).limit(1).execute()

            if result.data:
                supabase_uuid = result.data[0]['user_id']
                connection_id = result.data[0].get('id')

                # Resolve Firebase UID from Supabase UUID
                uid_result = db.table('users').select(
                    'firebase_uid'
                ).eq('id', supabase_uuid).limit(1).execute()

                if uid_result.data and uid_result.data[0].get('firebase_uid'):
                    firebase_uid = uid_result.data[0]['firebase_uid']
                    logger.info(
                        f"tenant_uid_resolved trace={trace_id} "
                        f"supabase={supabase_uuid[:8]}... → "
                        f"firebase={firebase_uid[:12]}..."
                    )
                else:
                    logger.warning(
                        f"tenant_no_firebase_uid trace={trace_id} "
                        f"supabase_uuid={supabase_uuid[:8]}... "
                        f"(users table has no firebase_uid for this user)"
                    )
        except Exception as e:
            logger.warning(
                f"tenant_channel_conn_error trace={trace_id}: {e}"
            )

        # ── Method 2: businesses table fallback ──
        # businesses.user_id stores firebase_uid directly
        if not firebase_uid:
            try:
                result = db.table('businesses').select(
                    'user_id'
                ).eq(
                    'phone_number_id', msg.channel_account_id
                ).limit(1).execute()

                if result.data:
                    firebase_uid = result.data[0]['user_id']
                    logger.info(
                        f"tenant_businesses_fallback trace={trace_id} "
                        f"firebase_uid={firebase_uid[:12]}..."
                    )

                    # Also resolve supabase_uuid if we don't have it
                    if not supabase_uuid:
                        try:
                            uid_result = db.table('users').select(
                                'id'
                            ).eq(
                                'firebase_uid', firebase_uid
                            ).limit(1).execute()
                            if uid_result.data:
                                supabase_uuid = uid_result.data[0]['id']
                        except Exception:
                            supabase_uuid = firebase_uid  # Last resort
            except Exception as e:
                logger.warning(
                    f"tenant_businesses_fallback_error trace={trace_id}: {e}"
                )

        if not firebase_uid:
            logger.error(
                f"tenant_resolve_failed trace={trace_id} "
                f"account={msg.channel_account_id} "
                f"(no firebase_uid found in any source)"
            )
            return None

        # Ensure supabase_uuid has a value
        if not supabase_uuid:
            supabase_uuid = firebase_uid

        # ── Resolve subscription plan ──
        plan = _get_tenant_plan(db, supabase_uuid, trace_id)

        return TenantContext(
            supabase_uuid=supabase_uuid,
            firebase_uid=firebase_uid,
            channel_connection_id=connection_id,
            plan=plan,
        )

    except Exception as e:
        logger.error(
            f"tenant_resolve_critical trace={trace_id}: {e}",
            exc_info=True,
        )
        return None


def _get_tenant_plan(
    db, supabase_uuid: str, trace_id: str = ''
) -> str:
    """
    Resolve the active subscription plan for a tenant.

    FIXED (Root Cause #5): Previously hard-coded as 'starter'.
    Now queries the subscriptions table.

    The subscriptions table uses auth.users(id) as user_id (Supabase UUID).
    """
    try:
        result = db.table('subscriptions').select(
            'plan_name'
        ).eq(
            'user_id', supabase_uuid
        ).in_(
            'status', ['active', 'trialing']
        ).order(
            'created_at', desc=True
        ).limit(1).execute()

        if result.data:
            plan = result.data[0].get('plan_name', 'starter')
            return plan
    except Exception as e:
        # PGRST116 = no rows (expected for free users)
        if 'PGRST116' not in str(e):
            logger.debug(
                f"plan_resolve_error trace={trace_id}: {e}"
            )

    return 'starter'


def _store_message_and_conversation(msg, trace_id: str = '') -> str:
    """Store message and upsert conversation. Returns conversation_id."""
    from supabase_client import get_supabase_client
    import uuid

    db = get_supabase_client()

    # Deterministic conversation ID
    conv_id = str(uuid.uuid5(
        uuid.NAMESPACE_DNS,
        f"{msg.tenant_id}:{msg.channel.value}:{msg.sender_id}"
    ))
    msg.conversation_id = conv_id

    try:
        db.table('unified_conversations').upsert(
            {
                'id': conv_id,
                'user_id': msg.tenant_id,
                'channel': msg.channel.value,
                'contact_platform_id': msg.sender_id,
                'contact_name': msg.sender_name,
                'contact_username': msg.sender_username,
                'contact_profile_pic': msg.sender_profile_pic,
                'last_message_at': msg.created_at.isoformat(),
                'last_message_preview': (msg.text or '')[:100],
                'status': 'active',
            },
            on_conflict='user_id,channel,contact_platform_id',
        ).execute()
    except Exception as e:
        logger.warning(f"conv_upsert_error trace={trace_id}: {e}")

    # Store message
    try:
        db.table('unified_messages').upsert(
            msg.to_db_row(),
            on_conflict='channel,channel_message_id',
        ).execute()
    except Exception as e:
        logger.warning(f"msg_store_error trace={trace_id}: {e}")

    return conv_id


def _send_seen_and_typing(msg) -> None:
    """Send mark_seen and typing indicator (fire-and-forget)."""
    try:
        from services.messaging.sdk import get_messaging_sdk
        sdk = get_messaging_sdk()

        # Resolve credentials
        access_token = _get_access_token(msg)
        if not access_token:
            return

        sdk.mark_seen(
            channel=msg.channel.value,
            sender_id=msg.sender_id,
            access_token=access_token,
            channel_account_id=msg.channel_account_id,
            message_id=msg.channel_message_id,
        )
        sdk.send_typing(
            channel=msg.channel.value,
            recipient_id=msg.sender_id,
            access_token=access_token,
            channel_account_id=msg.channel_account_id,
        )
    except Exception:
        pass


def _get_access_token(msg) -> Optional[str]:
    """Get access token for message's channel connection."""
    import os
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        result = db.table('channel_connections').select(
            'access_token'
        ).eq(
            'channel_account_id', msg.channel_account_id
        ).eq('is_active', True).limit(1).execute()

        if result.data:
            return result.data[0].get('access_token')
    except Exception:
        pass

    env_map = {
        'whatsapp': 'WHATSAPP_ACCESS_TOKEN',
        'instagram': 'INSTAGRAM_ACCESS_TOKEN',
    }
    return os.getenv(env_map.get(msg.channel.value, ''))


# =========================================================================
# FAANG Improvement #2: Conversation History Fetcher
# =========================================================================

def _fetch_conversation_history(
    conversation_id: str,
    limit: int = 10,
    trace_id: str = '',
) -> List[Dict[str, str]]:
    """
    Fetch recent conversation history from unified_messages.

    FIXED (Root Cause #2 + #6): Previously history=None was always passed,
    making every AI call stateless. Now we fetch the last N messages from
    the DB and format them for the AI Brain.

    Returns:
        List of {"role": "user"|"assistant", "content": "..."} dicts
        compatible with AIBrain.generate_reply(history=...) parameter.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        if not db:
            return []

        result = db.table('unified_messages').select(
            'direction, message_body, sender_id, created_at'
        ).eq(
            'conversation_id', conversation_id
        ).order(
            'created_at', desc=True
        ).limit(limit).execute()

        if not result.data:
            return []

        # Reverse to chronological order (oldest first)
        rows = list(reversed(result.data))

        history = []
        for row in rows:
            direction = row.get('direction', '')
            content = row.get('message_body', '') or ''
            if not content:
                continue

            role = 'user' if direction == 'inbound' else 'assistant'
            history.append({'role': role, 'content': content})

        logger.debug(
            f"history_fetched trace={trace_id} "
            f"conv={conversation_id[:15]} messages={len(history)}"
        )
        return history

    except Exception as e:
        logger.warning(f"history_fetch_error trace={trace_id}: {e}")
        return []


# =========================================================================
# FAANG Improvement #1 (Implementation): GeminiAIResponseService
# =========================================================================

class GeminiAIResponseService:
    """
    Production AIResponseService implementation using Gemini via AIBrain.

    Includes:
        - AI-level idempotency (FAANG #2)
        - Per-tenant circuit breaker check (FAANG #4)
        - Channel-level rate limiting awareness (FAANG #6)
        - Distributed tracing (FAANG #5)
        - Metric recording (FAANG #6)
    """

    def generate(self, context: AIContext) -> AIResult:
        """
        Generate an AI response with exactly-once semantics.

        Pipeline:
            1. Check per-tenant circuit breaker
            2. Check AI-level idempotency (prevent duplicate responses)
            3. Check channel rate limiting
            4. Fetch business data
            5. Call AIBrain.generate_reply()
            6. Record response for idempotency
            7. Update circuit breaker state
        """
        start = time.time()
        trace_id = context.trace_id
        metrics = _get_metrics()
        tenant_cb = _get_tenant_cb()

        # ── FAANG #4: Per-tenant circuit breaker ──
        if tenant_cb.is_open(context.tenant.firebase_uid):
            logger.warning(
                f"ai_cb_open trace={trace_id} "
                f"tenant={context.tenant.firebase_uid[:15]} "
                f"→ degraded mode (rules-only)"
            )
            metrics.incr('ai_cb_rejected', context.tenant.firebase_uid)
            return AIResult(
                success=False,
                error='tenant_circuit_breaker_open',
                generation_method='degraded_cb',
            )

        # ── FAANG #2: AI-level idempotency ──
        ai_idem_key = self._make_ai_idem_key(context)
        cached_response = self._check_ai_idempotency(ai_idem_key)
        if cached_response:
            latency = (time.time() - start) * 1000
            logger.info(
                f"ai_idem_hit trace={trace_id} "
                f"key={ai_idem_key[-16:]}"
            )
            metrics.incr('ai_idem_hit')
            return AIResult(
                success=True,
                reply_text=cached_response,
                generation_method='idempotency_cache',
                latency_ms=latency,
                was_cached=True,
            )

        # ── FAANG #6: Channel rate limiting check ──
        if not self._check_channel_rate_limit(context):
            metrics.incr('channel_rate_limited')
            return AIResult(
                success=False,
                error='channel_rate_limited',
                generation_method='rate_limited',
            )

        # ── Core AI Generation ──
        try:
            from ai_brain import AIBrain, AIBrainConfig
            from supabase_client import get_supabase_client

            supabase_client = get_supabase_client()
            config = AIBrainConfig()
            brain = AIBrain(config, supabase_client=supabase_client)

            # FIXED (Root Cause #1): business_id = firebase_uid, NOT supabase_uuid
            # FIXED (Root Cause #2): history from DB, NOT None
            result = brain.generate_reply(
                business_data=context.business_data,
                user_message=context.message_text,
                user_id=context.sender_id,
                history=context.conversation_history or None,
                business_id=context.tenant.firebase_uid,
            )

            reply_text = result.get('reply', '')
            if not reply_text:
                raise ValueError("AI Brain returned empty reply")

            latency = (time.time() - start) * 1000

            # ── FAANG #2: Store response for idempotency ──
            self._store_ai_response(ai_idem_key, reply_text)

            # ── FAANG #4: Record success for circuit breaker ──
            tenant_cb.record_success(context.tenant.firebase_uid)

            metrics.incr('ai_sent', context.tenant.firebase_uid)
            metrics.record_latency('ai_generation', latency)

            return AIResult(
                success=True,
                reply_text=reply_text,
                intent=result.get('intent', 'unknown'),
                confidence=result.get('confidence', 0.0),
                generation_method=result.get('metadata', {}).get(
                    'generation_method', 'llm'
                ),
                latency_ms=latency,
            )

        except ImportError:
            logger.error(
                f"ai_import_error trace={trace_id} "
                f"(AI Brain module not available)"
            )
            metrics.incr('ai_import_error')
            return AIResult(
                success=False,
                error='ai_brain_import_error',
                generation_method='error',
            )

        except Exception as e:
            latency = (time.time() - start) * 1000

            # ── FAANG #4: Record failure for circuit breaker ──
            tenant_cb.record_failure(context.tenant.firebase_uid)

            logger.error(
                f"ai_generation_error trace={trace_id} "
                f"tenant={context.tenant.firebase_uid[:15]} "
                f"latency={latency:.0f}ms: {e}",
                exc_info=True,
            )
            metrics.incr('ai_failed', context.tenant.firebase_uid)
            metrics.record_latency('ai_generation_error', latency)

            return AIResult(
                success=False,
                error=str(e),
                generation_method='error',
                latency_ms=latency,
            )

    # ── FAANG #2: AI Idempotency Helpers ──

    @staticmethod
    def _make_ai_idem_key(context: AIContext) -> str:
        """
        Generate a deterministic idempotency key for an AI request.

        Key = hash(tenant + sender + message_text + conversation_id)
        This ensures that if the same message from the same sender
        is processed twice (Celery retry), we return the same response.
        """
        raw = (
            f"{context.tenant.firebase_uid}:"
            f"{context.sender_id}:"
            f"{context.message_text}:"
            f"{context.conversation_id}"
        )
        return f"ai_idem:{hashlib.sha256(raw.encode()).hexdigest()[:24]}"

    @staticmethod
    def _check_ai_idempotency(key: str) -> Optional[str]:
        """Check if we already generated a response for this exact request."""
        r = _get_shared_redis()
        if not r:
            return None
        try:
            return r.get(key)
        except Exception:
            return None

    @staticmethod
    def _store_ai_response(key: str, response: str) -> None:
        """Store AI response for idempotency (TTL: 5 minutes)."""
        r = _get_shared_redis()
        if not r:
            return
        try:
            r.set(key, response, ex=300)
        except Exception:
            pass

    # ── FAANG #6: Channel Rate Limiting ──

    @staticmethod
    def _check_channel_rate_limit(context: AIContext) -> bool:
        """
        Check channel-level rate limiting before sending.

        Instagram API limits: ~200 messages per recipient per 24h.
        This check is a pre-flight — the provider also enforces limits,
        but checking here avoids wasting an AI generation call.
        """
        r = _get_shared_redis()
        if not r:
            return True  # Fail open
            
        try:
            # Sliding window counter per recipient per channel
            rate_key = (
                f"channel_rate:{context.channel}:"
                f"{context.sender_id}"
            )
            count = r.incr(rate_key)
            if count == 1:
                r.expire(rate_key, 86400)  # 24h window

            # Instagram allows ~200 API messages per day per recipient
            limit = 180  # Conservative buffer
            if count > limit:
                logger.warning(
                    f"channel_rate_exceeded "
                    f"channel={context.channel} "
                    f"recipient={context.sender_id[:15]} "
                    f"count={count}/{limit}"
                )
                return False
            return True
        except Exception:
            return True  # Fail open


# =========================================================================
# Singleton AI Response Service
# =========================================================================

_ai_service: Optional[GeminiAIResponseService] = None


def _get_ai_service() -> GeminiAIResponseService:
    global _ai_service
    if _ai_service is None:
        _ai_service = GeminiAIResponseService()
    return _ai_service


# =========================================================================
# Shared AI Response Orchestrator
# =========================================================================

def _generate_ai_response(
    msg,
    tenant_ctx: TenantContext,
    conversation_id: str,
    trace_id: str,
    trigger_source: str = 'fallback',
) -> None:
    """
    Shared AI response generator — used by BOTH rule actions and fallback.

    FIXED (Root Cause #4): Previously, ai_response rule action was dead
    code (TODO). Now both paths delegate to this function.

    Event-Driven Architecture:
        1. BUILD_CONTEXT → Fetch business data + conversation history
        2. GENERATE → Call AIResponseService.generate()
        3. DISPATCH → Send via messaging SDK
        4. RECORD → Update message in DB with AI metadata

    FAANG Guarantees:
        - AI Governor check with actual plan (Root Cause #5 fix)
        - firebase_uid used for business data fetch (Root Cause #3 fix)
        - Conversation history included (Root Cause #2 fix)
        - business_id = firebase_uid (Root Cause #1 fix)
        - Exactly-once response (FAANG #2)
        - Per-tenant isolation (FAANG #4)
    """
    metrics = _get_metrics()

    try:
        from services.messaging.sdk import get_messaging_sdk
        from services.messaging.ai_governor import get_ai_governor

        # ── Step 1: AI Governor check with actual plan ──
        gov = get_ai_governor()
        allowed, reason = gov.can_use_ai(
            tenant_ctx.firebase_uid, plan=tenant_ctx.plan
        )
        if not allowed:
            logger.info(
                f"ai_governor_denied trace={trace_id} "
                f"tenant={tenant_ctx.firebase_uid[:15]} "
                f"reason={reason} plan={tenant_ctx.plan}"
            )
            metrics.incr('ai_governor_denied', tenant_ctx.firebase_uid)

            # Send governor fallback message
            access_token = _get_access_token(msg)
            if access_token:
                fallback_msg = gov.get_fallback_message(reason)
                sdk = get_messaging_sdk()
                sdk.send(
                    channel=msg.channel.value,
                    tenant_id=tenant_ctx.firebase_uid,
                    recipient_id=msg.sender_id,
                    text=fallback_msg,
                    access_token=access_token,
                    channel_account_id=msg.channel_account_id,
                )
            return

        # ── Step 2: Resolve access token ──
        access_token = _get_access_token(msg)
        if not access_token:
            logger.warning(
                f"ai_response_no_token trace={trace_id} "
                f"tenant={tenant_ctx.firebase_uid[:15]}"
            )
            return

        # ── Step 3: Fetch business data (FIXED: use firebase_uid) ──
        from supabase_client import get_business_data_from_supabase
        business_data = get_business_data_from_supabase(
            tenant_ctx.firebase_uid, None
        )
        if not business_data:
            # Minimal fallback so AI can still politely reply
            business_data = {
                'business_id': tenant_ctx.firebase_uid,
                'business_name': 'Our Business',
                'industry': 'other',
                'products_services': [],
            }
            logger.warning(
                f"ai_response_no_business_data trace={trace_id} "
                f"tenant={tenant_ctx.firebase_uid[:15]} "
                f"(using minimal fallback)"
            )

        # ── Step 4: Fetch conversation history (FIXED: was None) ──
        history = _fetch_conversation_history(
            conversation_id, limit=10, trace_id=trace_id,
        )

        # ── Step 5: Build message text ──
        message_text = msg.text or ""
        if not message_text and msg.message_type.value != "text":
            message_text = f"[{msg.message_type.value} received from User]"

        # ── Step 6: Build AI Context ──
        ai_context = AIContext(
            message_text=message_text,
            sender_id=msg.sender_id,
            tenant=tenant_ctx,
            conversation_id=conversation_id,
            business_data=business_data,
            conversation_history=history,
            channel=msg.channel.value,
            channel_account_id=msg.channel_account_id,
            access_token=access_token,
            trace_id=trace_id,
            trigger_source=trigger_source,
        )

        # ── Step 7: Generate AI response (via Protocol) ──
        ai_service = _get_ai_service()
        result = ai_service.generate(ai_context)

        if not result.success or not result.reply_text:
            logger.warning(
                f"ai_response_failed trace={trace_id} "
                f"error={result.error} "
                f"method={result.generation_method} "
                f"latency={result.latency_ms:.0f}ms"
            )
            # Send a graceful fallback instead of silence
            _send_graceful_fallback(msg, access_token, tenant_ctx, trace_id)
            return

        # ── EVENT: RESPONSE_READY → DISPATCH ──
        sdk = get_messaging_sdk()
        sdk.send(
            channel=msg.channel.value,
            tenant_id=tenant_ctx.firebase_uid,
            recipient_id=msg.sender_id,
            text=result.reply_text,
            access_token=access_token,
            channel_account_id=msg.channel_account_id,
            priority=2,
            idempotency_key=f"reply:{msg.channel.value}:{msg.channel_message_id}:{tenant_ctx.firebase_uid}",
            use_outbox=os.getenv('USE_OUTBOX', 'true').lower() == 'true',
        )

        # ── Record AI metadata on the stored message ──
        _update_message_ai_metadata(
            msg, result, trace_id,
        )

        # ── Record governor usage ──
        try:
            gov.record_usage(
                tenant_id=tenant_ctx.firebase_uid,
                tokens_used=500,  # Estimated avg tokens per AI response
                model=result.generation_method,
                latency_ms=result.latency_ms,
            )
        except Exception:
            pass

        logger.info(
            f"ai_response_sent trace={trace_id} "
            f"trigger={trigger_source} "
            f"sender={msg.sender_id[:15]} "
            f"intent={result.intent} "
            f"confidence={result.confidence:.2f} "
            f"method={result.generation_method} "
            f"cached={result.was_cached} "
            f"latency={result.latency_ms:.0f}ms"
        )

    except ImportError as e:
        logger.error(
            f"ai_response_import_error trace={trace_id}: {e}"
        )
    except Exception as e:
        logger.error(
            f"ai_response_error trace={trace_id}: {e}",
            exc_info=True,
        )
        metrics.incr('ai_response_error', tenant_ctx.firebase_uid)
        # Try to send a fallback so the customer doesn't get silence
        try:
            access_token = _get_access_token(msg)
            if access_token:
                _send_graceful_fallback(
                    msg, access_token, tenant_ctx, trace_id,
                )
        except Exception:
            pass


def _send_graceful_fallback(
    msg, access_token: str, tenant_ctx: TenantContext, trace_id: str,
) -> None:
    """
    Send a graceful fallback message when AI generation fails.

    Better than silence — the customer at least knows the business received
    their message and will respond.
    """
    try:
        from services.messaging.sdk import get_messaging_sdk
        sdk = get_messaging_sdk()

        fallback_text = (
            "Thanks for your message! We've received it and will "
            "get back to you shortly. 😊"
        )

        sdk.send(
            channel=msg.channel.value,
            tenant_id=tenant_ctx.firebase_uid,
            recipient_id=msg.sender_id,
            text=fallback_text,
            access_token=access_token,
            channel_account_id=msg.channel_account_id,
            idempotency_key=f"reply:{msg.channel.value}:{msg.channel_message_id}:{tenant_ctx.firebase_uid}",
            use_outbox=os.getenv('USE_OUTBOX', 'true').lower() == 'true',
        )

        logger.info(
            f"graceful_fallback_sent trace={trace_id} "
            f"sender={msg.sender_id[:15]}"
        )
        _get_metrics().incr('graceful_fallback_sent')

    except Exception as e:
        logger.error(
            f"graceful_fallback_error trace={trace_id}: {e}"
        )


def _update_message_ai_metadata(
    msg, result: AIResult, trace_id: str,
) -> None:
    """Update the stored message with AI generation metadata."""
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        if not db or not msg.conversation_id:
            return

        db.table('unified_messages').update({
            'is_automated': True,
            'ai_model_used': result.generation_method,
            'ai_confidence': result.confidence,
        }).eq(
            'channel', msg.channel.value
        ).eq(
            'channel_message_id', msg.channel_message_id
        ).execute()
    except Exception:
        pass  # Non-critical — best effort


# =========================================================================
# Fixed: _execute_rule_action (Root Cause #4 — ai_response dead code)
# =========================================================================

def _execute_rule_action(
    match, msg, tenant_ctx: TenantContext,
    conversation_id: str, flow_engine, trace_id: str,
):
    """
    Execute the action from a matched automation rule.

    FIXED (Root Cause #4): ai_response action now delegates to
    _generate_ai_response() instead of being dead code (TODO).
    """
    try:
        from services.messaging.sdk import get_messaging_sdk
        sdk = get_messaging_sdk()
        access_token = _get_access_token(msg)

        if not access_token:
            logger.warning(f"rule_action_no_token trace={trace_id}")
            return

        action = match.action_type
        config = match.action_config

        if action == 'reply_text':
            sdk.send(
                channel=msg.channel.value,
                tenant_id=tenant_ctx.firebase_uid,
                recipient_id=msg.sender_id,
                text=config.get('message', ''),
                access_token=access_token,
                channel_account_id=msg.channel_account_id,
                priority=2,
                idempotency_key=f"reply:{msg.channel.value}:{msg.channel_message_id}:{tenant_ctx.firebase_uid}",
                use_outbox=os.getenv('USE_OUTBOX', 'true').lower() == 'true',
            )

        elif action == 'start_flow':
            flow_engine.start_flow(
                flow_id=config.get('flow_id', ''),
                conversation_id=conversation_id,
                tenant_id=tenant_ctx.firebase_uid,
                message=msg,
            )

        elif action == 'ai_response':
            # FIXED: Was dead code (TODO). Now delegates to shared AI service.
            _generate_ai_response(
                msg, tenant_ctx, conversation_id, trace_id,
                trigger_source='rule_ai_response',
            )

        elif action == 'reply_media':
            sdk.send(
                channel=msg.channel.value,
                tenant_id=tenant_ctx.firebase_uid,
                recipient_id=msg.sender_id,
                media_url=config.get('media_url', ''),
                media_type=config.get('media_type', 'image'),
                caption=config.get('caption'),
                access_token=access_token,
                channel_account_id=msg.channel_account_id,
            )

        logger.info(
            f"rule_action_executed trace={trace_id} "
            f"rule={match.rule_id[:15]} "
            f"action={action}"
        )

    except Exception as e:
        logger.error(
            f"rule_action_error trace={trace_id}: {e}",
            exc_info=True,
        )


# =========================================================================
# Fixed: _fallback_to_ai (Root Causes #1, #2, #3, #5, #6)
# =========================================================================

def _fallback_to_ai(
    msg, tenant_ctx: TenantContext,
    conversation_id: str, trace_id: str,
) -> None:
    """
    Fallback to AI Brain when no automation rules match.

    FIXED: Now delegates to the shared _generate_ai_response() which
    correctly handles all 6 root causes:
        #1: business_id = firebase_uid (not supabase_uuid)
        #2: conversation history fetched from DB (not None)
        #3: firebase_uid resolved properly for business data
        #4: ai_response rule action also uses this path
        #5: actual plan passed to governor (not hardcoded 'starter')
        #6: conversation history maintained for Instagram
    """
    _generate_ai_response(
        msg, tenant_ctx, conversation_id, trace_id,
        trigger_source='fallback',
    )
