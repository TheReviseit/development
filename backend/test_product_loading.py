"""
Quick test script to verify products are being loaded from Supabase.
Run this to check if your products are properly configured.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client import get_business_from_supabase

def test_product_loading(firebase_uid: str):
    """Test if products are being loaded correctly for a user."""
    
    print(f"\n{'='*60}")
    print(f"Testing Product Loading for User: {firebase_uid[:20]}...")
    print(f"{'='*60}\n")
    
    # Get business data
    business_data = get_business_from_supabase(firebase_uid)
    
    if not business_data:
        print("❌ ERROR: No business data found!")
        print(f"   Make sure user {firebase_uid} exists in the 'businesses' table")
        return False
    
    print(f"✅ Business loaded: {business_data.get('business_name', 'Unknown')}")
    print(f"   Business ID: {business_data.get('business_id', 'N/A')}")
    
    # Check categories
    categories = business_data.get('categories', [])
    print(f"\n📂 Categories: {len(categories)}")
    for i, cat in enumerate(categories, 1):
        print(f"   {i}. {cat}")
    
    # Check products
    products = business_data.get('products_services', [])
    print(f"\n📦 Products: {len(products)}")
    
    if not products:
        print("   ⚠️  WARNING: No products found!")
        print("   Possible reasons:")
        print("   1. No products in the 'products' table for this user")
        print("   2. All products are marked as deleted (is_deleted = true)")
        print("   3. Database connection issue")
        return False
    
    # Show product details
    for i, product in enumerate(products[:10], 1):  # Show first 10
        name = product.get('name', 'Unnamed')
        category = product.get('category', 'No category')
        price = product.get('price', 0)
        compare_at = product.get('compare_at_price')
        image = product.get('imageUrl', '')
        sizes = product.get('sizes', [])
        colors = product.get('colors', [])
        available = product.get('available', True)
        
        status = "✅" if available else "❌"
        img_status = "🖼️" if image else "📷"
        
        price_display = f"₹{price}"
        if compare_at and compare_at > price:
            price_display = f"₹{compare_at} -> ₹{price} ({(compare_at-price)/compare_at*100:.0f}% OFF)"
        
        print(f"\n   {i}. {status} {name}")
        print(f"      Category: {category}")
        print(f"      Price: {price_display}")
        print(f"      Image: {img_status} {'Yes' if image else 'No'}")
        if sizes:
            print(f"      Sizes: {', '.join(sizes[:5])}")
        if colors:
            print(f"      Colors: {', '.join(colors[:5])}")
    
    if len(products) > 10:
        print(f"\n   ... and {len(products) - 10} more products")
    
    print(f"\n{'='*60}")
    print("✅ Product loading test PASSED!")
    print(f"{'='*60}\n")
    
    return True

if __name__ == "__main__":
    # Get Firebase UID from command line or use default
    if len(sys.argv) > 1:
        firebase_uid = sys.argv[1]
    else:
        # Prompt for Firebase UID
        firebase_uid = input("Enter Firebase UID to test: ").strip()
    
    if not firebase_uid:
        print("❌ Error: Firebase UID is required")
        print("Usage: python test_product_loading.py <firebase_uid>")
        sys.exit(1)
    
    success = test_product_loading(firebase_uid)
    sys.exit(0 if success else 1)
