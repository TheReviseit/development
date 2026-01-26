"""
Test Google Sheets sync with a sample order.
This will help diagnose if sheets sync is working.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_sheets_sync():
    """Test Google Sheets sync."""
    
    print(f"\n{'='*70}")
    print(f"GOOGLE SHEETS SYNC TEST")
    print(f"{'='*70}\n")
    
    try:
        from tasks.orders import sync_order_to_sheets
        
        # Sample order data
        test_order_data = {
            "id": "test-order-123",
            "order_id": "TEST123",
            "created_at": "2026-01-26T16:00:00Z",
            "customer_name": "Test Customer",
            "customer_phone": "+919876543210",
            "customer_address": "123 Test Street, Mumbai",
            "items": [
                {
                    "name": "Test Product",
                    "quantity": 2,
                    "price": 1000,
                    "size": "M",
                    "color": "Blue"
                }
            ],
            "total_quantity": 2,
            "status": "pending",
            "source": "ai",
            "notes": "Test order for sheets sync"
        }
        
        # Get your user ID (replace with actual)
        user_id = input("Enter your user_id (from Supabase): ").strip()
        
        if not user_id:
            print("❌ User ID is required!")
            return False
        
        print(f"\n📊 Testing sheets sync for user: {user_id[:20]}...")
        print(f"📦 Test order: {test_order_data['order_id']}\n")
        
        # Call the sync function
        result = sync_order_to_sheets(
            order_id=test_order_data["order_id"],
            user_id=user_id,
            data=test_order_data,
            correlation_id="test-sync"
        )
        
        print(f"\n{'='*70}")
        print(f"RESULT")
        print(f"{'='*70}\n")
        
        if result.get("synced"):
            print(f"✅ SUCCESS! Order synced to Google Sheets")
            print(f"   Spreadsheet ID: {result.get('spreadsheet_id', 'N/A')[:30]}...")
            print(f"\n💡 Check your Google Sheet for the test order!")
        else:
            print(f"❌ FAILED to sync order")
            print(f"   Reason: {result.get('reason', 'Unknown')}")
            if result.get('error'):
                print(f"   Error: {result.get('error')}")
        
        print(f"\n{'='*70}\n")
        return result.get("synced", False)
        
    except ImportError as e:
        print(f"❌ ERROR: Could not import tasks.orders: {e}")
        print(f"\n💡 Make sure you're running this from the backend directory")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_sheets_sync()
