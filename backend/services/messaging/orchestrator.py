"""
Message Orchestrator — FAANG-Grade Thin Coordinator
===================================================

THIN coordinator that orchestrates the message processing pipeline.

CRITICAL DESIGN PRINCIPLE:
    - This is a COORDINATOR, not an implementation
    - Delegates to pipeline stages (which use existing components)
    - Does NOT do the work itself
    
Pipeline:
    1. TenantResolverStage  → resolves tenant + plan
    2. BusinessLoaderStage  → loads business data + credentials
    3. ContextBuilderStage  → builds AI context + fetches history
    4. AIBrainStage         → generates response (uses existing ai_brain)
    5. OutboxWriterStage   → writes to DB (NOT direct send)

Key Fixes:
    1. AI → Outbox bridge (was implicit, now explicit)
    2. Business data loads with credentials (was None)
    3. Conversation history fetched (was None)
    4. Backpressure at ingress (not connected)

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger('flowauxi.messaging.orchestrator')

# =============================================================================
# Feature Flag for Rollback Safety
# =============================================================================

USE_NEW_PIPELINE = os.getenv('USE_NEW_PIPELINE', 'true').lower() == 'true'

logger.info(f"🎚️ USE_NEW_PIPELINE = {USE_NEW_PIPELINE}")


def _generate_trace_id() -> str:
    """Generate a short, unique trace ID for distributed tracing."""
    return uuid.uuid4().hex[:12]


@dataclass
class OrchestratorResult:
    """
    Result of orchestrator processing.
    
    Attributes:
        success: Whether processing succeeded
        trace_id: Distributed tracing ID
        tenant_id: Firebase UID
        outbox_event_id: ID of created outbox event (if AI response)
        conversation_id: Conversation ID
        latency_ms: Total processing latency
        error: Error message if failed
        stages_completed: List of completed stage names
    """
    success: bool
    trace_id: str
    tenant_id: Optional[str] = None
    outbox_event_id: Optional[str] = None
    conversation_id: Optional[str] = None
    latency_ms: float = 0.0
    error: Optional[str] = None
    stages_completed: List[str] = None
    
    def __post_init__(self):
        if self.stages_completed is None:
            self.stages_completed = []


class MessageOrchestrator:
    """
    FAANG-Grade Message Orchestrator — Thin Coordinator.
    
    THIN design principle:
        - Orchestrates pipeline stages
        - Does NOT implement business logic
        - Uses existing components via stages
        
    Usage:
        orchestrator = MessageOrchestrator()
        
        result = orchestrator.process_inbound(
            message=normalized_message,
            channel="instagram",
        )
        
        print(f"Trace: {result.trace_id}, Event: {result.outbox_event_id}")
    
    Migration Path:
        1. Create orchestrator (this file) — doesn't affect existing code
        2. Add backpressure to webhook ingress
        3. Route Instagram through orchestrator (keep old path as fallback)
        4. Route WhatsApp through orchestrator
        5. After confidence, switch to orchestrator-only
    """
    
    def __init__(self):
        """Initialize orchestrator with pipeline stages."""
        # Lazy-load stages
        self._tenant_resolver = None
        self._business_loader = None
        self._context_builder = None
        self._ai_brain = None
        self._outbox_writer = None
        
        # Metrics
        self._total_processed = 0
        self._total_failed = 0
        
        logger.info("🎯 MessageOrchestrator initialized (FAANG-grade)")
    
    # =========================================================================
    # Stage Accessors (lazy-loaded)
    # =========================================================================
    
    @property
    def tenant_resolver(self):
        if self._tenant_resolver is None:
            from .pipeline import get_tenant_resolver_stage
            self._tenant_resolver = get_tenant_resolver_stage()
        return self._tenant_resolver
    
    @property
    def business_loader(self):
        if self._business_loader is None:
            from .pipeline import get_business_loader_stage
            self._business_loader = get_business_loader_stage()
        return self._business_loader
    
    @property
    def context_builder(self):
        if self._context_builder is None:
            from .pipeline import get_context_builder_stage
            self._context_builder = get_context_builder_stage()
        return self._context_builder
    
    @property
    def ai_brain(self):
        if self._ai_brain is None:
            self._ai_brain = _AIBrainWrapper()
        return self._ai_brain
    
    @property
    def outbox_writer(self):
        if self._outbox_writer is None:
            from .pipeline import get_outbox_writer_stage
            self._outbox_writer = get_outbox_writer_stage()
        return self._outbox_writer
    
    # =========================================================================
    # Main Entry Point
    # =========================================================================
    
    def process_inbound(
        self,
        message,  # NormalizedMessage
        channel: str,
    ) -> OrchestratorResult:
        """
        Process inbound message through full pipeline.
        
        Pipeline stages (THIN coordination):
            1. TenantResolverStage  → resolve tenant + plan
            2. BusinessLoaderStage  → load business + credentials
            3. ContextBuilderStage  → build AI context
            4. AIBrainStage         → generate response
            5. OutboxWriterStage   → write to outbox
            
        Args:
            message: NormalizedMessage from webhook normalizer
            channel: Channel name ('instagram', 'whatsapp')
            
        Returns:
            OrchestratorResult with trace_id and processing details
        """
        start_time = time.time()
        trace_id = _generate_trace_id()
        stages_completed = []
        
        try:
            logger.info(
                f"orchestrator_start trace={trace_id} "
                f"channel={channel} "
                f"sender={message.sender_id[:15] if message.sender_id else 'unknown'}..."
            )
            
            # ── Stage 1: Tenant Resolution ──
            logger.info(f"[{trace_id}] Stage 1: Tenant resolution started")
            tenant = self.tenant_resolver.resolve(
                channel_account_id=message.channel_account_id,
                trace_id=trace_id,
            )
            
            if not tenant:
                logger.warning(
                    f"[{trace_id}] Stage 1 FAILED: Tenant resolution failed "
                    f"account={message.channel_account_id}"
                )
                return OrchestratorResult(
                    success=False,
                    trace_id=trace_id,
                    error='Tenant resolution failed',
                    stages_completed=[],
                )
            
            logger.info(
                f"[{trace_id}] Stage 1 COMPLETE: Tenant resolved "
                f"firebase_uid={tenant.firebase_uid[:15]}... plan={tenant.plan}"
            )
            stages_completed.append('tenant_resolver')
            
            # ── Stage 2: Business Data Loading ──
            logger.info(f"[{trace_id}] Stage 2: Business data loading started")
            business_ctx = self.business_loader.load(
                tenant=tenant,
                channel=channel,
                channel_account_id=message.channel_account_id,
                trace_id=trace_id,
            )
            
            if not business_ctx:
                logger.warning(
                    f"[{trace_id}] Stage 2 WARNING: No business data, using fallback"
                )
            else:
                logger.info(
                    f"[{trace_id}] Stage 2 COMPLETE: Business loaded "
                    f"name={business_ctx.business_data.get('business_name', 'unknown')}"
                )
            
            stages_completed.append('business_loader')
            
            # ── Stage 3: Context Building ──
            logger.info(f"[{trace_id}] Stage 3: Context building started")
            ai_context = self.context_builder.build(
                message=message,
                tenant=tenant,
                business_context=business_ctx,
                trace_id=trace_id,
            )
            
            logger.info(
                f"[{trace_id}] Stage 3 COMPLETE: Context built "
                f"history_messages={len(ai_context.conversation_history)}"
            )
            stages_completed.append('context_builder')
            
            # ── Stage 4: AI Generation ──
            logger.info(f"[{trace_id}] Stage 4: AI generation started")
            ai_result = self.ai_brain.generate(
                ai_context=ai_context,
                trace_id=trace_id,
            )
            
            if not ai_result.success:
                logger.warning(
                    f"[{trace_id}] Stage 4 FAILED: AI generation failed "
                    f"error={ai_result.error}"
                )
                # Return partial success - message was stored
                return OrchestratorResult(
                    success=False,
                    trace_id=trace_id,
                    tenant_id=tenant.firebase_uid,
                    conversation_id=ai_context.conversation_id,
                    error=ai_result.error or 'AI generation failed',
                    stages_completed=stages_completed,
                )
            
            logger.info(
                f"[{trace_id}] Stage 4 COMPLETE: AI generated "
                f"reply_length={len(ai_result.reply_text)} "
                f"intent={ai_result.intent} "
                f"latency={ai_result.latency_ms:.0f}ms"
            )
            stages_completed.append('ai_brain')
            
            # Link AI result to message
            message.conversation_id = ai_context.conversation_id
            
            # ── Stage 5: Outbox Write (KEY FIX) ──
            logger.info(f"[{trace_id}] Stage 5: Outbox write started")
            outbox_result = self.outbox_writer.write(
                ai_result=ai_result,
                message=message,
                tenant=tenant,
                business_context=business_context,
                trace_id=trace_id,
            )
            
            if not outbox_result.success:
                logger.error(
                    f"[{trace_id}] Stage 5 FAILED: Outbox write failed "
                    f"error={outbox_result.error}"
                )
                return OrchestratorResult(
                    success=False,
                    trace_id=trace_id,
                    tenant_id=tenant.firebase_uid,
                    conversation_id=ai_context.conversation_id,
                    error=outbox_result.error or 'Outbox write failed',
                    stages_completed=stages_completed,
                )
            
            if not tenant:
                logger.warning(
                    f"orchestrator_no_tenant trace={trace_id} "
                    f"account={message.channel_account_id}"
                )
                return OrchestratorResult(
                    success=False,
                    trace_id=trace_id,
                    error='Tenant resolution failed',
                    stages_completed=[],
                )
            
            stages_completed.append('tenant_resolver')
            
            # ── Stage 2: Business Data Loading ──
            business_ctx = self.business_loader.load(
                tenant=tenant,
                channel=channel,
                channel_account_id=message.channel_account_id,
                trace_id=trace_id,
            )
            
            if not business_ctx:
                logger.warning(
                    f"orchestrator_no_business trace={trace_id} "
                    f"tenant={tenant.firebase_uid[:15]}"
                )
                # Continue with minimal fallback
            
            stages_completed.append('business_loader')
            
            # ── Stage 3: Context Building ──
            ai_context = self.context_builder.build(
                message=message,
                tenant=tenant,
                business_context=business_ctx,
                trace_id=trace_id,
            )
            
            stages_completed.append('context_builder')
            
            # ── Stage 4: AI Generation ──
            ai_result = self.ai_brain.generate(
                ai_context=ai_context,
                trace_id=trace_id,
            )
            
            if not ai_result.success:
                logger.warning(
                    f"orchestrator_ai_failed trace={trace_id} "
                    f"error={ai_result.error}"
                )
                # Return partial success - message was stored
                return OrchestratorResult(
                    success=False,
                    trace_id=trace_id,
                    tenant_id=tenant.firebase_uid,
                    conversation_id=ai_context.conversation_id,
                    error=ai_result.error or 'AI generation failed',
                    stages_completed=stages_completed,
                )
            
            stages_completed.append('ai_brain')
            
            # Link AI result to message
            message.conversation_id = ai_context.conversation_id
            
            # ── Stage 5: Outbox Write (KEY FIX) ──
            outbox_result = self.outbox_writer.write(
                ai_result=ai_result,
                message=message,
                tenant=tenant,
                business_context=business_ctx,
                trace_id=trace_id,
            )
            
            if not outbox_result.success:
                logger.error(
                    f"orchestrator_outbox_failed trace={trace_id} "
                    f"error={outbox_result.error}"
                )
                return OrchestratorResult(
                    success=False,
                    trace_id=trace_id,
                    tenant_id=tenant.firebase_uid,
                    conversation_id=ai_context.conversation_id,
                    error=outbox_result.error or 'Outbox write failed',
                    stages_completed=stages_completed,
                )
            
            stages_completed.append('outbox_writer')
            
            # ── Success ──
            latency_ms = (time.time() - start_time) * 1000
            self._total_processed += 1
            
            logger.info(
                f"orchestrator_success trace={trace_id} "
                f"tenant={tenant.firebase_uid[:15]} "
                f"outbox_event={outbox_result.outbox_event_id[:12]}... "
                f"latency={latency_ms:.0f}ms"
            )
            
            return OrchestratorResult(
                success=True,
                trace_id=trace_id,
                tenant_id=tenant.firebase_uid,
                outbox_event_id=outbox_result.outbox_event_id,
                conversation_id=ai_context.conversation_id,
                latency_ms=latency_ms,
                stages_completed=stages_completed,
            )
            
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            self._total_failed += 1
            
            logger.error(
                f"orchestrator_error trace={trace_id}: {e}",
                exc_info=True
            )
            
            return OrchestratorResult(
                success=False,
                trace_id=trace_id,
                error=str(e)[:200],
                stages_completed=stages_completed,
            )
    
    # =========================================================================
    # Health & Metrics
    # =========================================================================
    
    def get_stats(self) -> Dict[str, Any]:
        """Get orchestrator statistics."""
        return {
            'total_processed': self._total_processed,
            'total_failed': self._total_failed,
            'success_rate': (
                self._total_processed / max(
                    self._total_processed + self._total_failed, 1
                ) * 100
            ),
        }


class _AIBrainWrapper:
    """
    Wrapper around existing AI Brain for orchestrator.
    
    Uses existing ai_brain.py module - this is a thin wrapper
    that adapts the pipeline's AIContext to what AIBrain expects.
    """
    
    def generate(self, ai_context, trace_id: str) -> 'AIResult':
        """
        Generate AI response using existing AIBrain.
        
        Args:
            ai_context: AIContext from ContextBuilderStage
            trace_id: Tracing ID
            
        Returns:
            AIResult with success/reply_text/error
        """
        start = time.time()
        
        try:
            from ai_brain import AIBrain, AIBrainConfig
            from supabase_client import get_supabase_client
            
            supabase_client = get_supabase_client()
            config = AIBrainConfig()
            brain = AIBrain(config, supabase_client=supabase_client)
            
            # Call existing AIBrain with full context
            result = brain.generate_reply(
                business_data=ai_context.business_data,
                user_message=ai_context.message_text,
                user_id=ai_context.sender_id,
                history=ai_context.conversation_history or None,
                business_id=ai_context.tenant.firebase_uid,
            )
            
            reply_text = result.get('reply', '')
            if not reply_text:
                raise ValueError("AI Brain returned empty reply")
            
            latency_ms = (time.time() - start) * 1000
            
            # Import AIResult from pipeline
            from .pipeline import AIResult
            
            return AIResult(
                success=True,
                reply_text=reply_text,
                intent=result.get('intent', 'unknown'),
                confidence=result.get('confidence', 0.0),
                generation_method=result.get('metadata', {}).get(
                    'generation_method', 'llm'
                ),
                latency_ms=latency_ms,
                was_cached=result.get('cached', False),
            )
            
        except Exception as e:
            latency_ms = (time.time() - start) * 1000
            
            logger.error(
                f"ai_brain_error trace={trace_id}: {e}",
                exc_info=True
            )
            
            from .pipeline import AIResult
            
            return AIResult(
                success=False,
                error=str(e)[:200],
                generation_method='error',
                latency_ms=latency_ms,
            )


# =============================================================================
# Singleton
# =============================================================================

_orchestrator_instance: Optional[MessageOrchestrator] = None


def get_message_orchestrator() -> MessageOrchestrator:
    """Get singleton MessageOrchestrator instance."""
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = MessageOrchestrator()
    return _orchestrator_instance
