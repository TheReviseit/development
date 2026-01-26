"""
Script to swap price and compare_at_price for products where they are backwards.
This fixes products where compare_at_price < price (which is incorrect).
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase_client

def fix_swapped_prices():
    """Fix products where price and compare_at_price are swapped."""
    
    print(f"\n{'='*70}")
    print(f"FIX SWAPPED PRODUCT PRICES")
    print(f"{'='*70}\n")
    
    client = get_supabase_client()
    if not client:
        print("❌ ERROR: Could not connect to Supabase!")
        return False
    
    try:
        # Get all products
        result = client.table('products').select('id, name, price, compare_at_price').eq('is_deleted', False).execute()
        
        if not result.data:
            print("⚠️  No products found!")
            return False
        
        print(f"Found {len(result.data)} products\n")
        
        # Find products with swapped prices
        swapped_products = []
        for p in result.data:
            price = p.get('price')
            compare_at = p.get('compare_at_price')
            
            if price and compare_at:
                try:
                    price_num = float(price)
                    compare_num = float(compare_at)
                    
                    # If compare_at < price, they're swapped!
                    if compare_num < price_num:
                        swapped_products.append({
                            'id': p.get('id'),
                            'name': p.get('name'),
                            'current_price': price_num,
                            'current_compare_at': compare_num
                        })
                except (ValueError, TypeError):
                    pass
        
        if not swapped_products:
            print("✅ No products with swapped prices found!")
            print("   All products are correctly configured.")
            return True
        
        print(f"Found {len(swapped_products)} products with SWAPPED prices:\n")
        print(f"{'#':<4} {'Product Name':<30} {'Current':<15} {'Should Be':<15}")
        print(f"{'-'*70}")
        
        for i, p in enumerate(swapped_products, 1):
            current = f"price={p['current_price']}, compare={p['current_compare_at']}"
            should_be = f"price={p['current_compare_at']}, compare={p['current_price']}"
            print(f"{i:<4} {p['name'][:28]:<30} {current:<15} {should_be:<15}")
        
        print(f"\n{'='*70}")
        print("This script will SWAP price and compare_at_price for these products.")
        print(f"{'='*70}\n")
        
        response = input("Do you want to fix these products? (yes/no): ").strip().lower()
        
        if response not in ['yes', 'y']:
            print("❌ Cancelled")
            return False
        
        print(f"\n{'='*70}")
        print("Fixing products...")
        print(f"{'='*70}\n")
        
        fixed_count = 0
        
        for p in swapped_products:
            product_id = p['id']
            name = p['name']
            
            # Swap the prices
            new_price = p['current_compare_at']
            new_compare_at = p['current_price']
            
            try:
                # Update the product
                update_result = client.table('products').update({
                    'price': new_price,
                    'compare_at_price': new_compare_at
                }).eq('id', product_id).execute()
                
                print(f"✅ {name}: Fixed! Now showing Original: ₹{new_compare_at}, Offer: ₹{new_price}")
                fixed_count += 1
                    
            except Exception as e:
                print(f"❌ {name}: Error - {e}")
        
        print(f"\n{'='*70}")
        print(f"✅ Fixed {fixed_count} products!")
        print(f"{'='*70}\n")
        
        print("💡 Your products will now display correctly:")
        print("   Original: ₹1200, Offer: ₹900\n")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    fix_swapped_prices()
