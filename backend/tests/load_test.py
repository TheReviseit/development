"""
Locust Load Testing Configuration for WhatsApp Chatbot API.
Simulates realistic user traffic patterns for performance testing.

Usage:
    # Install locust: pip install locust
    # Run: locust -f tests/load_test.py --host=http://localhost:5000
    
    # For headless testing:
    # locust -f tests/load_test.py --host=http://localhost:5000 \
    #        --users 100 --spawn-rate 10 --run-time 5m --headless
"""

import json
import random
import string
from typing import Dict, Any

try:
    from locust import HttpUser, task, between, events
    from locust.runners import MasterRunner
    LOCUST_AVAILABLE = True
except ImportError:
    LOCUST_AVAILABLE = False
    print("Locust not installed. Run: pip install locust")


if LOCUST_AVAILABLE:
    
    class WhatsAppUser(HttpUser):
        """
        Simulates a WhatsApp user sending messages.
        """
        
        # Wait between 1-5 seconds between tasks (realistic user behavior)
        wait_time = between(1, 5)
        
        # Sample business data for testing
        BUSINESS_DATA = {
            "business_id": "test_biz_123",
            "business_name": "Load Test Salon",
            "industry": "salon",
            "products_services": [
                {"name": "Haircut", "price": 300},
                {"name": "Hair Color", "price": 1500},
                {"name": "Facial", "price": 800},
            ],
            "hours": {
                "monday": "9:00 AM - 8:00 PM",
                "tuesday": "9:00 AM - 8:00 PM",
                "wednesday": "9:00 AM - 8:00 PM",
            },
            "contact": {
                "phone": "+919876543210",
                "email": "test@salon.com",
            }
        }
        
        # Common user messages for testing
        SAMPLE_MESSAGES = [
            "Hi",
            "Hello",
            "What are your prices?",
            "Do you do haircuts?",
            "What time do you open?",
            "Where are you located?",
            "I want to book an appointment",
            "What services do you offer?",
            "How much is a haircut?",
            "Thanks",
            "Bye",
        ]
        
        def on_start(self):
            """Called when a user starts (setup)."""
            # Generate unique user ID for this session
            self.user_id = ''.join(random.choices(string.digits, k=10))
            self.phone_number = f"91{self.user_id}"
        
        @task(10)
        def send_message(self):
            """
            Primary task: Send a chat message.
            Weight of 10 means this is the most common action.
            """
            message = random.choice(self.SAMPLE_MESSAGES)
            
            payload = {
                "business_data": self.BUSINESS_DATA,
                "user_message": message,
                "user_id": self.user_id,
            }
            
            with self.client.post(
                "/api/ai/generate-reply",
                json=payload,
                name="AI Generate Reply",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        response.success()
                    else:
                        response.failure(f"API returned error: {data.get('error')}")
                else:
                    response.failure(f"HTTP {response.status_code}")
        
        @task(3)
        def health_check(self):
            """Check API health."""
            with self.client.get(
                "/api/health",
                name="Health Check",
                catch_response=True
            ) as response:
                if response.status_code == 200:
                    response.success()
                else:
                    response.failure(f"Health check failed: {response.status_code}")
        
        @task(2)
        def check_ai_status(self):
            """Check AI Brain status."""
            self.client.get("/api/ai/status", name="AI Status")
        
        @task(2)
        def detect_intent(self):
            """Test intent detection endpoint."""
            message = random.choice(self.SAMPLE_MESSAGES)
            
            payload = {
                "message": message,
                "history": [],
            }
            
            self.client.post(
                "/api/ai/detect-intent",
                json=payload,
                name="Detect Intent"
            )
    
    
    class HighVolumeUser(HttpUser):
        """
        Simulates high-volume traffic (stress testing).
        Shorter wait times, more aggressive requests.
        """
        
        wait_time = between(0.1, 0.5)  # Very short wait
        weight = 1  # Lower weight than regular users
        
        QUICK_MESSAGES = ["Hi", "Hello", "Thanks", "Bye"]
        
        @task
        def rapid_messages(self):
            """Rapid-fire messages for stress testing."""
            payload = {
                "business_data": {"business_id": "stress_test"},
                "user_message": random.choice(self.QUICK_MESSAGES),
            }
            
            self.client.post(
                "/api/ai/generate-reply",
                json=payload,
                name="Rapid Message"
            )
    
    
    class WebhookSimulator(HttpUser):
        """
        Simulates WhatsApp webhook traffic.
        """
        
        wait_time = between(0.5, 2)
        weight = 1
        
        def generate_webhook_payload(self) -> Dict[str, Any]:
            """Generate realistic webhook payload."""
            message_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
            phone = f"91{''.join(random.choices(string.digits, k=10))}"
            
            return {
                "object": "whatsapp_business_account",
                "entry": [{
                    "id": "test_waba_id",
                    "changes": [{
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550001234",
                                "phone_number_id": "test_phone_id"
                            },
                            "contacts": [{
                                "profile": {"name": "Test User"},
                                "wa_id": phone
                            }],
                            "messages": [{
                                "from": phone,
                                "id": f"wamid.{message_id}",
                                "timestamp": str(int(random.time())),
                                "text": {"body": random.choice([
                                    "Hi", "Hello", "What's your price?"
                                ])},
                                "type": "text"
                            }]
                        },
                        "field": "messages"
                    }]
                }]
            }
        
        @task
        def simulate_webhook(self):
            """Simulate incoming WhatsApp webhook."""
            # Note: This will likely fail without proper credentials
            # but useful for testing webhook endpoint performance
            
            payload = self.generate_webhook_payload()
            
            self.client.post(
                "/api/whatsapp/webhook",
                json=payload,
                name="Webhook (simulated)"
            )
    
    
    # =============================================================================
    # Event Handlers for Metrics
    # =============================================================================
    
    @events.test_start.add_listener
    def on_test_start(environment, **kwargs):
        """Called when load test starts."""
        print("=" * 60)
        print("🚀 Load Test Starting")
        print(f"   Target: {environment.host}")
        print("=" * 60)
    
    
    @events.test_stop.add_listener
    def on_test_stop(environment, **kwargs):
        """Called when load test stops."""
        print("=" * 60)
        print("✅ Load Test Complete")
        print("=" * 60)
    
    
    @events.request.add_listener
    def on_request(request_type, name, response_time, response_length, 
                   response, context, exception, **kwargs):
        """Log each request for debugging (optional)."""
        if response_time > 500:
            print(f"⚠️ Slow request: {name} took {response_time:.0f}ms")


# =============================================================================
# Standalone Test Helpers
# =============================================================================

def run_quick_test(host: str = "http://localhost:5000", requests: int = 100):
    """
    Run a quick load test without Locust UI.
    
    Args:
        host: API host URL
        requests: Number of requests to send
    """
    import requests as req
    import time
    import concurrent.futures
    
    print(f"🧪 Quick load test: {requests} requests to {host}")
    
    latencies = []
    errors = 0
    
    def make_request():
        payload = {
            "business_data": {"business_id": "quick_test"},
            "user_message": "Hi",
        }
        
        start = time.time()
        try:
            response = req.post(
                f"{host}/api/ai/generate-reply",
                json=payload,
                timeout=30
            )
            latency = (time.time() - start) * 1000
            
            if response.status_code == 200:
                return latency, None
            return latency, f"HTTP {response.status_code}"
        except Exception as e:
            return (time.time() - start) * 1000, str(e)
    
    # Run concurrent requests
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(make_request) for _ in range(requests)]
        
        for future in concurrent.futures.as_completed(futures):
            latency, error = future.result()
            latencies.append(latency)
            if error:
                errors += 1
    
    # Calculate stats
    latencies.sort()
    avg = sum(latencies) / len(latencies)
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]
    
    print(f"\n📊 Results:")
    print(f"   Requests: {requests}")
    print(f"   Errors: {errors} ({errors/requests*100:.1f}%)")
    print(f"   Avg latency: {avg:.0f}ms")
    print(f"   p50: {p50:.0f}ms")
    print(f"   p95: {p95:.0f}ms")
    print(f"   p99: {p99:.0f}ms")
    
    # Check against KPIs
    print(f"\n📈 KPI Check:")
    print(f"   p95 < 200ms: {'✅' if p95 < 200 else '❌'} ({p95:.0f}ms)")
    print(f"   p99 < 500ms: {'✅' if p99 < 500 else '❌'} ({p99:.0f}ms)")
    print(f"   Error rate < 5%: {'✅' if errors/requests < 0.05 else '❌'} ({errors/requests*100:.1f}%)")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "quick":
        host = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5000"
        requests = int(sys.argv[3]) if len(sys.argv) > 3 else 100
        run_quick_test(host, requests)
    else:
        print("Usage:")
        print("  Quick test: python load_test.py quick [host] [requests]")
        print("  Locust UI:  locust -f load_test.py --host=http://localhost:5000")

