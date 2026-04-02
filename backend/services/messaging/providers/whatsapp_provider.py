"""
WhatsApp Messaging Provider — Adapter for Existing WhatsAppService
===================================================================

Wraps the existing WhatsAppService (whatsapp_service.py) into the 
unified MessageProvider interface.

This is an ADAPTER, not a rewrite. The battle-tested WhatsAppService
continues to handle all actual API calls. This provider translates
between NormalizedMessage and WhatsAppService's native API.

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from ..base import (
    Channel,
    MediaAttachment,
    MessageProvider,
    QuickReply,
    SendResult,
)
from ..circuit_breaker import CircuitBreakerRegistry

logger = logging.getLogger('flowauxi.messaging.providers.whatsapp')


class WhatsAppProvider(MessageProvider):
    """
    WhatsApp Cloud API provider — adapts existing WhatsAppService.
    
    The existing WhatsAppService (1107 lines, battle-tested) handles:
    - Message sending (text, image, interactive, templates)
    - Typing indicators
    - Read receipts
    - Rate limiting
    
    This adapter translates between the unified MessageProvider interface
    and WhatsAppService's native methods.
    """
    
    def __init__(self, whatsapp_service=None):
        """
        Args:
            whatsapp_service: Existing WhatsAppService instance.
                If None, will be lazy-loaded on first use.
        """
        self._whatsapp_service = whatsapp_service
    
    @property
    def channel(self) -> Channel:
        return Channel.WHATSAPP
    
    @property
    def _service(self):
        """Lazy-load WhatsAppService."""
        if self._whatsapp_service is None:
            try:
                from whatsapp_service import WhatsAppService
                self._whatsapp_service = WhatsAppService()
                logger.info("WhatsAppProvider: lazy-loaded WhatsAppService")
            except ImportError as e:
                logger.error(f"WhatsAppProvider: cannot import WhatsAppService: {e}")
                raise
        return self._whatsapp_service
    
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
        """Send a text message via WhatsApp Cloud API."""
        try:
            result = self._service.send_message_with_credentials(
                phone_number_id=channel_account_id,
                access_token=access_token,
                to=self._normalize_phone(recipient_id),
                message=text,
            )
            return self._to_send_result(result)
        except Exception as e:
            return self._error_result(e)
    
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
        """Send a media message via WhatsApp Cloud API."""
        try:
            result = self._service.send_image_with_credentials(
                phone_number_id=channel_account_id,
                access_token=access_token,
                to=self._normalize_phone(recipient_id),
                image_url=media.media_url or "",
                caption=caption or media.caption or "",
            )
            return self._to_send_result(result)
        except Exception as e:
            return self._error_result(e)
    
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
        Send interactive buttons via WhatsApp.
        
        WhatsApp uses interactive reply buttons (max 3)
        instead of quick replies (max 13 on IG).
        """
        try:
            # WhatsApp supports max 3 interactive buttons
            buttons = [
                {
                    "type": "reply",
                    "reply": {
                        "id": qr.payload[:256],
                        "title": qr.title[:20],
                    }
                }
                for qr in quick_replies[:3]
            ]
            
            result = self._service.send_interactive_with_credentials(
                phone_number_id=channel_account_id,
                access_token=access_token,
                to=self._normalize_phone(recipient_id),
                interactive_type="button",
                body_text=text,
                buttons=buttons,
            )
            return self._to_send_result(result)
        except AttributeError:
            # Fallback: send as text with numbered options
            options_text = "\n".join(
                f"{i+1}. {qr.title}" for i, qr in enumerate(quick_replies)
            )
            return self.send_text(
                recipient_id=recipient_id,
                text=f"{text}\n\n{options_text}",
                access_token=access_token,
                channel_account_id=channel_account_id,
            )
        except Exception as e:
            return self._error_result(e)
    
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
        """Send a template message via WhatsApp."""
        try:
            result = self._service.send_template_with_credentials(
                phone_number_id=channel_account_id,
                access_token=access_token,
                to=self._normalize_phone(recipient_id),
                template_name=template_name,
                language_code=language_code,
                components=components or [],
            )
            return self._to_send_result(result)
        except AttributeError:
            # Template method might not exist in older WhatsAppService
            return self.send_text(
                recipient_id=recipient_id,
                text=f"[Template: {template_name}]",
                access_token=access_token,
                channel_account_id=channel_account_id,
            )
        except Exception as e:
            return self._error_result(e)
    
    def mark_seen(
        self,
        sender_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        message_id: Optional[str] = None,
        **kwargs,
    ) -> SendResult:
        """Mark a message as read on WhatsApp."""
        try:
            if message_id and hasattr(self._service, 'mark_message_read'):
                self._service.mark_message_read(
                    phone_number_id=channel_account_id,
                    access_token=access_token,
                    message_id=message_id,
                )
            return SendResult(success=True, status='sent')
        except Exception as e:
            return self._error_result(e)
    
    def send_typing_indicator(
        self,
        recipient_id: str,
        *,
        access_token: str,
        channel_account_id: str,
        **kwargs,
    ) -> SendResult:
        """Show typing indicator on WhatsApp."""
        try:
            if hasattr(self._service, 'send_typing_indicator'):
                self._service.send_typing_indicator(
                    phone_number_id=channel_account_id,
                    access_token=access_token,
                    to=self._normalize_phone(recipient_id),
                )
            return SendResult(success=True, status='sent')
        except Exception as e:
            return self._error_result(e)
    
    # =========================================================================
    # Helpers
    # =========================================================================
    
    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Normalize phone number for WhatsApp API (digits only)."""
        return phone.replace('+', '').replace(' ', '').replace('-', '')
    
    @staticmethod
    def _to_send_result(result: Dict[str, Any]) -> SendResult:
        """Convert WhatsAppService result dict to SendResult."""
        if result.get('success', False):
            return SendResult(
                success=True,
                status='sent',
                platform_message_id=result.get('message_id'),
            )
        return SendResult(
            success=False,
            status='failed',
            error=result.get('error', 'Unknown error'),
            error_code=str(result.get('error_code') or result.get('status_code', '')),
        )
    
    @staticmethod
    def _error_result(error: Exception) -> SendResult:
        """Convert exception to SendResult."""
        return SendResult(
            success=False,
            status='failed',
            error=str(error)[:200],
            error_code='PROVIDER_EXCEPTION',
        )
