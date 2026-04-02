import requests
import time
import json
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# The ngrok URL or localhost URL where your Flask app is running
WEBHOOK_URL = "http://localhost:5000/api/webhooks/meta"

# Mock IDs
TEST_BUSINESS_ID = "17841452871014455" # Your Instagram Business Account ID from Meta Console
TEST_USER_ID = "igsid_9876543210"      # The Instagram Scoped ID of the person messaging you

def send_mock_webhook(text_message: str):
    """Sends a mock Instagram DM webhook to the local server."""
    
    timestamp = int(time.time() * 1000) # Milliseconds since epoch
    message_id = f"mid.{timestamp}"
    
    payload = {
        "object": "instagram",
        "entry": [{
            "id": TEST_BUSINESS_ID,
            "time": timestamp,
            "messaging": [{
                "sender": {"id": TEST_USER_ID},
                "recipient": {"id": TEST_BUSINESS_ID},
                "timestamp": timestamp,
                "message": {
                    "mid": message_id,
                    "text": text_message
                }
            }]
        }]
    }
    
    headers = {
        "Content-Type": "application/json",
        # If META_APP_SECRET is empty in .env, our code skips signature verification.
        # Otherwise, you'd need to generate the X-Hub-Signature-256 here.
    }
    
    logging.info(f"Sending mock IG webhook: '{text_message}'")
    
    try:
        response = requests.post(WEBHOOK_URL, json=payload, headers=headers)
        
        logging.info(f"Response Status: {response.status_code}")
        logging.info(f"Response Body: {response.text}")
        
        if response.status_code == 200:
            logging.info("✅ Webhook correctly accepted the event.")
            logging.info("👉 Check your Flask and Celery logs to see the async processing!")
        else:
            logging.error("❌ Webhook was rejected.")
            
    except requests.exceptions.ConnectionError:
        logging.error(f"❌ Could not connect to {WEBHOOK_URL}. Is Flask running?")

if __name__ == "__main__":
    print("🚀 FlowAuxi Webhook Tester")
    print("===========================")
    
    # 1. Test a simple text message
    send_mock_webhook("Hello! I need some help with my order.")
    
    # 2. Add an optional small delay so we can see Celery process them
    time.sleep(1)
    
    # 3. Test a keyword that might trigger an automation rule
    send_mock_webhook("pricing")
