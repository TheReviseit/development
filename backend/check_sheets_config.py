"""
Check Google Sheets configuration for your business.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase_client

def check_sheets_config():
    """Check Google Sheets configuration."""
    
    print(f"\n{'='*70}")
    print(f"GOOGLE SHEETS CONFIGURATION CHECK")
    print(f"{'='*70}\n")
    
    client = get_supabase_client()
    if not client:
        print("❌ ERROR: Could not connect to Supabase!")
        return False
    
    try:
        # Get all users with their sheets config
        result = client.table("ai_capabilities").select(
            "user_id, order_sheet_url, order_sheet_sync_enabled, sheets_sync_enabled, sheets_spreadsheet_id, sheets_sheet_name"
        ).execute()
        
        if not result.data:
            print("⚠️  No ai_capabilities records found!")
            return False
        
        print(f"Found {len(result.data)} user(s)\n")
        
        for i, record in enumerate(result.data, 1):
            user_id = record.get('user_id', 'Unknown')
            
            # Check both old and new field names
            sheet_url = record.get('order_sheet_url')
            sync_enabled_old = record.get('order_sheet_sync_enabled', False)
            sync_enabled_new = record.get('sheets_sync_enabled', False)
            spreadsheet_id = record.get('sheets_spreadsheet_id')
            sheet_name = record.get('sheets_sheet_name', 'Orders')
            
            sync_enabled = sync_enabled_old or sync_enabled_new
            
            print(f"User {i}: {user_id[:20]}...")
            print(f"  Sync Enabled: {sync_enabled}")
            print(f"  Sheet URL: {sheet_url[:50] if sheet_url else 'Not set'}...")
            print(f"  Spreadsheet ID: {spreadsheet_id[:20] if spreadsheet_id else 'Not set'}...")
            print(f"  Sheet Name: {sheet_name}")
            
            if not sync_enabled:
                print(f"  ⚠️  WARNING: Sheets sync is DISABLED")
            elif not sheet_url and not spreadsheet_id:
                print(f"  ⚠️  WARNING: No spreadsheet URL or ID configured")
            else:
                print(f"  ✅ Configuration looks good")
            
            print()
        
        # Check for credentials
        print(f"{'='*70}")
        print("CREDENTIALS CHECK")
        print(f"{'='*70}\n")
        
        creds_path = os.getenv("GOOGLE_SHEETS_CREDENTIALS_PATH")
        creds_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
        firebase_creds = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        
        if creds_path:
            print(f"✅ GOOGLE_SHEETS_CREDENTIALS_PATH is set: {creds_path}")
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            full_path = os.path.join(backend_dir, creds_path)
            if os.path.exists(full_path):
                print(f"   ✅ File exists: {full_path}")
            else:
                print(f"   ❌ File NOT found: {full_path}")
        else:
            print(f"⚠️  GOOGLE_SHEETS_CREDENTIALS_PATH not set")
        
        if creds_json:
            print(f"✅ GOOGLE_SHEETS_CREDENTIALS env var is set (length: {len(creds_json)} chars)")
        else:
            print(f"⚠️  GOOGLE_SHEETS_CREDENTIALS env var not set")
        
        if firebase_creds:
            print(f"✅ FIREBASE_SERVICE_ACCOUNT_KEY is set (can be used as fallback)")
        else:
            print(f"⚠️  FIREBASE_SERVICE_ACCOUNT_KEY not set")
        
        if not creds_path and not creds_json and not firebase_creds:
            print(f"\n❌ ERROR: No Google Sheets credentials configured!")
            print(f"\n💡 To fix:")
            print(f"   1. Set GOOGLE_SHEETS_CREDENTIALS_PATH in .env")
            print(f"   2. OR set GOOGLE_SHEETS_CREDENTIALS in .env")
            print(f"   3. OR use FIREBASE_SERVICE_ACCOUNT_KEY (if it has Sheets API access)")
        
        print(f"\n{'='*70}\n")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    check_sheets_config()
