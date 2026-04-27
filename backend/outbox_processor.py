"""
FAANG-Grade Outbox Processor
============================
Polls the `events_outbox` database table for pending events and executes
them reliably. This guarantees we don't drop events if the API server crashes.
"""

import time
import os
import threading
import logging
import traceback
from datetime import datetime, timezone
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

class DatabaseOutboxProcessor:
    def __init__(self, interval_seconds=5.0):
        self.interval_seconds = interval_seconds
        self._running = False
        self._thread = None
        self.supabase = get_supabase_client()
        
    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("Started FAANG Database Outbox Processor.")
        
    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)

    def _run_loop(self):
        while self._running:
            try:
                self.process_pending_events()
            except Exception as e:
                logger.error(f"Outbox Processor Error: {e}")
            time.sleep(self.interval_seconds)

    def process_pending_events(self):
        # Fetch pending events
        # We only process up to 50 at a time
        response = self.supabase.table('events_outbox') \
            .select('*') \
            .eq('status', 'PENDING') \
            .order('created_at') \
            .limit(50) \
            .execute()
            
        events = response.data
        if not events:
            return
            
        for event in events:
            if event['retry_count'] >= 3:
                self.mark_failed(event['id'], "Max retries exceeded")
                continue
                
            if event['type'] == 'subscription.created':
                self.handle_subscription_created(event)
            else:
                self.mark_failed(event['id'], f"Unknown event type: {event['type']}")

    def handle_subscription_created(self, event):
        payload = event['payload']
        subscription_id = payload['subscription_id']
        idempotency_key = payload.get('idempotency_key', event['id'])
        
        logger.info(f"Processing outbox subscription.created for sub {subscription_id}")
        
        try:
            import razorpay
            razorpay_client = razorpay.Client(
                auth=(os.getenv('RAZORPAY_KEY_ID'), os.getenv('RAZORPAY_KEY_SECRET'))
            )
            razorpay_client.session.timeout = (5, 10)
            
            # Fetch the plan ID from the subscriptions table to create in Razorpay
            sub_res = self.supabase.table('subscriptions').select('plan_id, user_id, product_domain').eq('id', subscription_id).execute()
            if not sub_res.data:
                raise ValueError(f"Subscription {subscription_id} not found in DB.")
            
            sub_record = sub_res.data[0]
            razorpay_plan_id = sub_record['plan_id']
            
            subscription_data = {
                'plan_id': razorpay_plan_id,
                'customer_notify': 1,
                'total_count': 12,
                'quantity': 1,
                'notes': {
                    'user_id': sub_record['user_id'],
                    'plan_slug': payload.get('plan_slug', ''),
                    'product_domain': sub_record['product_domain'],
                    'idempotency_key': idempotency_key,
                }
            }
            
            raz_sub = razorpay_client.subscription.create(data=subscription_data)
            
            # Update the subscription with Razorpay ID
            self.supabase.table('subscriptions').update({
                'razorpay_subscription_id': raz_sub['id'],
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('id', subscription_id).execute()
            
            self.mark_delivered(event['id'])
            logger.info(f"Successfully processed outbox event {event['id']}")
            
        except Exception as e:
            logger.error(f"Failed to process outbox event {event['id']}: {traceback.format_exc()}")
            self.increment_retry(event['id'], str(e), event['retry_count'])

    def mark_delivered(self, event_id):
        self.supabase.table('events_outbox').update({
            'status': 'DELIVERED',
            'processed_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', event_id).execute()

    def mark_failed(self, event_id, error_msg):
        self.supabase.table('events_outbox').update({
            'status': 'FAILED',
            'error_message': error_msg,
            'processed_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', event_id).execute()

    def increment_retry(self, event_id, error_msg, current_retry):
        self.supabase.table('events_outbox').update({
            'retry_count': current_retry + 1,
            'error_message': error_msg
        }).eq('id', event_id).execute()

# Global instance
db_outbox_processor = DatabaseOutboxProcessor()
