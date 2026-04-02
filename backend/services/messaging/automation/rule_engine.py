"""
Automation Rule Engine — Keyword & Trigger Matching
=====================================================

Evaluates inbound messages against user-defined automation rules.

Rules are evaluated in priority order (highest first). First match wins.
Each rule has:
    - trigger_type: 'keyword', 'story_mention', 'reel_mention',
                    'first_message', 'regex', 'all'
    - trigger_config: Channel-specific match configuration
    - action_type: What to do when triggered
    - conditions: Optional time/channel/sender conditions
    - channels: Which channels this rule applies to

Trigger Types:
    keyword       — Match message text against keyword list
    regex         — Match message text against regex pattern
    story_mention — Triggered when someone mentions the business in a story
    reel_mention  — Triggered when someone mentions the business in a reel
    first_message — Triggered on first message from a new contact
    all           — Matches every inbound message (catch-all)

Action Types:
    reply_text      — Send a static text reply
    reply_media     — Send a media attachment
    start_flow      — Start a multi-step automation flow
    ai_response     — Generate AI-powered response
    assign_label    — Add a label to the conversation

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ..base import (
    Channel,
    MessageDirection,
    MessageType,
    NormalizedMessage,
)

logger = logging.getLogger('flowauxi.messaging.automation.rule_engine')


@dataclass
class RuleMatch:
    """Result of evaluating a message against an automation rule."""
    matched: bool
    rule_id: str = ""
    rule_name: str = ""
    action_type: str = ""
    action_config: Dict[str, Any] = field(default_factory=dict)
    trigger_type: str = ""
    matched_keyword: Optional[str] = None
    confidence: float = 1.0
    evaluation_time_ms: float = 0.0


class RuleEngine:
    """
    Priority-ordered rule matching engine.

    Rules are fetched from the database per tenant, cached in memory
    for the duration of a request, and evaluated in priority order.

    Usage:
        engine = RuleEngine(supabase_client)

        match = engine.evaluate(
            message=normalized_message,
            tenant_id="firebase_uid",
        )

        if match.matched:
            if match.action_type == 'reply_text':
                send_reply(match.action_config['message'])
            elif match.action_type == 'start_flow':
                start_flow(match.action_config['flow_id'])
            elif match.action_type == 'ai_response':
                ai_brain.generate(...)
    """

    # Cache rules per tenant (refresh every 60s)
    _cache: Dict[str, Tuple[List[Dict], float]] = {}
    CACHE_TTL = 60.0

    def __init__(self, supabase_client=None):
        self._db = supabase_client

    def evaluate(
        self,
        message: NormalizedMessage,
        tenant_id: str,
    ) -> RuleMatch:
        """
        Evaluate a message against all active rules for a tenant.

        Rules are checked in priority order (highest first).
        First match wins.

        Args:
            message: Inbound NormalizedMessage
            tenant_id: Firebase UID of the business

        Returns:
            RuleMatch — contains matched=True/False and action details
        """
        start = time.time()

        # Only evaluate inbound messages
        if message.direction != MessageDirection.INBOUND:
            return RuleMatch(matched=False)

        rules = self._get_rules(tenant_id)
        if not rules:
            return RuleMatch(matched=False)

        for rule in rules:
            try:
                # Check channel applicability
                rule_channels = rule.get('channels', ['instagram', 'whatsapp'])
                if message.channel.value not in rule_channels:
                    continue

                # Check conditions (time-based, etc.)
                if not self._check_conditions(
                    rule.get('conditions', []), message
                ):
                    continue

                # Evaluate trigger
                matched, keyword = self._evaluate_trigger(rule, message)

                if matched:
                    elapsed = (time.time() - start) * 1000
                    logger.info(
                        f"rule_matched rule_id={rule['id'][:15]} "
                        f"name={rule.get('name', 'N/A')} "
                        f"trigger={rule.get('trigger_type')} "
                        f"keyword={keyword or 'N/A'} "
                        f"eval_time={elapsed:.1f}ms"
                    )

                    # Increment trigger count (fire-and-forget)
                    self._increment_trigger_count(rule['id'])

                    return RuleMatch(
                        matched=True,
                        rule_id=rule['id'],
                        rule_name=rule.get('name', ''),
                        action_type=rule.get('action_type', ''),
                        action_config=rule.get('action_config', {}),
                        trigger_type=rule.get('trigger_type', ''),
                        matched_keyword=keyword,
                        evaluation_time_ms=elapsed,
                    )

            except Exception as e:
                logger.error(
                    f"rule_eval_error rule_id={rule.get('id', '?')}: {e}"
                )
                continue

        elapsed = (time.time() - start) * 1000
        return RuleMatch(matched=False, evaluation_time_ms=elapsed)

    # =====================================================================
    # Trigger Evaluation
    # =====================================================================

    def _evaluate_trigger(
        self,
        rule: Dict[str, Any],
        message: NormalizedMessage,
    ) -> Tuple[bool, Optional[str]]:
        """
        Evaluate a single trigger against a message.

        Returns:
            (matched: bool, matched_keyword: str | None)
        """
        trigger_type = rule.get('trigger_type', '')
        config = rule.get('trigger_config', {})

        if trigger_type == 'keyword':
            return self._match_keyword(config, message)

        elif trigger_type == 'regex':
            return self._match_regex(config, message)

        elif trigger_type == 'story_mention':
            matched = message.message_type == MessageType.STORY_MENTION
            return matched, None

        elif trigger_type == 'story_reply':
            matched = message.message_type == MessageType.STORY_REPLY
            return matched, None

        elif trigger_type == 'reel_mention':
            matched = message.message_type == MessageType.REEL_MENTION
            return matched, None

        elif trigger_type == 'first_message':
            return self._match_first_message(message)

        elif trigger_type == 'referral':
            matched = message.message_type == MessageType.REFERRAL
            return matched, None

        elif trigger_type == 'postback':
            return self._match_postback(config, message)

        elif trigger_type == 'all':
            return True, None

        logger.debug(f"rule_unknown_trigger type={trigger_type}")
        return False, None

    def _match_keyword(
        self,
        config: Dict[str, Any],
        message: NormalizedMessage,
    ) -> Tuple[bool, Optional[str]]:
        """
        Match message text against keyword list.

        Config:
            {
                "keywords": ["hi", "hello", "hey"],
                "match_type": "contains" | "exact" | "starts_with"
            }
        """
        text = (message.text or '').strip().lower()
        if not text:
            return False, None

        keywords = config.get('keywords', [])
        match_type = config.get('match_type', 'contains')

        for keyword in keywords:
            kw = keyword.strip().lower()
            if not kw:
                continue

            if match_type == 'exact':
                if text == kw:
                    return True, keyword
            elif match_type == 'starts_with':
                if text.startswith(kw):
                    return True, keyword
            else:  # contains (default)
                if kw in text:
                    return True, keyword

        return False, None

    def _match_regex(
        self,
        config: Dict[str, Any],
        message: NormalizedMessage,
    ) -> Tuple[bool, Optional[str]]:
        """
        Match message text against regex pattern.

        Config:
            {"pattern": "order\\s*#?\\d+", "flags": "i"}
        """
        text = message.text or ''
        pattern = config.get('pattern', '')
        if not pattern:
            return False, None

        flags_str = config.get('flags', 'i')
        flags = 0
        if 'i' in flags_str:
            flags |= re.IGNORECASE

        try:
            match = re.search(pattern, text, flags)
            if match:
                return True, match.group(0)
        except re.error as e:
            logger.warning(f"rule_regex_error pattern={pattern}: {e}")

        return False, None

    def _match_first_message(
        self,
        message: NormalizedMessage,
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if this is the first message from this contact.
        Looks up unified_conversations to see if contact exists.
        """
        if not self._db or not message.tenant_id:
            return False, None

        try:
            result = self._db.table('unified_conversations').select(
                'id', count='exact'
            ).eq(
                'user_id', message.tenant_id
            ).eq(
                'channel', message.channel.value
            ).eq(
                'contact_platform_id', message.sender_id
            ).execute()

            is_new = (result.count or 0) == 0
            return is_new, None

        except Exception:
            return False, None

    def _match_postback(
        self,
        config: Dict[str, Any],
        message: NormalizedMessage,
    ) -> Tuple[bool, Optional[str]]:
        """
        Match postback payload.

        Config:
            {"payloads": ["GET_STARTED", "MENU"]}
        """
        if not message.postback_payload:
            return False, None

        payloads = config.get('payloads', [])
        for payload in payloads:
            if message.postback_payload == payload:
                return True, payload

        return False, None

    # =====================================================================
    # Condition Evaluation
    # =====================================================================

    def _check_conditions(
        self,
        conditions: List[Dict[str, Any]],
        message: NormalizedMessage,
    ) -> bool:
        """
        Evaluate optional conditions.
        ALL conditions must pass (AND logic).

        Condition format:
            {"field": "time", "op": "between", "value": ["09:00", "17:00"]}
            {"field": "channel", "op": "eq", "value": "instagram"}
            {"field": "message_type", "op": "in", "value": ["text", "image"]}
        """
        if not conditions:
            return True

        for cond in conditions:
            field_name = cond.get('field', '')
            op = cond.get('op', '')
            value = cond.get('value')

            try:
                if field_name == 'time':
                    if not self._check_time_condition(op, value):
                        return False

                elif field_name == 'channel':
                    if op == 'eq' and message.channel.value != value:
                        return False
                    elif op == 'in' and message.channel.value not in value:
                        return False

                elif field_name == 'message_type':
                    if op == 'eq' and message.message_type.value != value:
                        return False
                    elif (op == 'in'
                          and message.message_type.value not in value):
                        return False

                elif field_name == 'day_of_week':
                    today = datetime.now(timezone.utc).strftime('%A').lower()
                    if op == 'in' and today not in [
                        d.lower() for d in value
                    ]:
                        return False
            except Exception:
                continue

        return True

    @staticmethod
    def _check_time_condition(op: str, value: Any) -> bool:
        """Check time-based condition (e.g., business hours)."""
        now = datetime.now(timezone.utc)
        current_time = now.strftime('%H:%M')

        if op == 'between' and isinstance(value, list) and len(value) == 2:
            start_time, end_time = value[0], value[1]
            if start_time <= end_time:
                return start_time <= current_time <= end_time
            else:
                return current_time >= start_time or current_time <= end_time

        return True

    # =====================================================================
    # Rule Loading (with caching)
    # =====================================================================

    def _get_rules(self, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Get active rules for a tenant, sorted by priority (highest first).
        Results are cached for CACHE_TTL seconds.
        """
        now = time.time()
        cached = self._cache.get(tenant_id)
        if cached and (now - cached[1]) < self.CACHE_TTL:
            return cached[0]

        if not self._db:
            return []

        try:
            result = self._db.table('automation_rules').select('*').eq(
                'user_id', tenant_id
            ).eq('is_active', True).order(
                'priority', desc=True
            ).execute()

            rules = result.data or []
            self._cache[tenant_id] = (rules, now)
            return rules
        except Exception as e:
            logger.error(f"rule_load_error tenant={tenant_id[:15]}: {e}")
            return cached[0] if cached else []

    def _increment_trigger_count(self, rule_id: str) -> None:
        """Fire-and-forget: increment rule trigger count."""
        if not self._db:
            return
        try:
            self._db.rpc('increment_rule_trigger', {
                'p_rule_id': rule_id
            }).execute()
        except Exception:
            # Non-critical — best effort
            try:
                self._db.table('automation_rules').update({
                    'last_triggered_at': datetime.now(timezone.utc).isoformat(),
                }).eq('id', rule_id).execute()
            except Exception:
                pass

    def invalidate_cache(self, tenant_id: str) -> None:
        """Clear cached rules for a tenant (after rule CRUD)."""
        self._cache.pop(tenant_id, None)


# =========================================================================
# Singleton
# =========================================================================

_engine_instance: Optional[RuleEngine] = None


def get_rule_engine() -> RuleEngine:
    """Get singleton RuleEngine instance."""
    global _engine_instance
    if _engine_instance is None:
        db = None
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
        except Exception:
            pass
        _engine_instance = RuleEngine(supabase_client=db)
        logger.info("⚡ RuleEngine initialized")
    return _engine_instance
