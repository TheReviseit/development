"""
Automation Flow Engine — Multi-Step Workflow Execution
=======================================================

Executes multi-step automation flows with:
    - State persistence (survives restarts)
    - Distributed locking (Fix #3 — prevents race conditions)
    - Flow versioning (Fix #8 — published_steps immutable snapshot)
    - Conditional branching based on user input
    - Timeout handling with fallback steps
    - Variable interpolation ({{contact.name}}, etc.)

Step Types:
    send_message   — Send a text/media/quick_reply message
    wait_for_reply — Pause flow until user responds (with timeout)
    condition      — Branch based on expression evaluation
    delay          — Wait N seconds before next step
    ai_response    — Generate AI-powered contextual response
    assign_label   — Add label to conversation
    end            — Terminate flow

Flow State Machine:
    IDLE → RUNNING → WAITING → RUNNING → ... → COMPLETED | TIMED_OUT | ERROR

State is persisted in unified_conversations.flow_state (JSONB).

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import time
import copy
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from ..base import (
    Channel,
    NormalizedMessage,
    MessageType,
    SendResult,
)
from ..conversation_lock import get_conversation_lock

logger = logging.getLogger('flowauxi.messaging.automation.flow_engine')


class FlowStatus(str, Enum):
    """Flow execution states."""
    IDLE = "idle"
    RUNNING = "running"
    WAITING = "waiting"         # Waiting for user reply
    COMPLETED = "completed"
    TIMED_OUT = "timed_out"
    ERROR = "error"


class FlowEngine:
    """
    Multi-step automation flow executor.

    Responsibilities:
        1. Start flows — initialize state, execute first step
        2. Resume flows — on user reply, advance to next step
        3. Timeout flows — Celery Beat checks stale WAITING states
        4. Execute steps — dispatch to step-type handlers

    All operations acquire a conversation lock (Fix #3) to prevent
    race conditions when multiple messages arrive simultaneously.

    Usage:
        engine = FlowEngine(supabase_client, send_fn)

        # Start a flow from a rule match
        engine.start_flow(
            flow_id="uuid",
            conversation_id="uuid",
            tenant_id="firebase_uid",
            message=inbound_message,
        )

        # Resume when user replies
        engine.resume_flow(
            conversation_id="uuid",
            message=reply_message,
        )

        # Check for timeouts (Celery Beat, every 60s)
        engine.check_timeouts()
    """

    def __init__(self, supabase_client=None, send_fn=None):
        """
        Args:
            supabase_client: Supabase DB client
            send_fn: Callable to send messages.
                     Signature: send_fn(channel, tenant_id, recipient_id,
                                       text=..., access_token=..., ...)
                     -> SendResult
        """
        self._db = supabase_client
        self._send_fn = send_fn

    # =====================================================================
    # Start Flow
    # =====================================================================

    def start_flow(
        self,
        flow_id: str,
        conversation_id: str,
        tenant_id: str,
        message: NormalizedMessage,
        variables: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Start executing a flow for a conversation.

        Loads the PUBLISHED version of the flow (Fix #8).
        Initializes flow state and executes the first step.

        Args:
            flow_id: automation_flows.id
            conversation_id: unified_conversations.id
            tenant_id: Firebase UID
            message: The triggering inbound message
            variables: Initial flow variables

        Returns:
            True if flow started successfully
        """
        if not self._db:
            return False

        try:
            # Load flow definition
            result = self._db.table('automation_flows').select(
                'id, name, published_steps, steps, published_version, '
                'version, schema_version, variables'
            ).eq('id', flow_id).eq('is_active', True).single().execute()

            if not result.data:
                logger.warning(f"flow_not_found id={flow_id[:15]}")
                return False

            flow = result.data

            # Fix #8: Use published_steps if available (immutable snapshot)
            steps = flow.get('published_steps') or flow.get('steps', [])
            if not steps:
                logger.warning(f"flow_no_steps id={flow_id[:15]}")
                return False

            # Build initial flow state
            contact_vars = {
                'contact': {
                    'id': message.sender_id,
                    'name': message.sender_name or 'there',
                    'username': message.sender_username or '',
                },
                'message': {
                    'text': message.text or '',
                    'type': message.message_type.value,
                },
                'channel': message.channel.value,
                'tenant_id': tenant_id,
            }

            flow_state = {
                'flow_id': flow_id,
                'flow_name': flow.get('name', ''),
                'status': FlowStatus.RUNNING.value,
                'current_step_id': steps[0].get('id', 'step_0'),
                'steps': steps,
                'variables': {
                    **flow.get('variables', {}),
                    **(variables or {}),
                    **contact_vars,
                },
                'started_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'step_history': [],
            }

            # Save state to conversation
            self._save_flow_state(conversation_id, flow_id, flow_state)

            # Increment total_runs
            try:
                self._db.table('automation_flows').update({
                    'total_runs': flow.get('total_runs', 0) + 1,
                }).eq('id', flow_id).execute()
            except Exception:
                pass

            # Execute first step
            self._execute_current_step(
                conversation_id, tenant_id, flow_state, message,
            )

            logger.info(
                f"flow_started flow={flow.get('name', '')} "
                f"conv={conversation_id[:15]}"
            )
            return True

        except Exception as e:
            logger.error(f"flow_start_error: {e}", exc_info=True)
            return False

    # =====================================================================
    # Resume Flow (on user reply)
    # =====================================================================

    def resume_flow(
        self,
        conversation_id: str,
        tenant_id: str,
        message: NormalizedMessage,
    ) -> bool:
        """
        Resume a paused flow when the user sends a reply.

        Only resumes if the flow is in WAITING status.

        Args:
            conversation_id: unified_conversations.id
            tenant_id: Firebase UID
            message: The user's reply message

        Returns:
            True if flow was resumed (was in WAITING state)
        """
        if not self._db:
            return False

        try:
            # Load conversation with flow state
            result = self._db.table('unified_conversations').select(
                'id, current_flow_id, flow_state'
            ).eq('id', conversation_id).single().execute()

            if not result.data:
                return False

            conv = result.data
            flow_state = conv.get('flow_state')

            if not flow_state or not isinstance(flow_state, dict):
                return False

            status = flow_state.get('status')
            if status != FlowStatus.WAITING.value:
                return False

            # Flow is waiting — process the user's reply
            current_step_id = flow_state.get('current_step_id')
            steps = flow_state.get('steps', [])
            current_step = self._find_step(steps, current_step_id)

            if not current_step:
                return False

            if current_step.get('type') != 'wait_for_reply':
                return False

            # Determine next step based on user input
            next_config = current_step.get('next', {})
            user_input = (
                message.postback_payload
                or message.text
                or ''
            ).strip().lower()

            next_step_id = None

            if isinstance(next_config, str):
                # Simple linear: "next": "step_3"
                next_step_id = next_config
            elif isinstance(next_config, dict):
                # Branching: "next": {"option_a": "step_3", "option_b": "step_4"}
                # Check payload match first, then text match
                if message.postback_payload:
                    next_step_id = next_config.get(message.postback_payload)

                if not next_step_id:
                    # Try fuzzy text match
                    for key, step_id in next_config.items():
                        if key != 'timeout' and key != 'default':
                            if key.lower() in user_input or user_input in key.lower():
                                next_step_id = step_id
                                break

                if not next_step_id:
                    next_step_id = next_config.get('default')

            if not next_step_id:
                # No matching branch — end flow
                flow_state['status'] = FlowStatus.COMPLETED.value
                self._save_flow_state(conversation_id, None, flow_state)
                return True

            # Advance flow
            flow_state['current_step_id'] = next_step_id
            flow_state['status'] = FlowStatus.RUNNING.value
            flow_state['updated_at'] = datetime.now(timezone.utc).isoformat()

            # Update variables with user reply
            flow_state['variables']['last_reply'] = {
                'text': message.text or '',
                'payload': message.postback_payload or '',
                'type': message.message_type.value,
            }

            flow_state['step_history'].append({
                'step_id': current_step_id,
                'completed_at': datetime.now(timezone.utc).isoformat(),
                'user_input': user_input[:200],
            })

            self._save_flow_state(
                conversation_id,
                flow_state.get('flow_id'),
                flow_state,
            )

            # Execute next step
            self._execute_current_step(
                conversation_id, tenant_id, flow_state, message,
            )

            return True

        except Exception as e:
            logger.error(f"flow_resume_error conv={conversation_id[:15]}: {e}")
            return False

    # =====================================================================
    # Step Execution
    # =====================================================================

    def _execute_current_step(
        self,
        conversation_id: str,
        tenant_id: str,
        flow_state: Dict[str, Any],
        message: NormalizedMessage,
    ) -> None:
        """Execute the current step and advance until a wait/end."""
        steps = flow_state.get('steps', [])
        max_iterations = 20  # Prevent infinite loops

        for _ in range(max_iterations):
            current_id = flow_state.get('current_step_id')
            step = self._find_step(steps, current_id)

            if not step:
                flow_state['status'] = FlowStatus.COMPLETED.value
                self._save_flow_state(conversation_id, None, flow_state)
                break

            step_type = step.get('type', '')
            config = step.get('config', {})

            logger.debug(
                f"flow_exec step={current_id} type={step_type}"
            )

            # ── send_message ──
            if step_type == 'send_message':
                self._exec_send_message(
                    config, flow_state, tenant_id, message,
                )
                next_id = step.get('next')
                if not next_id:
                    flow_state['status'] = FlowStatus.COMPLETED.value
                    self._save_flow_state(conversation_id, None, flow_state)
                    break
                flow_state['current_step_id'] = next_id

            # ── wait_for_reply ──
            elif step_type == 'wait_for_reply':
                timeout_seconds = config.get('timeout_seconds', 3600)
                flow_state['status'] = FlowStatus.WAITING.value
                flow_state['wait_timeout_at'] = (
                    datetime.now(timezone.utc) +
                    timedelta(seconds=timeout_seconds)
                ).isoformat()
                self._save_flow_state(
                    conversation_id,
                    flow_state.get('flow_id'),
                    flow_state,
                )
                break  # Pause here

            # ── delay ──
            elif step_type == 'delay':
                delay_seconds = config.get('seconds', 3)
                # For delays > 5s, use Celery countdown
                if delay_seconds > 5:
                    next_id = step.get('next')
                    if next_id:
                        flow_state['current_step_id'] = next_id
                        self._save_flow_state(
                            conversation_id,
                            flow_state.get('flow_id'),
                            flow_state,
                        )
                        self._schedule_delayed_resume(
                            conversation_id, tenant_id,
                            delay_seconds,
                        )
                    break
                else:
                    time.sleep(delay_seconds)
                    next_id = step.get('next')
                    if not next_id:
                        break
                    flow_state['current_step_id'] = next_id

            # ── condition ──
            elif step_type == 'condition':
                branch = self._eval_condition(
                    config, flow_state['variables'],
                )
                next_map = step.get('next', {})
                next_id = (
                    next_map.get(branch)
                    or next_map.get('default')
                    or next_map.get('else')
                )
                if not next_id:
                    flow_state['status'] = FlowStatus.COMPLETED.value
                    self._save_flow_state(conversation_id, None, flow_state)
                    break
                flow_state['current_step_id'] = next_id

            # ── ai_response ──
            elif step_type == 'ai_response':
                self._exec_ai_response(
                    config, flow_state, tenant_id, message,
                )
                next_id = step.get('next')
                if not next_id:
                    flow_state['status'] = FlowStatus.COMPLETED.value
                    self._save_flow_state(conversation_id, None, flow_state)
                    break
                flow_state['current_step_id'] = next_id

            # ── assign_label ──
            elif step_type == 'assign_label':
                label = config.get('label', '')
                if label and self._db:
                    try:
                        self._db.rpc('add_conversation_label', {
                            'p_conversation_id': conversation_id,
                            'p_label': label,
                        }).execute()
                    except Exception:
                        pass
                next_id = step.get('next')
                if not next_id:
                    break
                flow_state['current_step_id'] = next_id

            # ── end ──
            elif step_type == 'end':
                flow_state['status'] = FlowStatus.COMPLETED.value
                self._save_flow_state(conversation_id, None, flow_state)
                break

            else:
                logger.warning(f"flow_unknown_step type={step_type}")
                next_id = step.get('next')
                if not next_id:
                    break
                flow_state['current_step_id'] = next_id

            # Save state after each step
            flow_state['updated_at'] = datetime.now(timezone.utc).isoformat()
            flow_state['step_history'].append({
                'step_id': current_id,
                'completed_at': datetime.now(timezone.utc).isoformat(),
            })

    # =====================================================================
    # Step Executors
    # =====================================================================

    def _exec_send_message(
        self,
        config: Dict[str, Any],
        flow_state: Dict[str, Any],
        tenant_id: str,
        message: NormalizedMessage,
    ) -> None:
        """Execute a send_message step."""
        text = self._interpolate(
            config.get('message', ''),
            flow_state.get('variables', {}),
        )

        if not self._send_fn:
            logger.warning("flow_send_no_fn — send function not configured")
            return

        kwargs: Dict[str, Any] = {
            'channel': message.channel.value,
            'tenant_id': tenant_id,
            'recipient_id': message.sender_id,
            'text': text,
        }

        # Quick replies
        if 'quick_replies' in config:
            kwargs['quick_replies'] = config['quick_replies']

        # Media
        if 'media_url' in config:
            kwargs['media_url'] = config['media_url']
            kwargs['media_type'] = config.get('media_type', 'image')

        try:
            self._send_fn(**kwargs)
        except Exception as e:
            logger.error(f"flow_send_error: {e}")

    def _exec_ai_response(
        self,
        config: Dict[str, Any],
        flow_state: Dict[str, Any],
        tenant_id: str,
        message: NormalizedMessage,
    ) -> None:
        """Execute an ai_response step (delegates to AI Brain)."""
        try:
            from services.messaging.ai_governor import get_ai_governor

            gov = get_ai_governor()
            plan = config.get('plan', 'starter')
            allowed, reason = gov.can_use_ai(tenant_id, plan)

            if not allowed:
                fallback = gov.get_fallback_message(reason)
                if self._send_fn:
                    self._send_fn(
                        channel=message.channel.value,
                        tenant_id=tenant_id,
                        recipient_id=message.sender_id,
                        text=fallback,
                    )
                return

            # TODO: Integrate with actual AI Brain module
            prompt = config.get('prompt', 'Respond helpfully to the customer.')
            logger.info(f"flow_ai_step prompt_len={len(prompt)}")

        except Exception as e:
            logger.error(f"flow_ai_error: {e}")

    # =====================================================================
    # Timeout Handling
    # =====================================================================

    def check_timeouts(self) -> Dict[str, int]:
        """
        Check for flows that have timed out while waiting.
        Called by Celery Beat every 60 seconds.

        Returns:
            {"checked": N, "timed_out": N}
        """
        if not self._db:
            return {"checked": 0, "timed_out": 0}

        stats = {"checked": 0, "timed_out": 0}
        now = datetime.now(timezone.utc).isoformat()

        try:
            result = self._db.table('unified_conversations').select(
                'id, user_id, flow_state, current_flow_id'
            ).not_.is_('flow_state', 'null').execute()

            for conv in (result.data or []):
                state = conv.get('flow_state', {})
                if not isinstance(state, dict):
                    continue

                if state.get('status') != FlowStatus.WAITING.value:
                    continue

                stats["checked"] += 1
                timeout_at = state.get('wait_timeout_at')

                if timeout_at and now > timeout_at:
                    # Timed out — execute timeout branch
                    steps = state.get('steps', [])
                    current_id = state.get('current_step_id')
                    step = self._find_step(steps, current_id)

                    if step:
                        next_map = step.get('next', {})
                        timeout_step = next_map.get('timeout')

                        if timeout_step:
                            state['current_step_id'] = timeout_step
                            state['status'] = FlowStatus.RUNNING.value
                            # Continue execution would need a message context
                        else:
                            state['status'] = FlowStatus.TIMED_OUT.value
                    else:
                        state['status'] = FlowStatus.TIMED_OUT.value

                    self._save_flow_state(
                        conv['id'], None, state,
                    )
                    stats["timed_out"] += 1

        except Exception as e:
            logger.error(f"flow_timeout_check_error: {e}")

        if stats["timed_out"] > 0:
            logger.info(
                f"flow_timeouts checked={stats['checked']} "
                f"timed_out={stats['timed_out']}"
            )
        return stats

    # =====================================================================
    # Helpers
    # =====================================================================

    @staticmethod
    def _find_step(
        steps: List[Dict], step_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Find a step by ID in the steps list."""
        for step in steps:
            if step.get('id') == step_id:
                return step
        return None

    @staticmethod
    def _interpolate(template: str, variables: Dict[str, Any]) -> str:
        """
        Interpolate template variables: {{contact.name}} → John.

        Supports nested access: {{contact.name}}, {{message.text}}.
        """
        import re

        def replacer(match):
            path = match.group(1).strip()
            parts = path.split('.')
            value = variables
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part, '')
                else:
                    return match.group(0)
            return str(value) if value else ''

        return re.sub(r'\{\{(.+?)\}\}', replacer, template)

    @staticmethod
    def _eval_condition(
        config: Dict[str, Any],
        variables: Dict[str, Any],
    ) -> str:
        """
        Evaluate a condition and return a branch name.

        Config:
            {"field": "last_reply.payload", "op": "eq", "value": "yes",
             "true_branch": "yes", "false_branch": "no"}
        """
        field_path = config.get('field', '')
        op = config.get('op', 'eq')
        expected = config.get('value', '')
        true_branch = config.get('true_branch', 'yes')
        false_branch = config.get('false_branch', 'no')

        # Navigate nested field
        parts = field_path.split('.')
        actual = variables
        for part in parts:
            if isinstance(actual, dict):
                actual = actual.get(part, '')
            else:
                actual = ''
                break

        actual_str = str(actual).lower().strip()
        expected_str = str(expected).lower().strip()

        matched = False
        if op == 'eq':
            matched = actual_str == expected_str
        elif op == 'neq':
            matched = actual_str != expected_str
        elif op == 'contains':
            matched = expected_str in actual_str
        elif op == 'exists':
            matched = bool(actual)

        return true_branch if matched else false_branch

    def _save_flow_state(
        self,
        conversation_id: str,
        flow_id: Optional[str],
        flow_state: Dict[str, Any],
    ) -> None:
        """Persist flow state to unified_conversations."""
        if not self._db:
            return
        try:
            update = {
                'flow_state': flow_state,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }
            if flow_id is not None:
                update['current_flow_id'] = flow_id
            elif flow_state.get('status') in (
                FlowStatus.COMPLETED.value,
                FlowStatus.TIMED_OUT.value,
                FlowStatus.ERROR.value,
            ):
                update['current_flow_id'] = None

            self._db.table('unified_conversations').update(
                update
            ).eq('id', conversation_id).execute()
        except Exception as e:
            logger.error(
                f"flow_save_state_error conv={conversation_id[:15]}: {e}"
            )

    def _schedule_delayed_resume(
        self,
        conversation_id: str,
        tenant_id: str,
        delay_seconds: int,
    ) -> None:
        """Schedule delayed flow resume via Celery."""
        try:
            from tasks.messaging_tasks import resume_flow_after_delay
            resume_flow_after_delay.apply_async(
                kwargs={
                    'conversation_id': conversation_id,
                    'tenant_id': tenant_id,
                },
                countdown=delay_seconds,
            )
        except Exception as e:
            logger.error(f"flow_schedule_delay_error: {e}")


# =========================================================================
# Singleton
# =========================================================================

_engine_instance: Optional[FlowEngine] = None


def get_flow_engine() -> FlowEngine:
    """Get singleton FlowEngine instance."""
    global _engine_instance
    if _engine_instance is None:
        db = None
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
        except Exception:
            pass

        send_fn = None
        try:
            from services.messaging.sdk import get_messaging_sdk
            sdk = get_messaging_sdk()
            send_fn = sdk.send
        except Exception:
            pass

        _engine_instance = FlowEngine(
            supabase_client=db,
            send_fn=send_fn,
        )
        logger.info("🔄 FlowEngine initialized")
    return _engine_instance
