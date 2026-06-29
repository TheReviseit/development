#!/usr/bin/env python3
import sys
import os
import base64
import json
from dotenv import load_dotenv
from supabase import create_client

# Add backend directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

# Import firebase client from backend
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from firebase_client import initialize_firebase, get_firestore_client
    FIREBASE_OK = True
except ImportError as e:
    print(f"Error importing firebase: {e}")
    FIREBASE_OK = False

def main():
    if not FIREBASE_OK:
        print("Firebase is not available. Please install dependencies.")
        return

    # Initialize Firebase
    if not initialize_firebase():
        print("Failed to initialize Firebase Admin SDK")
        return

    db = get_firestore_client()
    if not db:
        print("Failed to get Firestore client")
        return

    # Initialize Supabase client
    supabase_url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not supabase_url or not supabase_key:
        print("Missing Supabase configuration in environment variables.")
        return

    supabase = create_client(supabase_url, supabase_key)
    print("Initialized Supabase and Firestore clients successfully.")

    # 1. Fetch all documents from businesses collection in Firestore
    print("Fetching businesses from Firestore...")
    docs = db.collection('businesses').stream()
    
    count = 0
    updated_count = 0
    
    for doc in docs:
        data = doc.to_dict()
        doc_id = doc.id
        
        # Get user ID (document ID is typically the firebase UID, but double check userId field)
        firebase_uid = data.get('userId') or data.get('user_id') or doc_id
        business_name = data.get('businessName') or data.get('business_name')
        url_slug = data.get('urlSlug') or data.get('url_slug')
        
        if not business_name or not business_name.strip():
            continue
            
        count += 1
        
        # Generate default slug if missing
        if not url_slug or not url_slug.strip():
            url_slug = firebase_uid[:8].lower()
            
        print(f"[{count}] Found Firestore business: '{business_name}' for user {firebase_uid[:8]} (slug: {url_slug})")
        
        # 2. Check if user exists in Supabase users table
        try:
            res = supabase.table('users').select('id, firebase_uid, ai_settings_configured').eq('firebase_uid', firebase_uid).execute()
            if res.data:
                supabase_user = res.data[0]
                user_id = supabase_user['id']
                
                # Update users table if ai_settings_configured is not True
                if not supabase_user.get('ai_settings_configured'):
                    print(f"    -> Updating user in Supabase...")
                    update_res = supabase.table('users').update({
                        'ai_settings_configured': True,
                        'store_slug': url_slug
                    }).eq('id', user_id).execute()
                    
                    if update_res.data:
                        print(f"    -> Success: Updated ai_settings_configured=True, store_slug={url_slug}")
                        updated_count += 1
                    else:
                        print(f"    -> Failed to update user in Supabase")
                else:
                    print(f"    -> User already configured in Supabase.")
            else:
                print(f"    -> User {firebase_uid[:8]} not found in Supabase users table.")
        except Exception as err:
            print(f"    -> Error processing user {firebase_uid}: {err}")
            
    print(f"\nDone. Processed {count} configured businesses, updated {updated_count} users in Supabase.")

if __name__ == '__main__':
    main()
