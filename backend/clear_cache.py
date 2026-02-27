"""
Clear all feature gate caches for a specific user
"""

import sys
import redis
import os
from dotenv import load_dotenv

load_dotenv()

def clear_user_cache(firebase_uid):
    """Clear all Redis caches for a user"""
    
    redis_url = os.getenv('REDIS_URL')
    if not redis_url:
        print("❌ REDIS_URL not configured")
        return
    
    try:
        r = redis.from_url(redis_url, decode_responses=True)
        
        print(f"\n{'='*80}")
        print(f"CLEARING CACHES FOR USER: {firebase_uid}")
        print(f"{'='*80}\n")
        
        # Get Supabase UUID from Firebase UID
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        user_result = db.table('users').select('id').eq('firebase_uid', firebase_uid).execute()
        
        if not user_result.data:
            print(f"❌ User not found: {firebase_uid}")
            return
        
        supabase_uuid = user_result.data[0]['id']
        print(f"✅ Found user: {firebase_uid}")
        print(f"   Supabase UUID: {supabase_uuid}\n")
        
        # Clear all possible cache keys
        patterns = [
            f"fg:*:{supabase_uuid}:*",  # Feature gate caches
            f"fg:*:{firebase_uid}:*",   # In case Firebase UID is used
            f"subscription:*:{supabase_uuid}",
            f"subscription:*:{firebase_uid}",
            f"plan_features:*",
            f"usage:*:{supabase_uuid}:*",
            f"slug:*:{firebase_uid}",
        ]
        
        total_deleted = 0
        
        for pattern in patterns:
            keys = r.keys(pattern)
            if keys:
                deleted = r.delete(*keys)
                print(f"✅ Deleted {deleted} keys matching: {pattern}")
                total_deleted += deleted
            else:
                print(f"   No keys found for: {pattern}")
        
        print(f"\n{'='*80}")
        print(f"TOTAL KEYS DELETED: {total_deleted}")
        print(f"{'='*80}\n")
        
        if total_deleted > 0:
            print("✅ Cache cleared! Refresh your browser and try again.")
        else:
            print("⚠️ No cache keys found. The issue might not be cache-related.")
        
    except Exception as e:
        print(f"❌ Error clearing cache: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python clear_cache.py <firebase_uid>")
        print("Example: python clear_cache.py 00KzWkOlnKern4CqquzBqptHdN72")
        sys.exit(1)
    
    firebase_uid = sys.argv[1]
    clear_user_cache(firebase_uid)
