"""
Firebase Client for Python Backend
Connects to Firestore to fetch business data for AI context
"""

import os
import json
import base64
from typing import Optional, Dict, Any

# Firebase Admin SDK
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("⚠️ firebase-admin not installed. Run: pip install firebase-admin")

# Singleton for Firebase app
_firebase_initialized = False
_firestore_client = None


def initialize_firebase():
    """
    Initialize Firebase Admin SDK.
    Uses FIREBASE_SERVICE_ACCOUNT_KEY env var (base64-encoded JSON) or falls back to credential file.
    """
    global _firebase_initialized, _firestore_client
    
    if _firebase_initialized:
        return True
    
    if not FIREBASE_AVAILABLE:
        return False
    
    try:
        # Option 1: Base64-encoded service account key (same as frontend)
        service_account_base64 = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
        
        if service_account_base64:
            # Decode from base64
            service_account_json = base64.b64decode(service_account_base64).decode('utf-8')
            service_account = json.loads(service_account_json)
            cred = credentials.Certificate(service_account)
            print("🔥 Firebase: Using service account from environment variable")
        else:
            # Option 2: Look for credential file in common locations
            credential_paths = [
                os.path.join(os.path.dirname(__file__), '..', 'frontend', 'credentials', 'reviseit-def4c-firebase-adminsdk-fbsvc-02f67295ed.json'),
                os.path.join(os.path.dirname(__file__), 'credentials', 'firebase-credentials.json'),
                os.getenv('FIREBASE_CREDENTIALS_PATH', ''),
            ]
            
            cred_path = None
            for path in credential_paths:
                if path and os.path.exists(path):
                    cred_path = path
                    break
            
            if not cred_path:
                print("⚠️ Firebase: No credentials found. Set FIREBASE_SERVICE_ACCOUNT_KEY env var.")
                return False
            
            cred = credentials.Certificate(cred_path)
            print(f"🔥 Firebase: Using credential file: {os.path.basename(cred_path)}")
        
        # Initialize the app
        firebase_admin.initialize_app(cred)
        _firestore_client = firestore.client()
        _firebase_initialized = True
        print("✅ Firebase Admin SDK initialized successfully")
        return True
        
    except Exception as e:
        print(f"❌ Firebase initialization failed: {e}")
        return False


def get_firestore_client():
    """Get Firestore client, initializing Firebase if needed."""
    global _firestore_client
    
    if not _firebase_initialized:
        initialize_firebase()
    
    return _firestore_client


def get_business_data_from_firestore(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch business data from Firestore for AI context.
    
    Business data is stored at: businesses/{userId}
    
    Args:
        user_id: Firebase user ID (same as used in frontend)
        
    Returns:
        Business data dict with products, timings, FAQs, etc.
        Returns None if not found or Firebase not available.
    """
    print(f"🔍 Looking up Firestore: businesses/{user_id}")
    db = get_firestore_client()
    if not db:
        return None
    
    try:
        doc_ref = db.collection('businesses').document(user_id)
        doc = doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict()
            print(f"📊 Loaded business data from Firestore for user: {user_id}")
            print(f"   Business: {data.get('businessName', 'Unknown')}")
            print(f"   Products: {len(data.get('products', []))} items")
            # Pass the Firebase UID explicitly to ensure correct business_id
            return convert_firestore_to_ai_format(data, firebase_uid=user_id)
        else:
            print(f"⚠️ No business data found in Firestore for user: {user_id}")
            return None
            
    except Exception as e:
        print(f"❌ Error fetching business data from Firestore: {e}")
        return None


def convert_firestore_to_ai_format(data: Dict[str, Any], firebase_uid: str = None) -> Dict[str, Any]:
    """
    Convert Firestore document format to AI Brain expected format.
    
    Firestore uses camelCase, AI Brain expects snake_case.
    
    Args:
        data: Firestore document data
        firebase_uid: Firebase UID to use as business_id (for booking operations)
    """
    # Get socialMedia from Firestore (camelCase)
    social_media_data = data.get('socialMedia', {})
    
    # Use Firebase UID as business_id for consistency with booking operations
    # This ensures AI bookings are associated with the correct dashboard user
    business_id = firebase_uid or data.get('businessId') or data.get('userId', 'unknown')
    
    return {
        'business_id': business_id,
        'business_name': data.get('businessName', 'Our Business'),
        'industry': data.get('industry', 'other'),
        'description': data.get('description', ''),
        'contact': {
            'phone': data.get('contact', {}).get('phone', ''),
            'email': data.get('contact', {}).get('email', ''),
            'whatsapp': data.get('contact', {}).get('whatsapp', ''),
            'website': data.get('contact', {}).get('website', ''),
        },
        'location': {
            'address': data.get('location', {}).get('address', ''),
            'city': data.get('location', {}).get('city', ''),
            'state': data.get('location', {}).get('state', ''),
            'pincode': data.get('location', {}).get('pincode', ''),
            'google_maps_link': data.get('location', {}).get('googleMapsLink', ''),
        },
        'timings': convert_timings(data.get('timings', {})),
        'products_services': convert_products(data.get('products', [])),
        'policies': {
            'refund': data.get('policies', {}).get('refund', ''),
            'cancellation': data.get('policies', {}).get('cancellation', ''),
            'delivery': data.get('policies', {}).get('delivery', ''),
            'payment_methods': data.get('policies', {}).get('paymentMethods', []),
        },
        'faqs': [
            {'question': faq.get('question', ''), 'answer': faq.get('answer', '')}
            for faq in data.get('faqs', [])
        ],
        # Social media links for AI context
        'social_media': {
            'instagram': social_media_data.get('instagram', ''),
            'facebook': social_media_data.get('facebook', ''),
            'twitter': social_media_data.get('twitter', ''),
            'youtube': social_media_data.get('youtube', ''),
        },
    }


def convert_timings(timings: Dict[str, Any]) -> Dict[str, Any]:
    """Convert timings from camelCase to snake_case."""
    result = {}
    for day, timing in timings.items():
        result[day] = {
            'open': timing.get('open', '09:00'),
            'close': timing.get('close', '18:00'),
            'is_closed': timing.get('isClosed', False),
        }
    return result


def convert_products(products: list) -> list:
    """Convert products list from camelCase to snake_case."""
    return [
        {
            'name': p.get('name', ''),
            'category': p.get('category', ''),
            'price': p.get('price', 0),
            'price_unit': p.get('priceUnit', 'INR'),
            'duration': p.get('duration', ''),
            'available': p.get('available', True),
        }
        for p in products
    ]
