"""
Messaging Base — Core Abstractions for Omni-Channel Messaging
==============================================================

This module defines the foundational types used across the entire messaging
system. Every component — normalizers, providers, dispatcher, automation
engine, SDK — speaks in terms of these types.

Design Principles:
    1. Channel-agnostic: NormalizedMessage works for any platform
    2. Immutable after creation: Dataclasses with frozen=False but discipline
    3. Rich enums: Self-documenting, exhaustive, serializable
    4. ABC enforcement: Providers MUST implement the full interface
    5. Zero external dependencies: Only stdlib + typing

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import uuid
import hashlib
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import (
    Any,
    Dict,
    List,
    Optional,
    Union,
)

logger = logging.getLogger('flowauxi.messaging.base')


# =============================================================================
# Enums — Exhaustive, serializable, self-documenting
# =============================================================================

class Channel(str, Enum):
    """Supported messaging channels."""
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"
    MESSENGER = "messenger"
    SMS = "sms"

    @classmethod
    def from_webhook_object(cls, obj: str) -> 'Channel':
        """Map Meta webhook 'object' field to Channel enum."""
        mapping = {
            'whatsapp_business_account': cls.WHATSAPP,
            'instagram': cls.INSTAGRAM,
            'page': cls.MESSENGER,
        }
        channel = mapping.get(obj)
        if not channel:
            raise ValueError(f"Unknown webhook object type: {obj}")
        return channel


class MessageDirection(str, Enum):
    """Message direction relative to our system."""
    INBOUND = "inbound"    # Customer → Business (received)
    OUTBOUND = "outbound"  # Business → Customer (sent)


class MessageType(str, Enum):
    """
    Unified message type taxonomy.
    
    Covers all message types across all supported channels.
    Channel-specific types (story_mention, etc.) are normalized here.
    """
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"
    STICKER = "sticker"
    LOCATION = "location"
    CONTACT = "contact"
    
    # Interactive
    QUICK_REPLY = "quick_reply"
    BUTTON_REPLY = "button_reply"      # WhatsApp interactive button response
    LIST_REPLY = "list_reply"          # WhatsApp list selection
    TEMPLATE = "template"              # Pre-approved template message
    
    # Instagram-specific (normalized)
    STORY_MENTION = "story_mention"    # User mentioned business in story
    STORY_REPLY = "story_reply"        # User replied to business story
    REEL_MENTION = "reel_mention"      # User mentioned business in reel
    
    # Reactions
    REACTION = "reaction"              # Emoji reaction to a message
    
    # System
    POSTBACK = "postback"              # Button/menu postback
    REFERRAL = "referral"              # Ad click, link click
    
    # Unknown / fallback
    UNKNOWN = "unknown"


class MessageStatus(str, Enum):
    """Message delivery status lifecycle."""
    PENDING = "pending"        # Created, not yet sent
    QUEUED = "queued"          # In outbox, waiting for dispatch
    SENT = "sent"              # Sent to platform API (accepted)
    DELIVERED = "delivered"    # Delivered to recipient device
    READ = "read"              # Read by recipient
    FAILED = "failed"          # Delivery failed
    
    # Inbound statuses
    RECEIVED = "received"      # Received from platform
    PROCESSED = "processed"    # Automation/AI has processed it


class ReferralSource(str, Enum):
    """How the customer initiated the conversation."""
    ORGANIC = "organic"        # Direct DM
    AD = "ad"                  # Click-to-message ad
    STORY = "story"            # Story interaction
    REEL = "reel"              # Reel interaction
    LINK = "link"              # Shared link
    QR_CODE = "qr_code"       # QR code scan
    UNKNOWN = "unknown"


class AutomationActionType(str, Enum):
    """Types of automation actions."""
    REPLY_TEXT = "reply_text"
    REPLY_TEMPLATE = "reply_template"
    REPLY_MEDIA = "reply_media"
    START_FLOW = "start_flow"
    AI_RESPONSE = "ai_response"
    ASSIGN_LABEL = "assign_label"
    WEBHOOK = "webhook"
    DELAY = "delay"
    CONDITION = "condition"


# =============================================================================
# Data Classes — Immutable message representations
# =============================================================================

@dataclass
class MediaAttachment:
    """Media attached to a message."""
    media_type: str              # 'image', 'video', 'audio', 'document', 'sticker'
    media_id: Optional[str] = None          # Platform media ID
    media_url: Optional[str] = None         # Direct URL (if available)
    mime_type: Optional[str] = None         # MIME type
    filename: Optional[str] = None          # Original filename
    caption: Optional[str] = None           # Media caption
    sha256: Optional[str] = None            # File hash for deduplication
    file_size: Optional[int] = None         # File size in bytes

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class QuickReply:
    """Quick reply button (Instagram/Messenger/WhatsApp)."""
    title: str                              # Button text (max 20 chars)
    payload: str                            # Payload sent back on click
    image_url: Optional[str] = None         # Icon URL (Messenger only)

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ReactionData:
    """Reaction to a message."""
    emoji: str                              # The reaction emoji
    reacted_message_id: str                 # ID of the message being reacted to
    action: str = "react"                   # 'react' or 'unreact'


@dataclass
class ReferralData:
    """Referral/attribution data for how conversation started."""
    source: ReferralSource = ReferralSource.UNKNOWN
    ad_id: Optional[str] = None
    headline: Optional[str] = None
    body: Optional[str] = None
    source_url: Optional[str] = None
    media_url: Optional[str] = None


@dataclass
class StoryData:
    """Instagram story-related data."""
    story_id: Optional[str] = None
    story_url: Optional[str] = None
    reel_id: Optional[str] = None
    reel_url: Optional[str] = None


@dataclass
class NormalizedMessage:
    """
    Channel-agnostic message representation.
    
    This is the CORE data structure of the messaging system. Every inbound
    webhook payload gets normalized into this format. Every outbound message
    starts as a NormalizedMessage before being converted to channel-specific
    API calls.
    
    Design:
    - Contains ALL information needed for processing, dispatch, and storage
    - Channel-specific data is in typed sub-objects (story_data, referral_data)
    - Idempotency key is deterministic: hash(channel + channel_message_id)
    - Serializable to JSON for Celery task arguments
    """
    
    # === Identity ===
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    channel: Channel = Channel.WHATSAPP
    direction: MessageDirection = MessageDirection.INBOUND
    
    # === Platform IDs ===
    channel_message_id: str = ""         # Platform message ID (wamid, ig mid)
    channel_account_id: str = ""         # Business account ID on platform
    channel_connection_id: Optional[str] = None  # Our DB reference
    
    # === Threading ===
    thread_id: Optional[str] = None      # Platform conversation/thread ID
    conversation_id: Optional[str] = None  # Our unified conversation ID
    reply_to_message_id: Optional[str] = None  # If replying to specific message
    
    # === Participants ===
    sender_id: str = ""                  # Platform user ID of sender
    sender_name: Optional[str] = None
    sender_username: Optional[str] = None  # IG: @username
    sender_profile_pic: Optional[str] = None
    recipient_id: str = ""               # Platform user ID of recipient
    recipient_name: Optional[str] = None
    
    # === Tenant ===
    tenant_id: Optional[str] = None      # Firebase UID (resolved from channel_account_id)
    
    # === Content ===
    message_type: MessageType = MessageType.TEXT
    text: Optional[str] = None           # Text content (body)
    media: Optional[MediaAttachment] = None
    quick_replies: Optional[List[QuickReply]] = None  # For outbound
    
    # === Interactive Response (from user clicking buttons) ===
    postback_payload: Optional[str] = None   # Button/quick reply payload
    postback_title: Optional[str] = None     # Button/quick reply display title
    
    # === Reactions ===
    reaction: Optional[ReactionData] = None
    
    # === Instagram-Specific ===
    story_data: Optional[StoryData] = None
    referral_data: Optional[ReferralData] = None
    
    # === Status ===
    status: MessageStatus = MessageStatus.RECEIVED
    error_message: Optional[str] = None
    
    # === AI/Automation Metadata ===
    is_automated: bool = False
    automation_rule_id: Optional[str] = None
    automation_flow_id: Optional[str] = None
    ai_model_used: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_tokens_used: Optional[int] = None
    
    # === Timestamps ===
    platform_timestamp: Optional[datetime] = None  # When Meta says it happened
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # === Idempotency ===
    idempotency_key: Optional[str] = None  # Computed on creation
    
    def __post_init__(self):
        """Compute idempotency key if not provided."""
        if not self.idempotency_key and self.channel_message_id:
            raw = f"{self.channel.value}:{self.channel_message_id}"
            self.idempotency_key = hashlib.sha256(raw.encode()).hexdigest()
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to JSON-safe dictionary (for Celery args, DB storage)."""
        result = {}
        for k, v in asdict(self).items():
            if v is None:
                continue
            if isinstance(v, Enum):
                result[k] = v.value
            elif isinstance(v, datetime):
                result[k] = v.isoformat()
            elif isinstance(v, (dict, list)):
                result[k] = v
            else:
                result[k] = v
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'NormalizedMessage':
        """Deserialize from dictionary."""
        # Convert enum strings back to enums
        if 'channel' in data and isinstance(data['channel'], str):
            data['channel'] = Channel(data['channel'])
        if 'direction' in data and isinstance(data['direction'], str):
            data['direction'] = MessageDirection(data['direction'])
        if 'message_type' in data and isinstance(data['message_type'], str):
            try:
                data['message_type'] = MessageType(data['message_type'])
            except ValueError:
                data['message_type'] = MessageType.UNKNOWN
        if 'status' in data and isinstance(data['status'], str):
            try:
                data['status'] = MessageStatus(data['status'])
            except ValueError:
                data['status'] = MessageStatus.RECEIVED
        
        # Convert nested objects
        if 'media' in data and isinstance(data['media'], dict):
            data['media'] = MediaAttachment(**data['media'])
        if 'reaction' in data and isinstance(data['reaction'], dict):
            data['reaction'] = ReactionData(**data['reaction'])
        if 'story_data' in data and isinstance(data['story_data'], dict):
            data['story_data'] = StoryData(**data['story_data'])
        if 'referral_data' in data and isinstance(data['referral_data'], dict):
            data['referral_data'] = ReferralData(**data['referral_data'])
        if 'quick_replies' in data and isinstance(data['quick_replies'], list):
            data['quick_replies'] = [
                QuickReply(**qr) if isinstance(qr, dict) else qr
                for qr in data['quick_replies']
            ]
        
        # Parse datetime strings
        for dt_field in ('platform_timestamp', 'created_at'):
            if dt_field in data and isinstance(data[dt_field], str):
                try:
                    data[dt_field] = datetime.fromisoformat(
                        data[dt_field].replace('Z', '+00:00')
                    )
                except (ValueError, TypeError):
                    data[dt_field] = datetime.now(timezone.utc)
        
        # Filter to only known fields
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        
        return cls(**filtered)
    
    def to_db_row(self) -> Dict[str, Any]:
        """Convert to a row suitable for unified_messages table insert."""
        return {
            'id': self.id,
            'user_id': self.tenant_id,
            'channel': self.channel.value,
            'channel_connection_id': self.channel_connection_id,
            'channel_message_id': self.channel_message_id,
            'conversation_id': self.conversation_id,
            'thread_id': self.thread_id,
            'direction': self.direction.value,
            'sender_id': self.sender_id,
            'sender_name': self.sender_name,
            'recipient_id': self.recipient_id,
            'recipient_name': self.recipient_name,
            'message_type': self.message_type.value,
            'message_body': self.text,
            'media_url': self.media.media_url if self.media else None,
            'media_type': self.media.media_type if self.media else None,
            'media_id': self.media.media_id if self.media else None,
            'story_id': self.story_data.story_id if self.story_data else None,
            'reel_id': self.story_data.reel_id if self.story_data else None,
            'referral_source': (
                self.referral_data.source.value if self.referral_data else None
            ),
            'status': self.status.value,
            'error_message': self.error_message,
            'is_automated': self.is_automated,
            'automation_rule_id': self.automation_rule_id,
            'ai_model_used': self.ai_model_used,
            'ai_confidence': self.ai_confidence,
            'platform_timestamp': (
                self.platform_timestamp.isoformat() if self.platform_timestamp else None
            ),
            'created_at': self.created_at.isoformat(),
        }


# =============================================================================
# Send Result — Return type for all send operations
# =============================================================================

@dataclass
class SendResult:
    """Result of a message send operation."""
    success: bool
    status: str = "unknown"         # 'sent', 'queued', 'duplicate', 'shed', 'failed'
    message_id: Optional[str] = None  # Our internal message ID
    platform_message_id: Optional[str] = None  # Platform's message ID
    error: Optional[str] = None
    error_code: Optional[str] = None
    latency_ms: float = 0.0
    attempts: int = 1
    
    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


# =============================================================================
# Message Provider ABC — Interface that ALL channel providers MUST implement
# =============================================================================

class MessageProvider(ABC):
    """
    Abstract base class for channel-specific message providers.
    
    Every channel (WhatsApp, Instagram, Messenger) implements this interface.
    The MessageDispatcher routes NormalizedMessages to the correct provider.
    
    Contract:
    - All methods return SendResult (never raise for business errors)
    - All methods are synchronous (async via Celery at the dispatch layer)
    - Rate limiting is handled internally per provider
    - Circuit breaker wrapping is done at the provider level
    
    Example:
        class InstagramProvider(MessageProvider):
            @property
            def channel(self) -> Channel:
                return Channel.INSTAGRAM
            
            def send_text(self, recipient_id, text, **kwargs) -> SendResult:
                # Call Instagram Graph API
                ...
    """
    
    @property
    @abstractmethod
    def channel(self) -> Channel:
        """The channel this provider handles."""
        ...
    
    @abstractmethod
    def send_text(
        self,
        recipient_id: str,
        text: str,
        *,
        access_token: str,
        channel_account_id: str,
        reply_to_message_id: Optional[str] = None,
        **kwargs,
    ) -> SendResult:
        """Send a text message."""
        ...
    
    @abstractmethod
    def send_media(
        self,
        recipient_id: str,
        media: MediaAttachment,
        *,
        access_token: str,
        channel_account_id: str,
        caption: Optional[str] = None,
        **kwargs,
    ) -> SendResult:
        """Send a media message (image, video, audio, document)."""
        ...
    
    @abstractmethod
    def send_quick_replies(
        self,
        recipient_id: str,
        text: str,
        quick_replies: List[QuickReply],
        *,
        access_token: str,
        channel_account_id: str,
        **kwargs,
    ) -> SendResult:
        """Send a message with quick reply buttons."""
        ...
    
    @abstractmethod
    def send_template(
        self,
        recipient_id: str,
        template_name: str,
        *,
        access_token: str,
        channel_account_id: str,
        language_code: str = "en",
        components: Optional[List[Dict]] = None,
        **kwargs,
    ) -> SendResult:
        """Send a template/structured message."""
        ...
    
    @abstractmethod
    def mark_seen(
        self,
        sender_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        message_id: Optional[str] = None,
        **kwargs,
    ) -> SendResult:
        """Mark a message/conversation as seen/read."""
        ...
    
    @abstractmethod
    def send_typing_indicator(
        self,
        recipient_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        **kwargs,
    ) -> SendResult:
        """Show typing indicator to the recipient."""
        ...
    
    def send_normalized(
        self,
        message: NormalizedMessage,
        *,
        access_token: str,
    ) -> SendResult:
        """
        Send a NormalizedMessage using the appropriate method.
        
        This is the primary dispatch method used by the MessageDispatcher.
        Routes to send_text, send_media, etc. based on message_type.
        
        Subclasses can override for custom routing logic.
        """
        mt = message.message_type
        
        common_kwargs = {
            'access_token': access_token,
            'channel_account_id': message.channel_account_id,
            'reply_to_message_id': message.reply_to_message_id,
        }
        
        if mt == MessageType.TEXT:
            if message.quick_replies:
                return self.send_quick_replies(
                    recipient_id=message.recipient_id,
                    text=message.text or "",
                    quick_replies=message.quick_replies,
                    **common_kwargs,
                )
            return self.send_text(
                recipient_id=message.recipient_id,
                text=message.text or "",
                **common_kwargs,
            )
        
        if mt in (
            MessageType.IMAGE, MessageType.VIDEO,
            MessageType.AUDIO, MessageType.DOCUMENT,
            MessageType.STICKER,
        ):
            if not message.media:
                return SendResult(
                    success=False,
                    status='failed',
                    error='Media attachment required for media message',
                    error_code='MISSING_MEDIA',
                )
            return self.send_media(
                recipient_id=message.recipient_id,
                media=message.media,
                caption=message.text,
                **common_kwargs,
            )
        
        if mt == MessageType.TEMPLATE:
            return self.send_template(
                recipient_id=message.recipient_id,
                template_name=message.text or "",
                **common_kwargs,
            )
        
        # Fallback: try to send as text
        if message.text:
            return self.send_text(
                recipient_id=message.recipient_id,
                text=message.text,
                **common_kwargs,
            )
        
        return SendResult(
            success=False,
            status='failed',
            error=f'Unsupported message type: {mt.value}',
            error_code='UNSUPPORTED_TYPE',
        )


# =============================================================================
# Exceptions
# =============================================================================

class MessagingError(Exception):
    """Base exception for messaging module."""
    pass


class ProviderError(MessagingError):
    """Error from a channel provider (API call failed)."""
    def __init__(self, message: str, channel: Channel = None,
                 error_code: str = None, status_code: int = None,
                 retryable: bool = True):
        super().__init__(message)
        self.channel = channel
        self.error_code = error_code
        self.status_code = status_code
        self.retryable = retryable


class RateLimitError(ProviderError):
    """Rate limit exceeded for a channel."""
    def __init__(self, channel: Channel, retry_after: int = 60):
        super().__init__(
            f"Rate limit exceeded for {channel.value}",
            channel=channel,
            error_code='RATE_LIMITED',
            retryable=True,
        )
        self.retry_after = retry_after


class CircuitBreakerOpenError(MessagingError):
    """Circuit breaker is open for a service."""
    def __init__(self, service_name: str):
        super().__init__(f"Circuit breaker OPEN for {service_name}")
        self.service_name = service_name


class ConversationLockTimeout(MessagingError):
    """Failed to acquire distributed lock on a conversation."""
    def __init__(self, conversation_id: str, timeout: float):
        super().__init__(
            f"Failed to acquire lock for conversation {conversation_id} "
            f"after {timeout}s"
        )
        self.conversation_id = conversation_id
        self.timeout = timeout


class IdempotencyDuplicateError(MessagingError):
    """Message was already processed (idempotency guard)."""
    def __init__(self, idempotency_key: str, existing_status: str = None):
        super().__init__(f"Duplicate message: {idempotency_key}")
        self.idempotency_key = idempotency_key
        self.existing_status = existing_status


class BackpressureShedError(MessagingError):
    """Request was shed due to system overload."""
    def __init__(self, priority: int, load_level: str):
        super().__init__(
            f"Request shed: priority={priority} load_level={load_level}"
        )
        self.priority = priority
        self.load_level = load_level
