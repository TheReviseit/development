"""
Diagnostic script to check product pricing in Supabase.
This will help identify if compare_at_price is set correctly in your database.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_supabase_client

def check_product_pricing():
    """Check product pricing data in Supabase."""
    
    print(f"\n{'='*70}")
    print(f"PRODUCT PRICING DIAGNOSTIC")
    print(f"{'='*70}\n")
    
    client = get_supabase_client()
    if not client:
        print("❌ ERROR: Could not connect to Supabase!")
        print("   Check your .env file for SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return False
    
    try:
        # Get all products with pricing info
        result = client.table('products').select(
            'id, name, price, compare_at_price, price_unit, is_deleted'
        ).eq('is_deleted', False).limit(20).execute()
        
        if not result.data:
            print("⚠️  No products found in database!")
            print("   Make sure you have products in the 'products' table")
            return False
        
        print(f"✅ Found {len(result.data)} products\n")
        print(f"{'#':<4} {'Product Name':<30} {'Price':<12} {'Original':<12} {'Discount':<10}")
        print(f"{'-'*70}")
        
        products_with_offers = 0
        products_without_offers = 0
        
        for i, p in enumerate(result.data, 1):
            name = p.get('name', 'Unnamed')[:28]
            price = p.get('price')
            compare_at = p.get('compare_at_price')
            
            # Convert to float for comparison
            try:
                price_num = float(price) if price else 0
                compare_num = float(compare_at) if compare_at else 0
            except (ValueError, TypeError):
                price_num = 0
                compare_num = 0
            
            # Check if there's a valid offer
            has_offer = compare_num > price_num and price_num > 0
            
            if has_offer:
                discount = int(((compare_num - price_num) / compare_num) * 100)
                price_display = f"₹{price_num:.0f}"
                original_display = f"₹{compare_num:.0f}"
                discount_display = f"🏷️ {discount}% OFF"
                products_with_offers += 1
                marker = "✅"
            else:
                price_display = f"₹{price_num:.0f}" if price_num > 0 else "N/A"
                original_display = "—"
                discount_display = "—"
                products_without_offers += 1
                marker = "  "
            
            print(f"{marker} {i:<2} {name:<30} {price_display:<12} {original_display:<12} {discount_display:<10}")
        
        print(f"{'-'*70}")
        print(f"\n📊 Summary:")
        print(f"   Products with offers: {products_with_offers}")
        print(f"   Products without offers: {products_without_offers}")
        
        if products_with_offers == 0:
            print(f"\n⚠️  WARNING: No products have compare_at_price set!")
            print(f"\n💡 To add offer pricing:")
            print(f"   1. Go to Supabase Dashboard → Table Editor → products")
            print(f"   2. For each product, set 'compare_at_price' to the original price")
            print(f"   3. Make sure 'compare_at_price' > 'price' for the discount to show")
            print(f"\n   Example:")
            print(f"   - price: 2500 (offer price)")
            print(f"   - compare_at_price: 5000 (original price)")
            print(f"   - Result: Shows as ~~₹5000~~ ₹2500 🏷️ 50% OFF")
        
        print(f"\n{'='*70}\n")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    check_product_pricing()
