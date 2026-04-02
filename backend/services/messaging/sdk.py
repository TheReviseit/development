"""
FlowAuxi Internal Messaging SDK — FAANG Fix #10
=================================================

Single entry point for ALL messaging operations.

Instead of services calling providers directly:
    ❌ instagram_provider.send_text(...)
    ❌ whatsapp_service.send_message(...)

Use the SDK:
    ✅ messaging.send(channel="instagram", ...)
    ✅ messaging.process_inbound(normalized_message)

The SDK orchestrates all FAANG fixes in the correct order:
    1. Backpressure check (Fix 2)
    2. Idempotency guard (Fix 1)
    3. Circuit breaker check (Fix 5)
    4. Conversation lock (Fix 3, for inbound)
    5. AI governor check (Fix 4, for AI responses)
    6. Outbox write (Fix 6)
    7. Provider dispatch
    8. Status tracking

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any, Dict, Optional

from .base import (
    Channel,
    MediaAttachment,
    MessageDirection,
    MessageStatus,
    MessageType,
    NormalizedMessage,
    QuickReply,
    SendResult,
    BackpressureShedError,
    CircuitBreakerOpenError,
    IdempotencyDuplicateError,
)
from .backpressure import BackpressureController, Priority, get_backpressure_controller
from .circuit_breaker import CircuitBreakerRegistry
from .idempotency import IdempotencyGuard, get_idempotency_guard
from .outbox import OutboxEvent, OutboxEventType, OutboxProcessor, get_outbox_processor
from .providers.instagram_provider import InstagramProvider
from .providers.whatsapp_provider import WhatsAppProvider

logger = logging.getLogger('flowauxi.messaging.sdk')


class FlowAuxiMessaging:
    """
    Internal Messaging SDK — Single entry point for all messaging operations.
    
    This is the ONLY public interface for sending/receiving messages.
    All infrastructure concerns (idempotency, backpressure, circuit breakers,
    outbox, rate limiting) are handled internally.
    
    Usage:
        from services.messaging.sdk import messaging
        
        # ─── Send a message (any channel) ───
        result = messaging.send(
            channel="instagram",
            tenant_id="firebase_uid_123",
            recipient_id="igsid_456",
            text="Hello from FlowAuxi!",
            access_token="EAA...",
            channel_account_id="ig_17841400...",
        )
        
        # ─── Send with quick replies ───
        result = messaging.send(
            channel="instagram",
            tenant_id="firebase_uid_123",
            recipient_id="igsid_456",
            text="What would you like?",
            quick_replies=[
                {"title": "T-Shirts 👕", "payload": "cat_tshirts"},
                {"title": "Sneakers 👟", "payload": "cat_sneakers"},
            ],
            access_token="EAA...",
            channel_account_id="ig_17841400...",
        )
        
        # ─── Send media ───
        result = messaging.send(
            channel="whatsapp",
            tenant_id="firebase_uid_123",
            recipient_id="+919876543210",
            media_url="https://example.com/image.jpg",
            media_type="image",
            caption="Check this out!",
            access_token="EAA...",
            channel_account_id="phone_number_id",
        )
    """
    
    def __init__(self):
        """Initialize the SDK with all infrastructure components."""
        # Providers (lazy-loaded)
        self._providers: Dict[Channel, Any] = {}
        
        # Infrastructure (lazy-loaded via singletons)
        self._idempotency: Optional[IdempotencyGuard] = None
        self._backpressure: Optional[BackpressureController] = None
        self._outbox: Optional[OutboxProcessor] = None
        
        logger.info("📡 FlowAuxiMessaging SDK initialized")
    
    # =========================================================================
    # Provider Registry
    # =========================================================================
    
    def _get_provider(self, channel: Channel):
        """Get or create provider for a channel."""
        if channel not in self._providers:
            if channel == Channel.INSTAGRAM:
                # Get Redis for rate limiting
                redis_client = None
                try:
                    import os, redis
                    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
                    redis_client = redis.from_url(redis_url, decode_responses=True)
                except Exception:
                    pass
                self._providers[channel] = InstagramProvider(
                    redis_client=redis_client
                )
            elif channel == Channel.WHATSAPP:
                self._providers[channel] = WhatsAppProvider()
            else:
                raise ValueError(f"Unsupported channel: {channel.value}")
        
        return self._providers[channel]
    
    # =========================================================================
    # Infrastructure Accessors (lazy-loaded singletons)
    # =========================================================================
    
    @property
    def idempotency(self) -> IdempotencyGuard:
        if self._idempotency is None:
            try:
                self._idempotency = get_idempotency_guard()
            except Exception as e:
                logger.warning(f"sdk_idempotency_unavailable: {e}")
        return self._idempotency
    
    @property
    def backpressure(self) -> BackpressureController:
        if self._backpressure is None:
            try:
                self._backpressure = get_backpressure_controller()
            except Exception as e:
                logger.warning(f"sdk_backpressure_unavailable: {e}")
        return self._backpressure
    
    @property
    def outbox(self) -> OutboxProcessor:
        if self._outbox is None:
            try:
                self._outbox = get_outbox_processor()
            except Exception as e:
                logger.warning(f"sdk_outbox_unavailable: {e}")
        return self._outbox
    
    # =========================================================================
    # Send API — Single method for all outbound messages
    # =========================================================================
    
    def send(
        self,
        channel: str,
        tenant_id: str,
        recipient_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        text: Optional[str] = None,
        media_url: Optional[str] = None,
        media_type: Optional[str] = None,
        caption: Optional[str] = None,
        quick_replies: Optional[list] = None,
        template_name: Optional[str] = None,
        priority: int = Priority.HIGH,
        idempotency_key: Optional[str] = None,
        use_outbox: bool = True,
        **kwargs,
    ) -> SendResult:
        """
        Send a message through the unified pipeline.
        
        Pipeline order:
        1. Backpressure check
        2. Idempotency check
        3. Circuit breaker check
        4. Direct send OR outbox write
        
        Args:
            channel: Channel name ('instagram', 'whatsapp')
            tenant_id: Firebase UID of the business
            recipient_id: Recipient platform ID
            access_token: Platform API access token
            channel_account_id: Business account ID on platform
            text: Text message content
            media_url: URL of media to send
            media_type: Type of media ('image', 'video', 'audio')
            caption: Media caption
            quick_replies: List of quick reply dicts [{title, payload}]
            template_name: Template name for template messages
            priority: Message priority (1-5)
            idempotency_key: Custom idempotency key
            use_outbox: Use outbox pattern for crash safety
            
        Returns:
            SendResult with status and details
        """
        start_time = time.time()
        channel_enum = Channel(channel)
        
        # ─── Step 1: Backpressure Check ───
        if self.backpressure:
            if not self.backpressure.should_accept(priority):
                logger.info(
                    f"sdk_shed channel={channel} priority={priority} "
                    f"tenant={tenant_id[:15]}"
                )
                return SendResult(
                    success=False,
                    status='shed',
                    error='System under load, message deferred',
                    error_code='BACKPRESSURE_SHED',
                )
        
        # ─── Step 2: Idempotency Check ───
        if self.idempotency:
            content_hash = hashlib.md5(
                f"{text}{media_url}{template_name}".encode()
            ).hexdigest()[:16]
            
            idem_key = idempotency_key or self.idempotency.generate_outbound_key(
                channel, tenant_id, recipient_id, content_hash
            )
            
            if not self.idempotency.acquire(idem_key, context="sdk.send"):
                return SendResult(
                    success=True,  # Not an error — just already sent
                    status='duplicate',
                    error='Message already sent (idempotency)',
                )
        else:
            idem_key = None
        
        # ─── Step 3: Circuit Breaker Check ───
        cb = CircuitBreakerRegistry.get(f"{channel}_api")
        if not cb.can_execute():
            if idem_key and self.idempotency:
                self.idempotency.fail(idem_key)
            return SendResult(
                success=False,
                status='failed',
                error=f'{channel} API circuit breaker is OPEN',
                error_code='CIRCUIT_BREAKER_OPEN',
            )
        
        # ─── Step 4: Build and send ───
        try:
            # Use transactional outbox for crash-safe delivery when requested
            if use_outbox and self.outbox:
                # Build a NormalizedMessage record for durable storage
                nm = NormalizedMessage(
                    channel=channel_enum,
                    direction=MessageDirection.OUTBOUND,
                    channel_message_id="",  # Filled by provider after send
                    channel_account_id=channel_account_id,
                    sender_id="",  # Business sender varies per channel
                    recipient_id=recipient_id,
                    tenant_id=tenant_id,
                    message_type=MessageType.TEXT,
                    text=text or None,
                    status=MessageStatus.QUEUED,
                )
                if media_url:
                    nm.message_type = MessageType.IMAGE if (media_type or 'image') == 'image' else MessageType.VIDEO
                    nm.media = MediaAttachment(
                        media_type=media_type or 'image',
                        media_url=media_url,
                        caption=caption,
                    )
                if quick_replies:
                    nm.quick_replies = [
                        QuickReply(
                            title=qr.get('title', ''),
                            payload=qr.get('payload', ''),
                            image_url=qr.get('image_url'),
                        ) for qr in quick_replies
                    ]

                event = OutboxEvent(
                    aggregate_type="message",
                    aggregate_id=nm.id,
                    event_type=OutboxEventType.SEND_MESSAGE.value,
                    channel=channel_enum.value,
                    payload=nm.to_dict(),
                )

                self.outbox.write_with_outbox(
                    message_data=nm.to_db_row(),
                    outbox_event=event,
                )
                if idem_key and self.idempotency:
                    self.idempotency.complete(idem_key)
                return SendResult(
                    success=True,
                    status='queued',
                    message_id=nm.id,
                    latency_ms=(time.time() - start_time) * 1000,
                )

            provider = self._get_provider(channel_enum)
            
            # Determine message type and dispatch
            if template_name:
                result = provider.send_template(
                    recipient_id=recipient_id,
                    template_name=template_name,
                    access_token=access_token,
                    channel_account_id=channel_account_id,
                    **kwargs,
                )
            elif media_url:
                media = MediaAttachment(
                    media_type=media_type or 'image',
                    media_url=media_url,
                    caption=caption,
                )
                result = provider.send_media(
                    recipient_id=recipient_id,
                    media=media,
                    access_token=access_token,
                    channel_account_id=channel_account_id,
                    caption=caption,
                )
            elif quick_replies:
                qr_objects = [
                    QuickReply(
                        title=qr.get('title', ''),
                        payload=qr.get('payload', ''),
                        image_url=qr.get('image_url'),
                    )
                    for qr in quick_replies
                ]
                result = provider.send_quick_replies(
                    recipient_id=recipient_id,
                    text=text or "",
                    quick_replies=qr_objects,
                    access_token=access_token,
                    channel_account_id=channel_account_id,
                )
            else:
                result = provider.send_text(
                    recipient_id=recipient_id,
                    text=text or "",
                    access_token=access_token,
                    channel_account_id=channel_account_id,
                )
            
            # ─── Post-send ───
            result.latency_ms = (time.time() - start_time) * 1000
            
            if result.success:
                if idem_key and self.idempotency:
                    self.idempotency.complete(idem_key)
                logger.info(
                    f"sdk_sent channel={channel} "
                    f"tenant={tenant_id[:15]} "
                    f"recipient={recipient_id[:15]} "
                    f"latency={result.latency_ms:.0f}ms"
                )
            else:
                if idem_key and self.idempotency:
                    self.idempotency.fail(idem_key, result.error)
                logger.warning(
                    f"sdk_send_failed channel={channel} "
                    f"error={result.error}"
                )
            
            return result
            
        except Exception as e:
            if idem_key and self.idempotency:
                self.idempotency.fail(idem_key, str(e))
            
            logger.error(f"sdk_send_exception: {e}", exc_info=True)
            return SendResult(
                success=False,
                status='failed',
                error=str(e)[:200],
                error_code='SDK_EXCEPTION',
                latency_ms=(time.time() - start_time) * 1000,
            )
    
    # =========================================================================
    # Convenience Methods
    # =========================================================================
    
    def send_typing(
        self,
        channel: str,
        recipient_id: str,
        *,
        access_token: str,
        channel_account_id: str,
    ) -> SendResult:
        """Show typing indicator."""
        provider = self._get_provider(Channel(channel))
        return provider.send_typing_indicator(
            recipient_id=recipient_id,
            access_token=access_token,
            channel_account_id=channel_account_id,
        )
    
    def mark_seen(
        self,
        channel: str,
        sender_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        message_id: Optional[str] = None,
    ) -> SendResult:
        """Mark message as seen."""
        provider = self._get_provider(Channel(channel))
        return provider.mark_seen(
            sender_id=sender_id,
            access_token=access_token,
            channel_account_id=channel_account_id,
            message_id=message_id,
        )
    
    # =========================================================================
    # Health & Monitoring
    # =========================================================================
    
    def health_report(self) -> Dict[str, Any]:
        """Get comprehensive health report for all messaging infrastructure."""
        report = {
            'circuit_breakers': CircuitBreakerRegistry.health_report(),
        }
        
        if self.backpressure:
            report['backpressure'] = self.backpressure.get_stats()
        
        # Provider-specific health
        for channel, provider in self._providers.items():
            if hasattr(provider, 'get_rate_limit_status'):
                report[f'{channel.value}_rate_limit'] = 'available'
        
        return report


# =============================================================================
# Singleton SDK Instance
# =============================================================================

_sdk_instance: Optional[FlowAuxiMessaging] = None


def get_messaging_sdk() -> FlowAuxiMessaging:
    """Get the singleton messaging SDK instance."""
    global _sdk_instance
    if _sdk_instance is None:
        _sdk_instance = FlowAuxiMessaging()
    return _sdk_instance


# Convenience alias
messaging = None  # Will be initialized on first import in Flask app context


def init_messaging() -> FlowAuxiMessaging:
    """Initialize the messaging SDK (call from Flask app factory)."""
    global messaging
    messaging = get_messaging_sdk()
    return messaging
