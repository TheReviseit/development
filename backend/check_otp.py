# coding: utf-8
"""
Real OTP Delivery Issue Checker
Checks the actual WhatsApp template status and configuration
"""

import os
import json
import requests

def load_env():
    """Load .env file"""
    env_path = '.env'
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value

def check_template():
    """Check template status in Meta"""
    print("Checking WhatsApp Template Status...")
    print("=" * 60)
    
    waba_id = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    template_name = os.getenv("WHATSAPP_OTP_TEMPLATE", "auth_otps")
    
    if not waba_id or not access_token:
        print("[ERROR] Missing credentials")
        return False
    
    url = f"https://graph.facebook.com/v24.0/{waba_id}/message_templates"
    params = {"name": template_name}
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        data = response.json()
        
        if response.status_code != 200:
            print(f"[ERROR] API Error: {data.get('error', {}).get('message')}")
            return False
        
        templates = data.get("data", [])
        if not templates:
            print(f"[ERROR] Template '{template_name}' NOT FOUND")
            print(f"Create it in Meta Business Manager first!")
            return False
        
        t = templates[0]
        print(f"Template: {t.get('name')}")
        print(f"Status: {t.get('status')}")
        print(f"Language: {t.get('language')}")
        print(f"Category: {t.get('category')}")
        
        if t.get('status') != 'APPROVED':
            print(f"\n[ERROR] Template is {t.get('status')}, not APPROVED!")
            print("Wait for Meta to approve it or check rejection reason.")
            return False
        
        print("\n[OK] Template is APPROVED")
        return True
    except Exception as e:
        print(f"[ERROR] {e}")
        return False

def test_send_otp():
    """Send test OTP"""
    print("\n" + "=" * 60)
    print("Sending Test OTP...")
    print("=" * 60)
    
    phone = input("Enter test phone number (with +, e.g. +916383634873): ").strip()
    if not phone:
        print("Cancelled")
        return
    
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    template_name = os.getenv("WHATSAPP_OTP_TEMPLATE", "auth_otps")
    
    import random
    otp = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    whatsapp_phone = phone.lstrip('+')
    url = f"https://graph.facebook.com/v23.0/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": whatsapp_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": otp}]},
                {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text":otp}]}
            ]
        }
    }
    
    print(f"\nSending OTP: {otp}")
    print(f"To: {phone}")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        data = response.json()
        
        print(f"\nStatus: {response.status_code}")
        print(f"Response:\n{json.dumps(data, indent=2)}")
        
        if response.status_code == 200 and data.get('messages'):
            wamid = data['messages'][0].get('id')
            print(f"\n[SUCCESS] Message sent!")
            print(f"Message ID: {wamid}")
            print(f"\nIf you don't receive it, possible reasons:")
            print(f"1. Phone number not on WhatsApp")
            print(f"2. Number blocked by Meta")
            print(f"3. Template quality issues")
            print(f"\nCheck your phone now!")
        else:
            error = data.get('error', {})
            print(f"\n[FAILED]")
            print(f"Error: {error.get('message')}")
            print(f"Code: {error.get('code')}")
    except Exception as e:
        print(f"[ERROR] {e}")

if __name__ == "__main__":
    load_env()
    
    if check_template():
        test_send_otp()
