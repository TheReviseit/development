"""
Reconciliation Engine (Phase B)
================================
Continuous reconciliation that triggers 60 seconds after every webhook
event. Fetches canonical state from Razorpay API, compares against the
subscription_events event log, and auto-heals by synthesizing missing
events with actor='reconciliation_engine'.

Key design decisions:
  - Triggered via outbox worker (webhook → outbox → reconciliation)
  - 60-second delay before reconciliation (allows Razorpay to settle)
  - Compares Razorpay's canonical subscription status vs event log
  - Auto-heals by INSERT into subscription_events (not direct UPDATE)
  - NEVER heals during Razorpay's 24-hour retry window to avoid duplicates
  - Manual override: set subscription.reconciled_override = 'skip' to bypass
"""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger('reviseit.services.reconciliation_engine')

RAZORPAY_RETRY_WINDOW_HOURS = int(os.getenv('RAZORPAY_RETRY_WINDOW_HOURS', '24'))
RECONCILIATION_DELAY_SECONDS = int(os.getenv('RECONCILIATION_DELAY_SECONDS', '60'))


def reconcile_subscription(subscription_id: str, razorpay_subscription_id: str) -> Dict[str, Any]:
    """
    Reconcile a single subscription against Razorpay's canonical state.

    Steps:
      1. Fetch subscription from local DB (to get status and metadata)
      2. Fetch subscription from Razorpay API
      3. Compare states and detect drift
      4. If drift detected:
         a. Check if within retry window — skip if so
         b. Check manual override flag
         c. Synthesize missing events in subscription_events
      5. Log reconciliation result

    Returns summary dict.
    """
    result = {
        'subscription_id': subscription_id,
        'razorpay_subscription_id': razorpay_subscription_id,
        'drift_detected': False,
        'auto_healed': False,
        'reason': None,
    }

    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        # 1. Fetch local subscription
        local = db.table('subscriptions') \
            .select('*') \
            .eq('id', subscription_id) \
            .single() \
            .execute()

        if not local.data:
            result['reason'] = 'local_subscription_not_found'
            return result

        sub = local.data

        # 2. Fetch from Razorpay
        razorpay_status = _fetch_razorpay_subscription_status(razorpay_subscription_id)
        if not razorpay_status:
            result['reason'] = 'razorpay_api_error'
            return result

        local_status = sub.get('status')

        # 3. Compare
        mapped = _map_razorpay_status(razorpay_status)
        if mapped == local_status:
            result['reason'] = 'in_sync'
            return result

        drift_detected = True
        result['drift_detected'] = True
        result['local_status'] = local_status
        result['razorpay_status'] = razorpay_status
        result['mapped_status'] = mapped

        # 4a. Check retry window
        created_str = sub.get('created_at')
        if created_str:
            try:
                created = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) - created < timedelta(hours=RAZORPAY_RETRY_WINDOW_HOURS):
                    result['reason'] = 'within_razorpay_retry_window'
                    return result
            except (ValueError, TypeError):
                pass

        # 4b. Check manual override
        if sub.get('reconciled_override') == 'skip':
            result['reason'] = 'manual_override_skip'
            return result

        # 4c. Fetch event log to see actual event sequence
        events = db.table('subscription_events') \
            .select('event_type, new_status') \
            .eq('subscription_id', subscription_id) \
            .order('id') \
            .execute()

        event_types = [e['event_type'] for e in (events.data or [])]

        # Determine if we need to synthesize events
        missing_events = _detect_missing_events(event_types, local_status, mapped)

        if not missing_events:
            result['reason'] = 'projection_lag_only'
            return result

        # Synthesize missing events
        for event_type, new_status, reason in missing_events:
            _insert_event(
                db=db,
                subscription_id=subscription_id,
                user_id=sub.get('user_id'),
                domain=sub.get('product_domain'),
                event_type=event_type,
                previous_status=local_status,
                new_status=new_status,
                reason=reason,
                payload={
                    'status': new_status,
                    'razorpay_status': razorpay_status,
                    'reconciled_by': 'reconciliation_engine',
                    'razorpay_subscription_id': razorpay_subscription_id,
                },
            )

        result['auto_healed'] = True
        result['events_synthesized'] = len(missing_events)
        result['reason'] = 'auto_healed'

        logger.info(
            f"reconciliation sub={subscription_id} rzp_id={razorpay_subscription_id} "
            f"local={local_status}→razorpay={razorpay_status} "
            f"events_synthesized={len(missing_events)}"
        )

    except Exception as e:
        logger.error(f"reconciliation_error sub={subscription_id}: {e}", exc_info=True)
        result['reason'] = f'error: {e}'

    return result


def _map_razorpay_status(razorpay_status: str) -> str:
    """Map Razorpay subscription status to our internal status."""
    mapping = {
        'created': 'pending',
        'authenticated': 'pending',
        'active': 'active',
        'pending': 'pending',
        'halted': 'halted',
        'completed': 'completed',
        'expired': 'expired',
        'cancelled': 'cancelled',
        'past_due': 'past_due',
    }
    return mapping.get(razorpay_status, razorpay_status)


def _detect_missing_events(
    existing_events: list,
    local_status: str,
    target_status: str,
) -> list:
    """
    Detect which events need to be synthesized to bring the event log
    in line with the target (Razorpay-reported) status.

    Returns list of (event_type, new_status, reason) tuples.
    """
    # If target is active but no activated event exists
    if target_status == 'active' and 'subscription.activated' not in existing_events:
        return [('subscription.activated', 'active', 'reconciliation: missing activation')]

    if target_status == 'cancelled' and 'subscription.cancelled' not in existing_events:
        return [('subscription.cancelled', 'cancelled', 'reconciliation: missing cancellation')]

    if target_status == 'expired' and 'subscription.expired' not in existing_events:
        return [('subscription.expired', 'expired', 'reconciliation: missing expiry')]

    if target_status == 'halted' and 'subscription.halted' not in existing_events:
        return [('subscription.halted', 'halted', 'reconciliation: missing halt')]

    if target_status == 'past_due' and 'subscription.past_due' not in existing_events:
        return [('subscription.past_due', 'past_due', 'reconciliation: missing past_due')]

    if target_status == 'suspended' and 'subscription.suspended' not in existing_events:
        return [('subscription.suspended', 'suspended', 'reconciliation: missing suspension')]

    # Generic fallback: synthesize a reconciled event
    return [('subscription.reconciled', target_status, f'reconciliation: status set to {target_status}')]


def _insert_event(
    db,
    subscription_id: str,
    user_id: str,
    domain: str,
    event_type: str,
    previous_status: Optional[str],
    new_status: str,
    reason: str,
    payload: Optional[Dict] = None,
):
    """Insert a synthetic reconciliation event."""
    try:
        db.table('subscription_events').insert({
            'subscription_id': subscription_id,
            'user_id': user_id,
            'product_domain': domain,
            'event_type': event_type,
            'previous_status': previous_status,
            'new_status': new_status,
            'reason': reason,
            'triggered_by': 'reconciliation_engine',
            'actor': 'reconciliation_engine',
            'payload': payload or {},
        }).execute()
    except Exception as e:
        logger.error(f"reconciliation_insert_event_error sub={subscription_id}: {e}")


def _fetch_razorpay_subscription_status(razorpay_subscription_id: str) -> Optional[str]:
    """Fetch subscription status from Razorpay API."""
    try:
        import razorpay
        key_id = os.getenv('RAZORPAY_KEY_ID')
        key_secret = os.getenv('RAZORPAY_KEY_SECRET')
        if not key_id or not key_secret:
            logger.error("Razorpay credentials not configured")
            return None

        client = razorpay.Client(auth=(key_id, key_secret))
        sub_data = client.subscription.fetch(razorpay_subscription_id)
        return sub_data.get('status')

    except Exception as e:
        logger.error(f"razorpay_fetch_error rzp_id={razorpay_subscription_id}: {e}")
        return None


def reconcile_domain_subscriptions(domain: str) -> Dict[str, Any]:
    """
    Reconcile all subscriptions for a given domain.
    Called periodically or on-demand.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()

        subs = db.table('subscriptions') \
            .select('id, razorpay_subscription_id') \
            .eq('product_domain', domain) \
            .not_.is_('razorpay_subscription_id', 'null') \
            .neq('razorpay_subscription_id', '') \
            .execute()

        rows = subs.data or []
        results = []
        for sub in rows:
            result = reconcile_subscription(
                subscription_id=sub['id'],
                razorpay_subscription_id=sub['razorpay_subscription_id'],
            )
            results.append(result)

        drifted = [r for r in results if r.get('drift_detected')]
        healed = [r for r in results if r.get('auto_healed')]

        logger.info(
            f"domain_reconciliation domain={domain} "
            f"total={len(rows)} drifted={len(drifted)} healed={len(healed)}"
        )

        return {
            'domain': domain,
            'total': len(rows),
            'drifted': len(drifted),
            'healed': len(healed),
            'results': results,
        }

    except Exception as e:
        logger.error(f"domain_reconciliation_error domain={domain}: {e}", exc_info=True)
        return {'error': str(e)}
