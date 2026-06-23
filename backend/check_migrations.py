# -*- coding: utf-8 -*-
"""
Check which migrations have been applied.
Queries actual tables to determine schema state.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path)

os.environ['PYTHONIOENCODING'] = 'utf-8'
import supabase_client
from supabase_client import get_supabase_client

db = get_supabase_client()

def table_exists(name):
    try:
        db.table(name).select('*').limit(0).execute()
        return True
    except Exception as e:
        return False

def column_exists(table, column):
    try:
        db.table(table).select(column).limit(0).execute()
        return True
    except Exception as e:
        return False

def try_query(sql):
    try:
        db.table('_sql').select('*').limit(0).execute()
        return False
    except:
        pass
    return False

def idx_exists(name):
    try:
        r = db.table('pg_indexes').select('*').eq('indexname', name).limit(1).execute()
        return len(r.data) > 0
    except:
        pass
    try:
        from supabase import create_client
        url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
        client2 = create_client(url, key)
        r = client2.table('pg_indexes').select('*').eq('indexname', name).limit(1).execute()
        return len(r.data) > 0
    except:
        pass
    return False

print("=" * 60)
print("Migration Check")
print("=" * 60)

print("\n1. 20260613000000_payment_system_hardening.sql")
print(f"  payment_attempts table: {'OK' if table_exists('payment_attempts') else 'MISSING'}")
print(f"  product_domain column in subscriptions: {'OK' if column_exists('subscriptions', 'product_domain') else 'MISSING'}")
print(f"  previous_subscription_id column: {'OK' if column_exists('subscriptions', 'previous_subscription_id') else 'MISSING'}")

print("\n2. 20260614000000_checkout_requests.sql")
print(f"  checkout_requests table: {'OK' if table_exists('checkout_requests') else 'MISSING'}")

print("\n3. 20260619000000_subscription_events.sql")
print(f"  subscription_events table: {'OK' if table_exists('subscription_events') else 'MISSING'}")

print("\n4. 20260619010000_billing_outbox_dlq.sql")
print(f"  subscription_status_history table: {'OK' if table_exists('subscription_status_history') else 'MISSING'}")

print("\n5. 20260619020000_subscription_performance_indexes.sql")
print(f"  deleted_at column: {'OK' if column_exists('subscriptions', 'deleted_at') else 'MISSING'}")
for idx in ['idx_subscriptions_active_lookup', 'idx_subscriptions_stale_pending',
            'idx_subscriptions_razorpay_id', 'idx_subscriptions_past_due',
            'idx_sub_status_history_sub', 'idx_sub_status_history_user',
            'idx_billing_events_lookup', 'idx_billing_events_idempotency',
            'idx_free_trials_active_lookup']:
    e = idx_exists(idx)
    print(f"  index {idx}: {'OK' if e else 'MISSING'}")

print("\n6. 20260619030000_event_projection_trigger.sql")
print(f"  billing_events table: {'OK' if table_exists('billing_events') else 'MISSING'}")

print("\n7. 20260619040000_background_jobs_pgcron.sql")
# Can't check cron jobs via REST API

print("\n8. 20260620000000_atomic_subscription_transition.sql")
print(f"  idempotency_key column: {'OK' if column_exists('subscriptions', 'idempotency_key') else 'MISSING'}")
e = idx_exists('idx_subscriptions_idempotency')
print(f"  index idx_subscriptions_idempotency: {'OK' if e else 'MISSING'}")

print("\n9. 20260620001000_fix_razorpay_customers_userid_type.sql")
razorpay_exists = table_exists('razorpay_customers')
print(f"  razorpay_customers table: {'OK' if razorpay_exists else 'MISSING'}")
if razorpay_exists:
    try:
        db.table('razorpay_customers').select('user_id').limit(1).execute()
        print(f"  user_id column accessible: OK (TEXT type after migration)")
    except Exception as e:
        err = str(e)
        if '22P02' in err or 'invalid input syntax for type uuid' in err:
            print(f"  user_id column: STILL UUID TYPE - migration NOT applied!")
        else:
            print(f"  user_id query: {err}")

print("\n---")
print("SUMMARY:")
pending = []
if not table_exists('payment_attempts'):
    pending.append("20260613000000_payment_system_hardening.sql")
if not table_exists('checkout_requests'):
    pending.append("20260614000000_checkout_requests.sql")
if not table_exists('subscription_events'):
    pending.append("20260619000000_subscription_events.sql")
if not table_exists('subscription_status_history'):
    pending.append("20260619010000_billing_outbox_dlq.sql")
if not column_exists('subscriptions', 'deleted_at'):
    pending.append("20260619020000_subscription_performance_indexes.sql (needs deleted_at column)")
if not table_exists('billing_events'):
    pending.append("20260619030000_event_projection_trigger.sql")
if not column_exists('subscriptions', 'idempotency_key'):
    pending.append("20260620000000_atomic_subscription_transition.sql")

if razorpay_exists:
    try:
        db.table('razorpay_customers').select('user_id').limit(1).execute()
    except Exception:
        pending.append("20260620001000_fix_razorpay_customers_userid_type.sql")

if pending:
    print(f"{len(pending)} migrations not applied:")
    for p in pending:
        print(f"  - {p}")
else:
    print("All migrations applied!")
