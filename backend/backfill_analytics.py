"""
Backfill analytics_daily from existing whatsapp_messages.
Run this once to populate historical analytics data.
"""

import os
from datetime import datetime, timedelta
from collections import defaultdict

# Load environment
from dotenv import load_dotenv
load_dotenv()

from supabase_client import get_supabase_client

def backfill_analytics():
    """Aggregate all historical messages into analytics_daily."""
    client = get_supabase_client()
    if not client:
        print("❌ Could not connect to Supabase")
        return
    
    print("📊 Starting analytics backfill...")
    
    # Get all messages with their business_id
    print("📥 Fetching all messages...")
    result = client.table('whatsapp_messages').select(
        'id, business_id, direction, status, is_ai_generated, created_at'
    ).execute()
    
    messages = result.data or []
    print(f"   Found {len(messages)} messages")
    
    if not messages:
        print("⚠️ No messages found to aggregate")
        return
    
    # Get business_id to user_id mapping
    print("📥 Fetching business managers...")
    bm_result = client.table('connected_business_managers').select('id, user_id').execute()
    bm_map = {bm['id']: bm['user_id'] for bm in (bm_result.data or [])}
    print(f"   Found {len(bm_map)} business managers")
    
    # Aggregate by user_id and date
    # Structure: {user_id: {date: {field: count}}}
    analytics = defaultdict(lambda: defaultdict(lambda: {
        'messages_sent': 0,
        'messages_received': 0,
        'messages_delivered': 0,
        'messages_read': 0,
        'messages_failed': 0,
        'ai_replies_generated': 0,
    }))
    
    for msg in messages:
        business_id = msg.get('business_id')
        if not business_id or business_id not in bm_map:
            continue
            
        user_id = bm_map[business_id]
        
        # Parse date from created_at
        created_at = msg.get('created_at', '')
        if not created_at:
            continue
        
        try:
            # Handle different date formats
            if 'T' in created_at:
                date_str = created_at.split('T')[0]
            else:
                date_str = created_at.split(' ')[0]
        except:
            continue
        
        direction = msg.get('direction', '')
        status = msg.get('status', '')
        is_ai = msg.get('is_ai_generated', False)
        
        stats = analytics[user_id][date_str]
        
        if direction == 'inbound':
            stats['messages_received'] += 1
        elif direction == 'outbound':
            stats['messages_sent'] += 1
            if is_ai:
                stats['ai_replies_generated'] += 1
        
        if status == 'delivered':
            stats['messages_delivered'] += 1
        elif status == 'read':
            stats['messages_read'] += 1
            stats['messages_delivered'] += 1  # Read implies delivered
        elif status == 'failed':
            stats['messages_failed'] += 1
    
    # Upsert into analytics_daily
    print("\n📤 Upserting analytics records...")
    total_records = 0
    
    for user_id, dates in analytics.items():
        for date_str, stats in dates.items():
            record = {
                'user_id': str(user_id),
                'date': date_str,
                **stats
            }
            
            try:
                # Use upsert with conflict handling
                client.table('analytics_daily').upsert(
                    record,
                    on_conflict='user_id,date'
                ).execute()
                total_records += 1
                print(f"   ✅ {date_str}: sent={stats['messages_sent']}, received={stats['messages_received']}, ai={stats['ai_replies_generated']}")
            except Exception as e:
                print(f"   ⚠️ Error for {date_str}: {e}")
    
    print(f"\n✅ Backfill complete! Created/updated {total_records} analytics records.")


if __name__ == "__main__":
    backfill_analytics()
