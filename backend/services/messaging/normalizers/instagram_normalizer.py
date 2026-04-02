"""
Instagram Webhook Normalizer
==============================

Converts Instagram webhook payloads into NormalizedMessage.

Instagram webhook structure:
    {
        "object": "instagram",
        "entry": [{
            "id": "<IGBA_ID>",
            "time": 1234567890,
            "messaging": [{
                "sender": {"id": "<IGSID>"},
                "recipient": {"id": "<IGBA_ID>"},
                "timestamp": 1234567890,
                "message": {
                    "mid": "<MESSAGE_ID>",
                    "text": "Hello"
                }
            }]
        }]
    }

Supported event types:
    - Text messages
    - Media messages (image, video, audio, file)
    - Story mentions / replies
    - Reel mentions
    - Quick reply postbacks
    - Reactions
    - Referrals (ads, links)
    - Message deletions (unsend)
    - Read receipts

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ..base import (
    Channel,
    MediaAttachment,
    MessageDirection,
    MessageStatus,
    MessageType,
    NormalizedMessage,
    ReactionData,
    ReferralData,
    ReferralSource,
    StoryData,
)

logger = logging.getLogger('flowauxi.messaging.normalizers.instagram')


class InstagramNormalizer:
    """
    Converts Instagram webhook payloads to NormalizedMessage objects.
    
    Usage:
        normalizer = InstagramNormalizer()
        messages = normalizer.normalize(webhook_payload)
        
        for msg in messages:
            # msg is a NormalizedMessage
            process(msg)
    """
    
    def normalize(self, payload: Dict[str, Any]) -> List[NormalizedMessage]:
        """
        Normalize an Instagram webhook payload.
        
        One webhook can contain multiple entries and messaging events.
        Returns a list of NormalizedMessage objects.
        """
        messages = []
        
        entries = payload.get('entry', [])
        for entry in entries:
            igba_id = entry.get('id', '')
            entry_time = entry.get('time', 0)
            
            messaging_events = entry.get('messaging', [])
            for event in messaging_events:
                try:
                    msg = self._normalize_event(event, igba_id, entry_time)
                    if msg:
                        messages.append(msg)
                except Exception as e:
                    logger.error(
                        f"ig_normalize_error igba={igba_id}: {e}",
                        exc_info=True,
                    )
        
        return messages
    
    def _normalize_event(
        self,
        event: Dict[str, Any],
        igba_id: str,
        entry_time: int,
    ) -> Optional[NormalizedMessage]:
        """Normalize a single messaging event."""
        sender_id = event.get('sender', {}).get('id', '')
        recipient_id = event.get('recipient', {}).get('id', '')
        timestamp = event.get('timestamp', entry_time)
        
        # Convert timestamp (seconds or milliseconds)
        if timestamp > 1e12:
            platform_ts = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        elif timestamp > 0:
            platform_ts = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        else:
            platform_ts = datetime.now(timezone.utc)
        
        # ─── Detect event type ───
        
        # Message event
        if 'message' in event:
            return self._normalize_message(
                event, sender_id, recipient_id, igba_id, platform_ts
            )
        
        # Postback (button click)
        if 'postback' in event:
            return self._normalize_postback(
                event, sender_id, recipient_id, igba_id, platform_ts
            )
        
        # Referral (ad click, link)
        if 'referral' in event:
            return self._normalize_referral(
                event, sender_id, recipient_id, igba_id, platform_ts
            )
        
        # Reaction
        if 'reaction' in event:
            return self._normalize_reaction(
                event, sender_id, recipient_id, igba_id, platform_ts
            )
        
        # Read receipt
        if 'read' in event:
            return self._normalize_read_receipt(
                event, sender_id, recipient_id, igba_id, platform_ts
            )
        
        logger.debug(f"ig_normalize_unknown_event keys={list(event.keys())}")
        return None
    
    def _normalize_message(
        self,
        event: Dict[str, Any],
        sender_id: str,
        recipient_id: str,
        igba_id: str,
        platform_ts: datetime,
    ) -> NormalizedMessage:
        """Normalize a message event (text, media, story mention, etc.)."""
        msg_data = event['message']
        mid = msg_data.get('mid', '')
        
        # Determine message type
        message_type, text, media, story_data = self._extract_content(msg_data)
        
        # Check for quick reply
        postback_payload = None
        postback_title = None
        if 'quick_reply' in msg_data:
            qr = msg_data['quick_reply']
            postback_payload = qr.get('payload')
            message_type = MessageType.QUICK_REPLY
        
        # Check for reply_to (threaded conversation)
        reply_to = None
        if 'reply_to' in msg_data:
            reply_to = msg_data['reply_to'].get('mid')
        
        # Check for referral in message
        referral_data = None
        if 'referral' in msg_data:
            referral_data = self._extract_referral(msg_data['referral'])
        
        # Is this a message echo (sent by the business)?
        is_echo = msg_data.get('is_echo', False)
        direction = (
            MessageDirection.OUTBOUND if is_echo
            else MessageDirection.INBOUND
        )
        
        return NormalizedMessage(
            channel=Channel.INSTAGRAM,
            direction=direction,
            channel_message_id=mid,
            channel_account_id=igba_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            message_type=message_type,
            text=text,
            media=media,
            story_data=story_data,
            referral_data=referral_data,
            postback_payload=postback_payload,
            postback_title=postback_title,
            reply_to_message_id=reply_to,
            status=(
                MessageStatus.SENT if is_echo
                else MessageStatus.RECEIVED
            ),
            platform_timestamp=platform_ts,
        )
    
    def _extract_content(
        self, msg_data: Dict[str, Any]
    ) -> Tuple[MessageType, Optional[str], Optional[MediaAttachment], Optional[StoryData]]:
        """Extract message type, text, media, and story data from message payload."""
        text = msg_data.get('text')
        media = None
        story_data = None
        message_type = MessageType.TEXT
        
        # ─── Attachments ───
        attachments = msg_data.get('attachments', [])
        if attachments:
            attachment = attachments[0]  # Primary attachment
            att_type = attachment.get('type', 'fallback')
            att_payload = attachment.get('payload', {})
            
            if att_type == 'image':
                message_type = MessageType.IMAGE
                media = MediaAttachment(
                    media_type='image',
                    media_url=att_payload.get('url'),
                )
            elif att_type == 'video':
                message_type = MessageType.VIDEO
                media = MediaAttachment(
                    media_type='video',
                    media_url=att_payload.get('url'),
                )
            elif att_type == 'audio':
                message_type = MessageType.AUDIO
                media = MediaAttachment(
                    media_type='audio',
                    media_url=att_payload.get('url'),
                )
            elif att_type == 'file':
                message_type = MessageType.DOCUMENT
                media = MediaAttachment(
                    media_type='document',
                    media_url=att_payload.get('url'),
                )
            elif att_type == 'story_mention':
                message_type = MessageType.STORY_MENTION
                story_data = StoryData(
                    story_url=att_payload.get('url'),
                    story_id=att_payload.get('story_id'),
                )
            elif att_type == 'reel':
                message_type = MessageType.REEL_MENTION
                story_data = StoryData(
                    reel_url=att_payload.get('url'),
                    reel_id=att_payload.get('reel_id'),
                )
            elif att_type == 'ig_reel':
                message_type = MessageType.REEL_MENTION
                story_data = StoryData(
                    reel_url=att_payload.get('url'),
                )
            elif att_type == 'share':
                # Shared post — store URL in text
                shared_url = att_payload.get('url', '')
                text = text or f"[Shared: {shared_url}]"
            elif att_type == 'sticker':
                message_type = MessageType.STICKER
                media = MediaAttachment(
                    media_type='sticker',
                    media_url=att_payload.get('url'),
                )
        
        # ─── Story reply (reply to a business's story) ───
        if msg_data.get('is_story_reply'):
            message_type = MessageType.STORY_REPLY
            if not story_data:
                story_data = StoryData(
                    story_url=msg_data.get('story_url'),
                )
        
        return message_type, text, media, story_data
    
    def _normalize_postback(
        self,
        event: Dict[str, Any],
        sender_id: str,
        recipient_id: str,
        igba_id: str,
        platform_ts: datetime,
    ) -> NormalizedMessage:
        """Normalize a postback event (button click)."""
        postback = event['postback']
        mid = postback.get('mid', f"postback_{sender_id}_{int(platform_ts.timestamp())}")
        
        return NormalizedMessage(
            channel=Channel.INSTAGRAM,
            direction=MessageDirection.INBOUND,
            channel_message_id=mid,
            channel_account_id=igba_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            message_type=MessageType.POSTBACK,
            text=postback.get('title'),
            postback_payload=postback.get('payload'),
            postback_title=postback.get('title'),
            platform_timestamp=platform_ts,
        )
    
    def _normalize_referral(
        self,
        event: Dict[str, Any],
        sender_id: str,
        recipient_id: str,
        igba_id: str,
        platform_ts: datetime,
    ) -> NormalizedMessage:
        """Normalize a referral event (ad click, link)."""
        referral = event['referral']
        referral_data = self._extract_referral(referral)
        
        return NormalizedMessage(
            channel=Channel.INSTAGRAM,
            direction=MessageDirection.INBOUND,
            channel_message_id=f"ref_{sender_id}_{int(platform_ts.timestamp())}",
            channel_account_id=igba_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            message_type=MessageType.REFERRAL,
            referral_data=referral_data,
            platform_timestamp=platform_ts,
        )
    
    def _normalize_reaction(
        self,
        event: Dict[str, Any],
        sender_id: str,
        recipient_id: str,
        igba_id: str,
        platform_ts: datetime,
    ) -> NormalizedMessage:
        """Normalize a reaction event."""
        reaction = event['reaction']
        
        return NormalizedMessage(
            channel=Channel.INSTAGRAM,
            direction=MessageDirection.INBOUND,
            channel_message_id=f"react_{sender_id}_{int(platform_ts.timestamp())}",
            channel_account_id=igba_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            message_type=MessageType.REACTION,
            reaction=ReactionData(
                emoji=reaction.get('emoji', ''),
                reacted_message_id=reaction.get('mid', ''),
                action=reaction.get('action', 'react'),
            ),
            platform_timestamp=platform_ts,
        )
    
    def _normalize_read_receipt(
        self,
        event: Dict[str, Any],
        sender_id: str,
        recipient_id: str,
        igba_id: str,
        platform_ts: datetime,
    ) -> Optional[NormalizedMessage]:
        """
        Read receipts are status updates, not new messages.
        We handle them differently — return None and let the
        webhook handler update message statuses directly.
        """
        logger.debug(
            f"ig_read_receipt sender={sender_id} "
            f"watermark={event.get('read', {}).get('watermark')}"
        )
        return None
    
    @staticmethod
    def _extract_referral(referral: Dict[str, Any]) -> ReferralData:
        """Extract referral data from referral object."""
        source_map = {
            'AD': ReferralSource.AD,
            'ORGANIC': ReferralSource.ORGANIC,
            'STORY': ReferralSource.STORY,
            'REEL': ReferralSource.REEL,
        }
        
        source_str = referral.get('source', 'UNKNOWN').upper()
        source = source_map.get(source_str, ReferralSource.UNKNOWN)
        
        return ReferralData(
            source=source,
            ad_id=referral.get('ad_id'),
            headline=referral.get('headline'),
            body=referral.get('body'),
            source_url=referral.get('source_url'),
            media_url=referral.get('media_url'),
        )
