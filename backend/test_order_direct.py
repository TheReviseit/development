"""
Test Order Creation Directly
Run this to test the order creation flow without WhatsApp
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.order_service import get_order_service
from domain import OrderCreate, OrderItem, OrderSource
from supabase_client import get_supabase_client

def test_create_order():
    """Test creating an order directly."""
    
    print("=" * 60)
    print("Testing Order Creation")
    print("=" * 60)
    
    # Initialize service
    supabase = get_supabase_client()
    service = get_order_service(supabase)
    
    # Create test order data
    order_data = OrderCreate(
        user_id="4GheHFoNahhhd3rC26WuFaxgwVr2",  # Your Firebase UID
        customer_name="Test Customer",
        customer_phone="9999999999",
        items=[
            OrderItem(
                product_id="1767810069403",
                name="Test Product",
                quantity=1,
                size="L",
                color="Blue",
            )
        ],
        source=OrderSource.MANUAL,  # Use MANUAL to avoid AI flow idempotency
        notes="Direct test order",
    )
    
    print(f"\n📦 Creating order...")
    print(f"   Customer: {order_data.customer_name}")
    print(f"   Phone: {order_data.customer_phone}")
    print(f"   Items: {len(order_data.items)}")
    
    try:
        # Create order
        order = service.create_order(order_data)
        
        print(f"\n✅ Order created successfully!")
        print(f"   Order ID: {order.id}")
        print(f"   Status: {order.status.value}")
        print(f"   Created: {order.created_at}")
        
        # Wait a bit for sheets sync (if synchronous)
        import time
        print(f"\n⏳ Waiting 5 seconds for Google Sheets sync...")
        time.sleep(5)
        
        print(f"\n✅ DONE")
        print(f"\nNow check:")
        print(f"1. Supabase orders table for order: {order.id}")
        print(f"2. Google Sheet for new row")
        
        return order
        
    except Exception as e:
        print(f"\n❌ Error creating order: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_create_order()
