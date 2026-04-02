"""
Message Dispatcher — Unified Message Routing Engine
=====================================================

Routes NormalizedMessage objects to the correct channel provider,
integrating ALL infrastructure layers:

    1. Backpressure check → shed low-priority if overloaded
    2. Idempotency guard → prevent duplicate sends
    3. Circuit breaker → fail-fast if provider is down
    4. Rate limit check → defer if near limit
    5. Outbox write → crash-safe persistent delivery
    6. Provider dispatch → channel-specific API call
    7. Status tracking → update message delivery status

This is the internal routing engine used by the SDK.
External consumers should use the SDK (sdk.py), not this module directly.

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Type

from .base import (
    Channel,
    MediaAttachment,
    MessageDirection,
    MessageProvider,
    MessageStatus,
    MessageType,
    NormalizedMessage,
    ProviderError,
    QuickReply,
    RateLimitError,
    SendResult,
)
from .backpressure import BackpressureController, Priority
from .circuit_breaker import CircuitBreakerRegistry
from .idempotency import IdempotencyGuard
from .outbox import OutboxEvent, OutboxEventType, OutboxProcessor

logger = logging.getLogger('flowauxi.messaging.dispatcher')


class MessageDispatcher:
    """
    Routes NormalizedMessage to the correct provider with full
    infrastructure integration.

    Responsibilities:
        1. Provider registry — map Channel → MessageProvider
        2. Pre-send checks — backpressure, idempotency, circuit breaker
        3. Outbox integration — crash-safe write-before-send
        4. Post-send tracking — status updates, metrics
        5. Retry orchestration — DLQ routing for persistent failures

    Usage (internal, via SDK):
        dispatcher = MessageDispatcher()
        dispatcher.register_provider(Channel.INSTAGRAM, InstagramProvider(...))
        dispatcher.register_provider(Channel.WHATSAPP,  WhatsAppProvider(...))

        result = dispatcher.dispatch(normalized_message, access_token="...")
    """

    def __init__(
        self,
        idempotency: Optional[IdempotencyGuard] = None,
        backpressure: Optional[BackpressureController] = None,
        outbox: Optional[OutboxProcessor] = None,
    ):
        self._providers: Dict[Channel, MessageProvider] = {}
        self._idempotency = idempotency
        self._backpressure = backpressure
        self._outbox = outbox

    # =====================================================================
    # Provider Registry
    # =====================================================================

    def register_provider(
        self, channel: Channel, provider: MessageProvider
    ) -> None:
        """Register a provider for a channel."""
        if not isinstance(provider, MessageProvider):
            raise TypeError(
                f"Provider must implement MessageProvider ABC, "
                f"got {type(provider).__name__}"
            )
        if provider.channel != channel:
            raise ValueError(
                f"Provider.channel ({provider.channel}) does not match "
                f"registration channel ({channel})"
            )
        self._providers[channel] = provider
        logger.info(f"dispatcher_registered channel={channel.value}")

    def get_provider(self, channel: Channel) -> MessageProvider:
        """Get provider for a channel."""
        provider = self._providers.get(channel)
        if provider is None:
            raise ValueError(
                f"No provider registered for channel: {channel.value}. "
                f"Registered: {list(self._providers.keys())}"
            )
        return provider

    @property
    def registered_channels(self) -> List[Channel]:
        return list(self._providers.keys())

    # =====================================================================
    # Primary Dispatch — Full pipeline
    # =====================================================================

    def dispatch(
        self,
        message: NormalizedMessage,
        *,
        access_token: str,
        priority: int = Priority.HIGH,
        use_outbox: bool = False,
        tenant_id: Optional[str] = None,
    ) -> SendResult:
        """
        Dispatch a NormalizedMessage through the full send pipeline.

        Pipeline:
            1. Validate → provider exists
            2. Backpressure → should we accept?
            3. Idempotency → have we sent this already?
            4. Circuit breaker → is the provider healthy?
            5. (optional) Outbox → write for crash safety
            6. Provider.send_normalized → actual API call
            7. Track result → mark idempotency, log metrics

        Args:
            message:      Fully populated NormalizedMessage (outbound)
            access_token: Platform API access token
            priority:     Backpressure priority (1=critical, 5=background)
            use_outbox:   Write to outbox table for crash safety
            tenant_id:    Override tenant_id (defaults to message.tenant_id)

        Returns:
            SendResult with success/failure details
        """
        start = time.time()
        channel = message.channel
        idem_key: Optional[str] = None
        tenant = tenant_id or message.tenant_id or "unknown"

        # ── Step 1: Validate ──
        try:
            provider = self.get_provider(channel)
        except ValueError as e:
            return SendResult(
                success=False, status="failed",
                error=str(e), error_code="NO_PROVIDER",
            )

        # ── Step 2: Backpressure ──
        if self._backpressure and not self._backpressure.should_accept(priority):
            logger.info(
                f"dispatch_shed channel={channel.value} "
                f"priority={priority} tenant={tenant[:15]}"
            )
            return SendResult(
                success=False, status="shed",
                error="Backpressure: request shed",
                error_code="BACKPRESSURE_SHED",
            )

        # ── Step 3: Idempotency ──
        if self._idempotency:
            content_sig = hashlib.md5(
                f"{message.text or ''}"
                f"{message.recipient_id}"
                f"{message.message_type.value}".encode()
            ).hexdigest()[:16]
            idem_key = self._idempotency.generate_outbound_key(
                channel.value, tenant,
                message.recipient_id, content_sig,
            )
            if not self._idempotency.acquire(idem_key, context="dispatcher"):
                return SendResult(
                    success=True, status="duplicate",
                    error="Already dispatched (idempotency)",
                )

        # ── Step 4: Circuit breaker ──
        cb = CircuitBreakerRegistry.get(f"{channel.value}_api")
        if not cb.can_execute():
            self._idem_fail(idem_key, "circuit_open")
            return SendResult(
                success=False, status="failed",
                error=f"{channel.value} API circuit breaker OPEN",
                error_code="CIRCUIT_BREAKER_OPEN",
            )

        # ── Step 5: Outbox (optional) ──
        if use_outbox and self._outbox:
            try:
                outbox_event = OutboxEvent(
                    aggregate_type="message",
                    aggregate_id=message.id,
                    event_type=OutboxEventType.SEND_MESSAGE.value,
                    channel=channel.value,
                    payload=message.to_dict(),
                )
                self._outbox.write_with_outbox(
                    message_data=message.to_db_row(),
                    outbox_event=outbox_event,
                )
                self._idem_complete(idem_key)
                return SendResult(
                    success=True, status="queued",
                    message_id=message.id,
                    latency_ms=(time.time() - start) * 1000,
                )
            except Exception as e:
                logger.error(f"dispatch_outbox_error: {e}")
                # Fall through to direct send

        # ── Step 6: Direct send ──
        try:
            result = provider.send_normalized(
                message, access_token=access_token,
            )
            result.latency_ms = (time.time() - start) * 1000

            if result.success:
                self._idem_complete(idem_key)
            else:
                self._idem_fail(idem_key, result.error)

            logger.info(
                f"dispatch_result channel={channel.value} "
                f"success={result.success} "
                f"latency={result.latency_ms:.0f}ms"
            )
            return result

        except Exception as e:
            self._idem_fail(idem_key, str(e))
            logger.error(f"dispatch_exception: {e}", exc_info=True)
            return SendResult(
                success=False, status="failed",
                error=str(e)[:200], error_code="DISPATCH_EXCEPTION",
                latency_ms=(time.time() - start) * 1000,
            )

    # =====================================================================
    # Outbox Dispatch — Called by outbox worker
    # =====================================================================

    def dispatch_from_outbox(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dispatch a message from the outbox worker.

        This is the `dispatch_fn` passed to `OutboxProcessor.process_pending()`.

        Args:
            payload: Serialized NormalizedMessage dict from outbox_events.payload

        Returns:
            {"success": bool, "error": str | None}
        """
        try:
            message = NormalizedMessage.from_dict(payload)
            channel = message.channel

            provider = self.get_provider(channel)

            # Resolve access token from credential manager
            access_token = self._resolve_access_token(
                message.tenant_id, channel, message.channel_account_id,
            )
            if not access_token:
                return {
                    "success": False,
                    "error": f"No credentials for {channel.value} "
                             f"account {message.channel_account_id[:15]}",
                }

            result = provider.send_normalized(
                message, access_token=access_token,
            )
            return {
                "success": result.success,
                "error": result.error,
                "message_id": result.platform_message_id,
            }

        except Exception as e:
            logger.error(f"dispatch_outbox_error: {e}", exc_info=True)
            return {"success": False, "error": str(e)[:500]}

    # =====================================================================
    # Credential Resolution
    # =====================================================================

    def _resolve_access_token(
        self,
        tenant_id: Optional[str],
        channel: Channel,
        channel_account_id: Optional[str],
    ) -> Optional[str]:
        """
        Resolve access token from credential manager.
        
        Falls back through:
        1. EnterpriseCredentialManager (multi-layer cache)
        2. channel_connections table (direct DB)
        3. Environment variables (last resort)
        """
        import os

        # Try credential manager first
        try:
            from credential_manager import EnterpriseCredentialManager
            cred_mgr = EnterpriseCredentialManager()

            if channel == Channel.WHATSAPP:
                creds = cred_mgr.get_credentials(tenant_id)
                if creds:
                    return creds.get("access_token")

            elif channel == Channel.INSTAGRAM:
                creds = cred_mgr.get_instagram_credentials(
                    channel_account_id=channel_account_id,
                    user_id=tenant_id,
                )
                if creds:
                    return creds.get("access_token")
        except Exception as e:
            logger.debug(f"dispatch_cred_mgr_fallback: {e}")

        # Fallback: channel_connections table
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
            result = db.table("channel_connections").select(
                "access_token"
            ).eq("channel", channel.value).eq(
                "channel_account_id", channel_account_id
            ).eq("is_active", True).limit(1).execute()

            if result.data:
                return result.data[0].get("access_token")
        except Exception as e:
            logger.debug(f"dispatch_db_cred_fallback: {e}")

        # Last resort: environment
        env_map = {
            Channel.WHATSAPP: "WHATSAPP_ACCESS_TOKEN",
            Channel.INSTAGRAM: "INSTAGRAM_ACCESS_TOKEN",
        }
        env_key = env_map.get(channel)
        if env_key:
            return os.getenv(env_key)

        return None

    # =====================================================================
    # Internal Helpers
    # =====================================================================

    def _idem_complete(self, key: Optional[str]) -> None:
        if key and self._idempotency:
            try:
                self._idempotency.complete(key)
            except Exception:
                pass

    def _idem_fail(self, key: Optional[str], error: Optional[str]) -> None:
        if key and self._idempotency:
            try:
                self._idempotency.fail(key, error)
            except Exception:
                pass

    # =====================================================================
    # Health
    # =====================================================================

    def get_health(self) -> Dict[str, Any]:
        """Get dispatcher health status."""
        return {
            "registered_channels": [c.value for c in self._providers],
            "circuit_breakers": {
                c.value: CircuitBreakerRegistry.get(
                    f"{c.value}_api"
                ).get_stats()
                for c in self._providers
            },
        }
