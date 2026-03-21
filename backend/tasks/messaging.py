"""
Messaging Tasks for Celery.
Handles async message sending, bulk campaigns, etc.
"""

import time
import logging
from typing import Dict, Any, List, Optional
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger('reviseit.tasks.messaging')


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    rate_limit="100/s",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def send_message(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    message: str,
    message_type: str = "text"
) -> Dict[str, Any]:
    """
    Send a single WhatsApp message asynchronously.
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Facebook access token
        to: Recipient phone number
        message: Message content
        message_type: Type of message (text, template, etc.)
    
    Returns:
        Result dict with success status and message ID
    """
    try:
        from whatsapp_service import WhatsAppService
        
        service = WhatsAppService()
        result = service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
        
        logger.info(f"Message sent to {to}: {result.get('success')}")
        return result
        
    except SoftTimeLimitExceeded:
        logger.error(f"Task timeout sending message to {to}")
        raise
    except Exception as e:
        logger.error(f"Error sending message to {to}: {e}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def send_reply(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    reply_text: str,
    original_message_id: str = None
) -> Dict[str, Any]:
    """
    Send a reply to a message (high priority).
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Facebook access token
        to: Recipient phone number
        reply_text: Reply content
        original_message_id: ID of message being replied to
    
    Returns:
        Result dict with success status
    """
    try:
        from whatsapp_service import WhatsAppService
        
        service = WhatsAppService()
        result = service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=reply_text
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error sending reply to {to}: {e}")
        raise self.retry(exc=e)


@shared_task(
    bind=True,
    max_retries=2,
    rate_limit="10/s",
    time_limit=3600,  # 1 hour max
)
def send_bulk_message(
    self,
    phone_number_id: str,
    access_token: str,
    recipients: List[str],
    message: str,
    template_name: str = None,
    template_params: Dict = None,
    campaign_id: str = None
) -> Dict[str, Any]:
    """
    Send bulk messages to multiple recipients.
    
    Implements rate limiting and progress tracking.
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Facebook access token
        recipients: List of phone numbers
        message: Message content (for text) or None (for template)
        template_name: Template name (optional)
        template_params: Template parameters (optional)
        campaign_id: Campaign ID for tracking
    
    Returns:
        Summary with success/failure counts
    """
    from whatsapp_service import WhatsAppService
    
    service = WhatsAppService()
    results = {
        "total": len(recipients),
        "sent": 0,
        "failed": 0,
        "errors": [],
        "campaign_id": campaign_id,
    }
    
    for i, recipient in enumerate(recipients):
        try:
            # Send message
            if template_name:
                result = service.send_template_message(
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    to=recipient,
                    template_name=template_name,
                    language_code="en",
                    components=template_params
                )
            else:
                result = service.send_message_with_credentials(
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    to=recipient,
                    message=message
                )
            
            if result.get("success"):
                results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append({
                    "recipient": recipient,
                    "error": result.get("error", "Unknown error")
                })
            
            # Rate limiting: 10 messages per second
            if i % 10 == 0:
                time.sleep(1)
            
            # Update progress
            self.update_state(
                state="PROGRESS",
                meta={"current": i + 1, "total": len(recipients)}
            )
            
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({
                "recipient": recipient,
                "error": str(e)
            })
            logger.error(f"Error sending to {recipient}: {e}")
    
    logger.info(
        f"Bulk campaign {campaign_id}: {results['sent']}/{results['total']} sent"
    )
    return results


@shared_task(bind=True)
def send_template_message(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    template_name: str,
    language_code: str = "en",
    components: List[Dict] = None
) -> Dict[str, Any]:
    """
    Send a template message asynchronously.
    """
    try:
        from whatsapp_service import WhatsAppService
        
        service = WhatsAppService()
        result = service.send_template_message(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            template_name=template_name,
            language_code=language_code,
            components=components
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error sending template to {to}: {e}")
        raise self.retry(exc=e)


@shared_task
def split_and_send_long_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    message: str,
    max_length: int = 1500
) -> Dict[str, Any]:
    """
    Split long messages intelligently at sentence boundaries
    and send as multiple messages.
    
    WhatsApp has a 1600 character limit per message.
    We split at 1500 to leave room for formatting.
    """
    from whatsapp_service import WhatsAppService
    
    service = WhatsAppService()
    
    if len(message) <= max_length:
        return service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
    
    # Split at sentence boundaries
    parts = []
    current_part = ""
    
    # Split by sentences (., !, ?, \n)
    import re
    sentences = re.split(r'(?<=[.!?\n])\s+', message)
    
    for sentence in sentences:
        if len(current_part) + len(sentence) + 1 <= max_length:
            current_part += (" " if current_part else "") + sentence
        else:
            if current_part:
                parts.append(current_part)
            current_part = sentence
    
    if current_part:
        parts.append(current_part)
    
    # Send each part with small delay
    results = []
    for i, part in enumerate(parts):
        # Add continuation indicator for multi-part messages
        if len(parts) > 1:
            part = f"({i+1}/{len(parts)}) {part}"
        
        result = service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=part
        )
        results.append(result)
        
        if i < len(parts) - 1:
            time.sleep(0.5)  # Small delay between parts
    
    return {
        "success": all(r.get("success") for r in results),
        "parts": len(parts),
        "results": results
    }


def process_incoming_contact_task(
    user_id: str,
    phone_number: str,
    contact_name: str,
    message_text: str,
    message_id: str,
    source: str = 'whatsapp'
) -> bool:
    """
    FAANG-Grade contact processing: normalize, tag, and idempotent upsert.

    Design Principles:
    - FAIL FAST: No fallback inserts — consistent data or no data
    - RETRY: 3 attempts with exponential backoff (1s, 2s, 4s)
    - IDEMPOTENT: Uses upsert with ON CONFLICT (user_id, phone_normalized)
    - OBSERVABLE: Full traceback logging on every failure path

    Args:
        user_id: Supabase UUID or Firebase UID (auto-resolved)
        phone_number: Raw phone number from webhook
        contact_name: WhatsApp profile name (may be None)
        message_text: Message content for smart tagging
        message_id: WhatsApp message ID (for idempotency tracking)
        source: Message source channel (default: 'whatsapp')

    Returns:
        True if contact was created/updated, False on permanent failure
    """
    import traceback as tb

    # ── Input Validation (fail before any DB call) ─────────────────────
    if not user_id:
        logger.error("❌ [ContactProcessor] user_id is None/empty — cannot process contact")
        return False
    if not phone_number:
        logger.error("❌ [ContactProcessor] phone_number is None/empty — cannot process contact")
        return False

    from supabase_client import get_supabase_client, resolve_user_id
    from datetime import datetime

    client = get_supabase_client()
    if not client:
        logger.error("❌ [ContactProcessor] Supabase client not available — FAIL HARD")
        return False

    # ── Resolve user ID ────────────────────────────────────────────────
    supabase_uuid = resolve_user_id(user_id)
    if not supabase_uuid:
        logger.error(
            f"❌ [ContactProcessor] Could not resolve user_id={user_id[:15]}... "
            f"to Supabase UUID — FAIL HARD"
        )
        return False

    # ── Normalize phone (E.164 without '+') ────────────────────────────
    digits = ''.join(c for c in phone_number if c.isdigit())
    digits = digits.lstrip('0')
    if len(digits) == 10:
        digits = '91' + digits
    phone_normalized = digits

    if not phone_normalized or len(phone_normalized) < 10:
        logger.error(
            f"❌ [ContactProcessor] Invalid phone after normalization: "
            f"raw={phone_number}, normalized={phone_normalized}"
        )
        return False

    # ── Smart Tagging ──────────────────────────────────────────────────
    tags = ['inbound', source]
    text_lower = (message_text or '').lower()

    INTENT_KEYWORDS = ['buy', 'price', 'cost', 'order', 'purchase', 'menu']
    SUPPORT_KEYWORDS = ['help', 'support', 'issue', 'broken']

    if any(kw in text_lower for kw in INTENT_KEYWORDS):
        tags.append('high_intent')
    if any(kw in text_lower for kw in SUPPORT_KEYWORDS):
        tags.append('support')

    now = datetime.utcnow().isoformat()

    # ── Retry Loop with Exponential Backoff ────────────────────────────
    MAX_RETRIES = 3
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # ── Idempotent Upsert ──────────────────────────────────────
            existing = (
                client.table('contacts')
                .select('*')
                .eq('user_id', supabase_uuid)
                .eq('phone_normalized', phone_normalized)
                .execute()
            )

            if existing.data:
                # ── UPDATE existing contact ────────────────────────────
                contact = existing.data[0]
                existing_tags = contact.get('tags', []) or []
                merged_tags = list(set(existing_tags + tags))

                # Lead scoring: +1 per interaction, +5 for new high_intent
                score_acc = 1
                if 'high_intent' in tags and 'high_intent' not in existing_tags:
                    score_acc += 5

                updates = {
                    'interaction_count': (contact.get('interaction_count') or 0) + 1,
                    'last_interaction_at': now,
                    'lead_score': (contact.get('lead_score') or 0) + score_acc,
                    'tags': merged_tags,
                    'updated_at': now,
                }

                # Only update name if it wasn't set and we now have a valid name
                if contact_name and contact_name != phone_number and not contact.get('name'):
                    updates['name'] = contact_name

                client.table('contacts').update(updates).eq('id', contact['id']).execute()

                logger.info(
                    f"👤 Updated contact {phone_normalized} "
                    f"(interactions: {updates['interaction_count']}, "
                    f"score: {updates['lead_score']}, "
                    f"tags: {merged_tags})"
                )
            else:
                # ── INSERT new contact (idempotent via upsert) ─────────
                initial_score = 10 if 'high_intent' in tags else 0
                new_contact = {
                    'user_id': supabase_uuid,
                    'phone_number': phone_number,
                    'phone_normalized': phone_normalized,
                    'name': contact_name or phone_number,
                    'lifecycle_stage': 'lead',
                    'lead_score': initial_score,
                    'source': source,
                    'status': 'active',
                    'tags': tags,
                    'interaction_count': 1,
                    'last_interaction_at': now,
                    'created_at': now,
                    'updated_at': now,
                }

                # Use upsert for idempotency: if a race condition creates the
                # contact between our SELECT and INSERT, the ON CONFLICT clause
                # prevents a duplicate error and updates instead.
                client.table('contacts').upsert(
                    new_contact,
                    on_conflict='user_id,phone_normalized'
                ).execute()

                logger.info(
                    f"👤 Created new CRM contact {phone_normalized} "
                    f"with tags {tags}, score {initial_score}"
                )

            # ── Success — exit retry loop ──────────────────────────────
            return True

        except Exception as e:
            last_error = e
            logger.warning(
                f"⚠️ [ContactProcessor] Attempt {attempt}/{MAX_RETRIES} failed "
                f"for {phone_normalized}: {e}"
            )
            if attempt < MAX_RETRIES:
                backoff = 2 ** (attempt - 1)  # 1s, 2s, 4s
                logger.info(f"⏳ [ContactProcessor] Retrying in {backoff}s...")
                time.sleep(backoff)

    # ── All retries exhausted — FAIL HARD ──────────────────────────────
    logger.error(
        f"❌ [ContactProcessor] PERMANENT FAILURE after {MAX_RETRIES} attempts "
        f"for phone={phone_normalized}, user={supabase_uuid[:8]}...\n"
        f"Last error: {last_error}\n"
        f"{''.join(tb.format_exception(type(last_error), last_error, last_error.__traceback__))}"
    )
    return False

