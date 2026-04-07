import json
from supabase_client import get_supabase_client
from datetime import datetime, timezone, timedelta

def expire_trial():
    db = get_supabase_client()
    user_id = '1697d523-86c3-4d95-8ae0-2c8246f7fe56'
    
    # Set expires_at to yesterday
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    
    result = db.table('free_trials').update({
        'status': 'expired',
        'expires_at': yesterday,
        'cancellation_reason': 'Test: manually expired for feature gate testing'
    }).eq('user_id', user_id).execute()
    
    print("Trial expired:", result.data)

if __name__ == '__main__':
    expire_trial()
