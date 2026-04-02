"""
Instagram Messaging Provider — Instagram Graph API v21.0 Client
================================================================

Production-grade Instagram DM client implementing the MessageProvider ABC.

Capabilities:
- Send text messages via IG Messaging API
- Send media (image, video) with captions
- Send quick reply buttons (up to 13)
- Send generic templates
- Mark messages as seen
- Send typing indicators
- Rate limit tracking (200 calls/hour/IGBA via Redis sliding window)
- Integrated circuit breaker (via CircuitBreakerRegistry)

Instagram Messaging API Reference:
    https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging
    
Endpoint: POST https://graph.facebook.com/v21.0/{ig-user-id}/messages

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

from ..base import (
    Channel,
    MediaAttachment,
    MessageProvider,
    MessageType,
    NormalizedMessage,
    ProviderError,
    QuickReply,
    RateLimitError,
    SendResult,
)
from ..circuit_breaker import CircuitBreakerRegistry, with_circuit_breaker

logger = logging.getLogger('flowauxi.messaging.providers.instagram')


class InstagramProvider(MessageProvider):
    """
    Instagram Graph API messaging provider.
    
    Implements the full MessageProvider interface for Instagram DMs.
    
    Rate Limits:
        Instagram Messaging API: 200 API calls per user per hour per IGBA.
        We track this via a Redis sliding window counter per channel_account_id.
    
    Usage:
        provider = InstagramProvider()
        
        result = provider.send_text(
            recipient_id="igsid_12345",
            text="Hello from FlowAuxi!",
            access_token="EAA...",
            channel_account_id="ig_17841400...",
        )
    """
    
    API_VERSION = "v21.0"
    BASE_URL_FACEBOOK = "https://graph.facebook.com"  # For EAA tokens (Facebook Login)
    BASE_URL_INSTAGRAM = "https://graph.instagram.com"  # For IGA tokens (Instagram Login)
    
    # Legacy alias — kept for non-send methods (e.g. get_user_profile)
    BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
    
    # Rate limit: 200 calls/hour/IGBA
    RATE_LIMIT_MAX = 200
    RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds
    RATE_LIMIT_WARN = 150     # Start warning at 150/200
    RATE_LIMIT_BACKPRESSURE = 180  # Start delaying at 180/200
    
    # Quick reply limits
    MAX_QUICK_REPLIES = 13
    MAX_QUICK_REPLY_TITLE = 20
    MAX_QUICK_REPLY_PAYLOAD = 1000
    
    # Timeouts
    REQUEST_TIMEOUT = 15  # seconds
    
    def __init__(self, redis_client=None):
        """
        Args:
            redis_client: Redis client for rate limit tracking (optional)
        """
        self._redis = redis_client
        self._session = requests.Session()
        self._session.headers.update({
            'Content-Type': 'application/json',
        })
    
    @property
    def channel(self) -> Channel:
        return Channel.INSTAGRAM
    
    # =========================================================================
    # Core Send Methods
    # =========================================================================
    
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
        """Send a text message via Instagram DM."""
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type="text",
        )
    
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
        """
        Send a media message (image or video) via Instagram DM.
        
        Instagram supports: image, video, audio, file (as attachments).
        """
        # Map our media types to Instagram attachment types
        ig_type_map = {
            'image': 'image',
            'video': 'video',
            'audio': 'audio',
            'document': 'file',
        }
        ig_type = ig_type_map.get(media.media_type, 'file')
        
        message: Dict[str, Any] = {
            "attachment": {
                "type": ig_type,
                "payload": {},
            }
        }
        
        # Prefer URL over media_id
        if media.media_url:
            message["attachment"]["payload"]["url"] = media.media_url
        elif media.media_id:
            message["attachment"]["payload"]["attachment_id"] = media.media_id
        else:
            return SendResult(
                success=False,
                status='failed',
                error='No media URL or attachment ID provided',
                error_code='MISSING_MEDIA_SOURCE',
            )
        
        payload = {
            "recipient": {"id": recipient_id},
            "message": message,
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type=f"media_{ig_type}",
        )
    
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
        """
        Send a message with quick reply buttons.
        
        Instagram limits:
        - Max 13 quick replies per message
        - Title max 20 characters
        - Payload max 1000 characters
        """
        # Enforce limits
        if len(quick_replies) > self.MAX_QUICK_REPLIES:
            logger.warning(
                f"ig_quick_replies_truncated "
                f"requested={len(quick_replies)} max={self.MAX_QUICK_REPLIES}"
            )
            quick_replies = quick_replies[:self.MAX_QUICK_REPLIES]
        
        ig_quick_replies = []
        for qr in quick_replies:
            ig_qr: Dict[str, Any] = {
                "content_type": "text",
                "title": qr.title[:self.MAX_QUICK_REPLY_TITLE],
                "payload": qr.payload[:self.MAX_QUICK_REPLY_PAYLOAD],
            }
            if qr.image_url:
                ig_qr["image_url"] = qr.image_url
            ig_quick_replies.append(ig_qr)
        
        payload = {
            "recipient": {"id": recipient_id},
            "message": {
                "text": text,
                "quick_replies": ig_quick_replies,
            },
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type="quick_reply",
        )
    
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
        """
        Send a generic template message.
        
        Instagram supports generic templates with:
        - Title, subtitle, image
        - Up to 3 buttons
        - Up to 10 elements (carousel)
        """
        elements = kwargs.get('elements', [])
        
        if not elements:
            # Simple template: use template_name as title
            return self.send_text(
                recipient_id=recipient_id,
                text=template_name,
                access_token=access_token,
                channel_account_id=channel_account_id,
            )
        
        payload = {
            "recipient": {"id": recipient_id},
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "generic",
                        "elements": elements[:10],  # Max 10
                    },
                },
            },
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type="template",
        )
    
    def mark_seen(
        self,
        sender_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        message_id: Optional[str] = None,
        **kwargs,
    ) -> SendResult:
        """Mark a conversation as seen (read receipts)."""
        payload = {
            "recipient": {"id": sender_id},
            "sender_action": "mark_seen",
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type="mark_seen",
            skip_rate_limit=False,
        )
    
    def send_typing_indicator(
        self,
        recipient_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        **kwargs,
    ) -> SendResult:
        """Show typing indicator to the recipient."""
        payload = {
            "recipient": {"id": recipient_id},
            "sender_action": "typing_on",
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type="typing_on",
            skip_rate_limit=False,
        )
    
    # =========================================================================
    # Instagram-Specific Methods
    # =========================================================================
    
    def send_reaction(
        self,
        recipient_id: str,
        message_id: str,
        emoji: str,
        *,
        access_token: str,
        channel_account_id: str,
    ) -> SendResult:
        """React to a message with an emoji."""
        payload = {
            "recipient": {"id": recipient_id},
            "sender_action": "react",
            "payload": {
                "message_id": message_id,
                "reaction": emoji,
            },
        }
        
        return self._send_request(
            channel_account_id=channel_account_id,
            access_token=access_token,
            payload=payload,
            message_type="reaction",
        )
    
    def get_user_profile(
        self,
        user_id: str,
        *,
        access_token: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get Instagram user profile info.
        
        Returns: {name, profile_pic, username, follower_count, is_user_follow_business}
        """
        try:
            token_type = self._detect_token_type(access_token)
            if token_type == 'instagram':
                base = f"{self.BASE_URL_INSTAGRAM}/{self.API_VERSION}"
            else:
                base = self.BASE_URL
            url = f"{base}/{user_id}"
            params = {
                "fields": "name,profile_pic,username,follower_count,is_user_follow_business",
                "access_token": access_token,
            }
            
            response = self._session.get(
                url, params=params, timeout=self.REQUEST_TIMEOUT
            )
            
            if response.status_code == 200:
                return response.json()
            
            logger.warning(
                f"ig_profile_error user={user_id} "
                f"status={response.status_code}"
            )
            return None
            
        except Exception as e:
            logger.error(f"ig_profile_exception user={user_id}: {e}")
            return None
    
    # =========================================================================
    # Internal Methods
    # =========================================================================
    
    @staticmethod
    def _detect_token_type(access_token: str) -> str:
        """
        Detect whether the access token is from Instagram Login or Facebook Login.
        
        - IGA prefix → Instagram Login (uses graph.instagram.com)
        - EAA prefix → Facebook Login (uses graph.facebook.com)
        - Unknown    → Default to Facebook Login (legacy behavior)
        
        This is critical for multi-tenant systems where different businesses
        may connect via different OAuth flows.
        """
        if not access_token:
            return 'facebook'
        token_stripped = access_token.strip()
        if token_stripped.startswith('IGA'):
            return 'instagram'
        if token_stripped.startswith('EAA'):
            return 'facebook'
        # Unknown prefix — default to facebook (legacy)
        return 'facebook'
    
    def _resolve_send_url(
        self,
        channel_account_id: str,
        access_token: str,
    ) -> str:
        """
        Resolve the correct API URL for sending messages based on token type.
        
        Instagram Login (IGA tokens):
            POST https://graph.instagram.com/v21.0/<IG_ID>/messages
            - <IG_ID> is the Instagram Business Account ID (channel_account_id)
            
        Facebook Login (EAA tokens):  
            POST https://graph.facebook.com/v21.0/me/messages
            - Uses /me/messages with the Page Access Token
        
        See: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
        """
        token_type = self._detect_token_type(access_token)
        
        if token_type == 'instagram':
            # Instagram Login — use /me/messages to bypass ID sync issues
            return (
                f"{self.BASE_URL_INSTAGRAM}/{self.API_VERSION}"
                f"/me/messages"
            )
        else:
            # Facebook Login — use /me/messages with Page token
            return (
                f"{self.BASE_URL_FACEBOOK}/{self.API_VERSION}"
                f"/me/messages"
            )
    
    def _send_request(
        self,
        channel_account_id: str,
        access_token: str,
        payload: Dict[str, Any],
        message_type: str,
        skip_rate_limit: bool = False,
    ) -> SendResult:
        """
        Core send method — handles rate limiting, circuit breaking, and API call.
        
        All public send methods delegate to this method.
        
        Supports both token types:
        - IGA tokens → graph.instagram.com/<IG_ID>/messages
        - EAA tokens → graph.facebook.com/me/messages
        """
        start_time = time.time()
        
        # ─── Circuit Breaker Check ───
        cb = CircuitBreakerRegistry.get('instagram_api')
        if not cb.can_execute():
            return SendResult(
                success=False,
                status='failed',
                error='Instagram API circuit breaker is OPEN',
                error_code='CIRCUIT_BREAKER_OPEN',
            )
        
        # ─── Rate Limit Check ───
        if not skip_rate_limit:
            rate_ok, rate_remaining = self._check_rate_limit(channel_account_id)
            if not rate_ok:
                cb.record_failure()
                return SendResult(
                    success=False,
                    status='failed',
                    error=f'Rate limit exceeded for IGBA {channel_account_id[:15]}',
                    error_code='RATE_LIMITED',
                )
        
        # ─── Resolve correct API URL based on token type ───
        url = self._resolve_send_url(channel_account_id, access_token)
        token_type = self._detect_token_type(access_token)
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
        }
        
        logger.debug(
            f"ig_send_request type={message_type} "
            f"token_type={token_type} "
            f"url={url[:60]} "
            f"account={channel_account_id[:15]}"
        )
        
        try:
            response = self._session.post(
                url,
                json=payload,
                headers=headers,
                timeout=self.REQUEST_TIMEOUT,
            )
            
            latency_ms = (time.time() - start_time) * 1000
            
            # ─── Handle Response ───
            if response.status_code == 200:
                data = response.json()
                platform_message_id = data.get('message_id')
                
                # Record rate limit usage
                if not skip_rate_limit:
                    self._increment_rate_limit(channel_account_id)
                
                cb.record_success()
                
                logger.info(
                    f"ig_sent type={message_type} "
                    f"account={channel_account_id[:15]} "
                    f"mid={platform_message_id or 'N/A'} "
                    f"latency={latency_ms:.0f}ms"
                )
                
                return SendResult(
                    success=True,
                    status='sent',
                    platform_message_id=platform_message_id,
                    latency_ms=latency_ms,
                )
            
            # ─── Error Handling ───
            error_data = {}
            try:
                error_data = response.json().get('error', {})
            except Exception:
                pass
            
            error_msg = error_data.get('message', f'HTTP {response.status_code}')
            error_code = str(error_data.get('code', response.status_code))
            error_subcode = error_data.get('error_subcode')
            
            # Rate limit from API (429 or error code 4)
            if response.status_code == 429 or error_data.get('code') == 4:
                cb.record_failure()
                logger.warning(
                    f"ig_rate_limited account={channel_account_id[:15]} "
                    f"error={error_msg}"
                )
                return SendResult(
                    success=False,
                    status='failed',
                    error=f'Rate limited: {error_msg}',
                    error_code='RATE_LIMITED',
                    latency_ms=latency_ms,
                )
            
            # Non-retryable errors (400, 401, 403)
            non_retryable_codes = {400, 401, 403}
            is_retryable = response.status_code not in non_retryable_codes
            
            # Special handling for token errors — provide clear diagnostics
            if response.status_code == 401 or error_code == '190':
                logger.error(
                    f"ig_send_TOKEN_INVALID "
                    f"status={response.status_code} "
                    f"error={error_msg} code={error_code} "
                    f"token_type={token_type} "
                    f"token_prefix={access_token[:6] if access_token else 'NONE'} "
                    f"url={url[:80]} "
                    f"account={channel_account_id[:15]} "
                    f"HINT: IGA tokens require graph.instagram.com, "
                    f"EAA tokens require graph.facebook.com"
                )
                return SendResult(
                    success=False,
                    status='failed',
                    error=error_msg,
                    error_code='TOKEN_INVALID',
                    latency_ms=latency_ms,
                )
            
            if not is_retryable:
                logger.error(
                    f"ig_send_error_non_retryable "
                    f"status={response.status_code} "
                    f"error={error_msg} code={error_code}"
                )
            else:
                cb.record_failure()
                logger.warning(
                    f"ig_send_error_retryable "
                    f"status={response.status_code} "
                    f"error={error_msg}"
                )
            
            return SendResult(
                success=False,
                status='failed',
                error=error_msg,
                error_code=error_code,
                latency_ms=latency_ms,
            )
        
        except requests.Timeout:
            latency_ms = (time.time() - start_time) * 1000
            cb.record_failure()
            logger.error(
                f"ig_timeout account={channel_account_id[:15]} "
                f"latency={latency_ms:.0f}ms"
            )
            return SendResult(
                success=False,
                status='failed',
                error='Instagram API timeout',
                error_code='TIMEOUT',
                latency_ms=latency_ms,
            )
        
        except requests.ConnectionError as e:
            latency_ms = (time.time() - start_time) * 1000
            cb.record_failure()
            logger.error(f"ig_connection_error: {e}")
            return SendResult(
                success=False,
                status='failed',
                error=f'Connection error: {str(e)[:200]}',
                error_code='CONNECTION_ERROR',
                latency_ms=latency_ms,
            )
        
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            cb.record_failure()
            logger.error(f"ig_send_exception: {e}", exc_info=True)
            return SendResult(
                success=False,
                status='failed',
                error=str(e)[:200],
                error_code='INTERNAL_ERROR',
                latency_ms=latency_ms,
            )
    
    # =========================================================================
    # Rate Limiting (Redis Sliding Window)
    # =========================================================================
    
    def _check_rate_limit(
        self, channel_account_id: str
    ) -> tuple[bool, int]:
        """
        Check if we're within the rate limit for this IGBA.
        
        Returns:
            (allowed: bool, remaining: int)
        """
        if not self._redis:
            return True, self.RATE_LIMIT_MAX
        
        try:
            key = f"ig_rate:{channel_account_id}:{self._get_hour_bucket()}"
            current = int(self._redis.get(key) or 0)
            remaining = self.RATE_LIMIT_MAX - current
            
            if remaining <= 0:
                return False, 0
            
            if current >= self.RATE_LIMIT_WARN:
                logger.warning(
                    f"ig_rate_warn account={channel_account_id[:15]} "
                    f"used={current}/{self.RATE_LIMIT_MAX}"
                )
            
            return True, remaining
            
        except Exception as e:
            logger.warning(f"ig_rate_check_error: {e}")
            return True, self.RATE_LIMIT_MAX  # Fail open
    
    def _increment_rate_limit(self, channel_account_id: str) -> None:
        """Increment the rate limit counter for this IGBA."""
        if not self._redis:
            return
        
        try:
            key = f"ig_rate:{channel_account_id}:{self._get_hour_bucket()}"
            count = self._redis.incr(key)
            if count == 1:
                self._redis.expire(key, self.RATE_LIMIT_WINDOW)
        except Exception as e:
            logger.warning(f"ig_rate_incr_error: {e}")
    
    def get_rate_limit_status(
        self, channel_account_id: str
    ) -> Dict[str, Any]:
        """Get current rate limit status for monitoring."""
        if not self._redis:
            return {'available': True, 'used': 0, 'max': self.RATE_LIMIT_MAX}
        
        try:
            key = f"ig_rate:{channel_account_id}:{self._get_hour_bucket()}"
            current = int(self._redis.get(key) or 0)
            return {
                'available': current < self.RATE_LIMIT_MAX,
                'used': current,
                'max': self.RATE_LIMIT_MAX,
                'remaining': max(0, self.RATE_LIMIT_MAX - current),
                'reset_in_seconds': self._redis.ttl(key) or self.RATE_LIMIT_WINDOW,
            }
        except Exception:
            return {'available': True, 'used': -1, 'max': self.RATE_LIMIT_MAX}
    
    @staticmethod
    def _get_hour_bucket() -> str:
        """Get current hour bucket for rate limiting."""
        return datetime.now(timezone.utc).strftime('%Y%m%d%H')
