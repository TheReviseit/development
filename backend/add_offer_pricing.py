"""
Script to add offer pricing to your products.
This will set compare_at_price for products that should show discounts.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase_client

def add_offer_pricing():
    """Add sample offer pricing to products."""
    
    print(f"\n{'='*70}")
    print(f"ADD OFFER PRICING TO PRODUCTS")
    print(f"{'='*70}\n")
    
    client = get_supabase_client()
    if not client:
        print("❌ ERROR: Could not connect to Supabase!")
        return False
    
    try:
        # Get all products
        result = client.table('products').select('id, name, price').eq('is_deleted', False).execute()
        
        if not result.data:
            print("⚠️  No products found!")
            return False
        
        print(f"Found {len(result.data)} products\n")
        print("This script will add offer pricing to ALL products.")
        print("For each product, it will set compare_at_price = price * 2")
        print("(This creates a 50% OFF discount)\n")
        
        response = input("Do you want to continue? (yes/no): ").strip().lower()
        
        if response not in ['yes', 'y']:
            print("❌ Cancelled")
            return False
        
        print(f"\n{'='*70}")
        print("Updating products...")
        print(f"{'='*70}\n")
        
        updated_count = 0
        
        for p in result.data:
            product_id = p.get('id')
            name = p.get('name', 'Unnamed')
            price = p.get('price', 0)
            
            try:
                price_num = float(price) if price else 0
                
                if price_num > 0:
                    # Set compare_at_price to double the current price (50% discount)
                    compare_at_price = price_num * 2
                    
                    # Update the product
                    update_result = client.table('products').update({
                        'compare_at_price': compare_at_price
                    }).eq('id', product_id).execute()
                    
                    print(f"✅ {name}: ₹{price_num} → Set original price to ₹{compare_at_price}")
                    updated_count += 1
                else:
                    print(f"⚠️  {name}: Skipped (price is 0 or invalid)")
                    
            except Exception as e:
                print(f"❌ {name}: Error - {e}")
        
        print(f"\n{'='*70}")
        print(f"✅ Updated {updated_count} products with offer pricing!")
        print(f"{'='*70}\n")
        
        print("💡 Now your products will show as:")
        print("   ~~₹2000~~ ₹1000 🏷️ 50% OFF\n")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    add_offer_pricing()
