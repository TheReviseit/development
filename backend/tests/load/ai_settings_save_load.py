"""
Load test: AI Settings business save endpoint.

Requires:
  pip install locust

Usage:
  locust -f backend/tests/load/ai_settings_save_load.py \\
    --host=http://localhost:5000 \\
    --users 100 --spawn-rate 10 --run-time 5m

Environment:
  LOAD_TEST_SESSION_COOKIE  Firebase session cookie value
  LOAD_TEST_USER_ID         Firebase UID sent as X-User-ID
  LOAD_TEST_CORRELATION_PREFIX  optional prefix for correlation IDs
"""

from __future__ import annotations

import json
import os
import uuid

from locust import HttpUser, between, task


def _sample_payload() -> dict:
    return {
        "business_name": "Load Test Business",
        "description": "Load test profile update",
        "brand_voice": {
            "tone": "friendly",
            "language_preference": "en",
            "greeting_style": "warm",
            "tagline": "Load test tagline",
            "unique_selling_points": ["Fast", "Reliable"],
            "avoid_topics": [],
            "custom_greeting": "Hi there!",
        },
        "faqs": [
            {"question": "What are your hours?", "answer": "9 AM to 6 PM"},
        ],
        "timings": {
            "monday": {"open": "09:00", "close": "18:00", "is_closed": False},
        },
        "policies": {
            "refund": "7-day refund",
            "cancellation": "24h notice",
            "delivery": "3-5 days",
            "payment_methods": ["UPI", "Card"],
        },
    }


class AISettingsSaveUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        self.session_cookie = os.getenv("LOAD_TEST_SESSION_COOKIE", "")
        self.user_id = os.getenv("LOAD_TEST_USER_ID", "")
        self.correlation_prefix = os.getenv(
            "LOAD_TEST_CORRELATION_PREFIX",
            "loadtest",
        )

    @task
    def save_business_settings(self):
        correlation_id = f"{self.correlation_prefix}-{uuid.uuid4()}"
        headers = {
            "Content-Type": "application/json",
            "X-Correlation-ID": correlation_id,
        }
        if self.user_id:
            headers["X-User-ID"] = self.user_id
        if self.session_cookie:
            headers["Cookie"] = f"session={self.session_cookie}"

        with self.client.post(
            "/api/shop/business/update",
            data=json.dumps(_sample_payload()),
            headers=headers,
            name="POST /api/shop/business/update",
            catch_response=True,
        ) as response:
            server_timing = response.headers.get("Server-Timing", "")
            response_time_header = response.headers.get("X-Response-Time", "")
            if response.status_code >= 500:
                response.failure(
                    f"status={response.status_code} timing={response_time_header}"
                )
            elif server_timing:
                response.success()
            else:
                response.success()
