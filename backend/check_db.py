"""
Quick test to check if the phone number exists in database
and if the message was stored
"""
import os
from dotenv import load_dotenv
from supabase_client import get_supabase_client

load_dotenv()

client = get_supabase_client()

if client:
    # Check for phone number
    print("🔍 Checking for phone number 829493816924844...")
    result = client.table('connected_phone_numbers').select('*').eq(
        'phone_number_id', '829493816924844'
    ).execute()
    
    print(f"\nPhone number records: {len(result.data if result.data else [])}")
    if result.data:
        for record in result.data:
            print(f"  - User ID: {record.get('user_id')}")
            print(f"  - Display: {record.get('display_phone_number')}")
            print(f"  - Active: {record.get('is_active')}")
    
    # Check for recent messages from this contact
    print("\n🔍 Checking for messages from 916383634873...")
    msg_result = client.table('whatsapp_messages').select('*').eq(
        'from_number', '916383634873'
    ).order('created_at', desc=True).limit(5).execute()
    
    print(f"\nMessage records: {len(msg_result.data if msg_result.data else [])}")
    if msg_result.data:
        for msg in msg_result.data:
            print(f"  - {msg.get('created_at')}: {msg.get('message_body')}")
            print(f"    Direction: {msg.get('direction')}, Status: {msg.get('status')}")
else:
    print("❌ Could not connect to Supabase")
