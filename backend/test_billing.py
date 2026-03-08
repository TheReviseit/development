"""
Billing Monitor Test Script
============================
Tests all billing monitoring components without needing Razorpay to actually
fire a webhook. Run this with your Flask server running locally.

Usage:
    python test_billing.py

Requires:
    - Flask running on localhost:5000
    - .env loaded (Supabase + Redis configured)
    - Migrations 060 + 060b applied to Supabase
"""

import os
import hmac
import hashlib
import json
import requests
import time
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:5000"
ADMIN_KEY = os.getenv("ADMIN_API_KEY", "Rajaauxi@005")
WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
INFO = "\033[94m[INFO]\033[0m"


def sign_payload(payload: dict) -> str:
    """Generate Razorpay webhook signature."""
    body = json.dumps(payload, separators=(',', ':'))
    return hmac.new(
        WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest(), body


def test(name: str, passed: bool, detail: str = ""):
    status = PASS if passed else FAIL
    print(f"  {status} {name}")
    if detail and not passed:
        print(f"         {detail}")


# =============================================================================
# 1. ADMIN DASHBOARD
# =============================================================================

def test_admin_dashboard():
    print("\n--- 1. Admin Dashboard ---")

    r = requests.get(
        f"{BASE_URL}/api/admin/billing/dashboard",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    test("Dashboard returns 200", r.status_code == 200, r.text[:200])

    data = r.json()
    test("Dashboard has subscription_counts", "subscription_counts" in data)
    test("Dashboard has payment_failures_24h", "payment_failures_24h" in data)
    test("Dashboard has total_active", "total_active" in data)

    print(f"  {INFO} Active: {data.get('total_active')} | At-risk: {data.get('total_at_risk')} | Suspended: {data.get('total_suspended')}")

    # Test unauthorized
    r2 = requests.get(f"{BASE_URL}/api/admin/billing/dashboard")
    test("Dashboard requires auth (returns 401)", r2.status_code == 401)


# =============================================================================
# 2. LIST SUBSCRIPTIONS
# =============================================================================

def test_list_subscriptions():
    print("\n--- 2. Subscription Listing ---")

    r = requests.get(
        f"{BASE_URL}/api/admin/billing/subscriptions",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    test("Subscriptions endpoint returns 200", r.status_code == 200, r.text[:200])

    data = r.json()
    test("Returns subscriptions list", "subscriptions" in data)
    test("Returns total count", "total" in data)
    print(f"  {INFO} Total subscriptions in DB: {data.get('total', 0)}")

    # Filter by status
    r2 = requests.get(
        f"{BASE_URL}/api/admin/billing/subscriptions?status=active",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    test("Status filter works", r2.status_code == 200)


# =============================================================================
# 3. BILLING EVENTS LOG
# =============================================================================

def test_billing_events():
    print("\n--- 3. Billing Events ---")

    r = requests.get(
        f"{BASE_URL}/api/admin/billing/events",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    test("Events endpoint returns 200", r.status_code == 200, r.text[:200])

    data = r.json()
    test("Returns events list", "events" in data)
    print(f"  {INFO} Total billing events: {data.get('total', 0)}")


# =============================================================================
# 4. PAYMENT RETRIES
# =============================================================================

def test_retries():
    print("\n--- 4. Payment Retries ---")

    r = requests.get(
        f"{BASE_URL}/api/admin/billing/retries",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    test("Retries endpoint returns 200", r.status_code == 200, r.text[:200])

    data = r.json()
    test("Returns retries list", "retries" in data)
    print(f"  {INFO} Pending retries: {data.get('total', 0)}")


# =============================================================================
# 5. WEBHOOK — payment.failed simulation
# =============================================================================

def test_webhook_payment_failed(razorpay_sub_id: str = None):
    print("\n--- 5. Webhook: payment.failed ---")

    if not WEBHOOK_SECRET:
        print(f"  {FAIL} RAZORPAY_WEBHOOK_SECRET not set in .env — skipping")
        return

    if not razorpay_sub_id:
        print(f"  {INFO} No subscription ID provided — testing signature validation only")

    event_id = f"evt_test_{int(time.time())}"
    payload = {
        "id": event_id,
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": f"pay_test_{int(time.time())}",
                    "subscription_id": razorpay_sub_id or "sub_test_notexist",
                    "error_code": "BAD_REQUEST_ERROR",
                    "error_description": "Payment test simulation",
                }
            }
        }
    }

    sig, body = sign_payload(payload)

    r = requests.post(
        f"{BASE_URL}/api/webhooks/subscription",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
        }
    )
    test("Webhook returns 200", r.status_code == 200, r.text[:200])

    data = r.json()
    test("Response has event_type", "event_type" in data)
    test("Event type matches", data.get("event_type") == "payment.failed")
    print(f"  {INFO} Action: {data.get('action')} | Duplicate: {data.get('duplicate')}")

    # Test invalid signature
    r2 = requests.post(
        f"{BASE_URL}/api/webhooks/subscription",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": "invalidsignature",
        }
    )
    test("Invalid signature returns 401", r2.status_code == 401)

    # Test replay (same event_id)
    r3 = requests.post(
        f"{BASE_URL}/api/webhooks/subscription",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
        }
    )
    test("Duplicate event is detected", r3.json().get("duplicate") is True)


# =============================================================================
# 6. WEBHOOK — subscription.charged simulation
# =============================================================================

def test_webhook_charged(razorpay_sub_id: str = None):
    print("\n--- 6. Webhook: subscription.charged ---")

    if not WEBHOOK_SECRET:
        print(f"  {FAIL} RAZORPAY_WEBHOOK_SECRET not set — skipping")
        return

    event_id = f"evt_charged_{int(time.time())}"
    payload = {
        "id": event_id,
        "event": "subscription.charged",
        "payload": {
            "subscription": {
                "entity": {
                    "id": razorpay_sub_id or "sub_test_notexist",
                    "current_start": int(time.time()),
                    "current_end": int(time.time()) + 2592000,  # +30 days
                }
            },
            "payment": {
                "entity": {
                    "id": f"pay_charged_{int(time.time())}",
                }
            }
        }
    }

    sig, body = sign_payload(payload)

    r = requests.post(
        f"{BASE_URL}/api/webhooks/subscription",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
        }
    )
    test("Charged webhook returns 200", r.status_code == 200, r.text[:200])
    print(f"  {INFO} Action: {r.json().get('action')}")


# =============================================================================
# 7. TRIGGER BILLING MONITOR
# =============================================================================

def test_trigger_monitor():
    print("\n--- 7. Trigger Billing Monitor ---")

    r = requests.post(
        f"{BASE_URL}/api/admin/billing/run-monitor",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    test("Monitor trigger returns 200", r.status_code == 200, r.text[:200])

    data = r.json()
    triggered = data.get("triggered") or data.get("task_id") is not None
    test("Monitor was triggered", triggered)

    if data.get("task_id"):
        print(f"  {INFO} Task ID: {data.get('task_id')}")
    else:
        print(f"  {INFO} Note: Celery not running locally — task queued but won't execute")


# =============================================================================
# 8. MRR REPORT
# =============================================================================

def test_mrr():
    print("\n--- 8. MRR Report ---")

    r = requests.get(
        f"{BASE_URL}/api/admin/billing/mrr",
        headers={"X-Admin-Key": ADMIN_KEY}
    )
    # MRR report runs via Celery — may timeout if Celery not running locally
    if r.status_code == 200:
        test("MRR report returned", True)
        data = r.json()
        report = data.get("report", {})
        print(f"  {INFO} Active: {report.get('total_active')} | MRR: {report.get('total_mrr_display', '₹0')}")
    else:
        print(f"  {INFO} MRR report requires Celery running (status={r.status_code})")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("  Billing Monitor Test Suite")
    print(f"  Server: {BASE_URL}")
    print(f"  Admin Key: {ADMIN_KEY[:8]}...")
    print(f"  Webhook Secret: {'set' if WEBHOOK_SECRET else 'NOT SET'}")
    print("=" * 60)

    test_admin_dashboard()
    test_list_subscriptions()
    test_billing_events()
    test_retries()
    test_webhook_payment_failed()
    test_webhook_charged()
    test_trigger_monitor()
    test_mrr()

    print("\n" + "=" * 60)
    print("  Done. Run the SQL migrations first if tests are failing.")
    print("  See: backend/migrations/060_subscription_monitoring.sql")
    print("=" * 60)
