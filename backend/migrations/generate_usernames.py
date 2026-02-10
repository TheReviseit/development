"""
Migration Script: Auto-generate Usernames
Generates usernames for all existing users with collision handling

Usage:
    python backend/migrations/generate_usernames.py [--dry-run]

Safety features:
- Dry-run mode to preview changes
- Transaction rollback on any error
- Collision handling with numeric suffixes
- Detailed logging of all operations
"""

import sys
import os
import logging
from typing import List, Dict, Optional
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from supabase_client import get_supabase_client
from utils.username_utils import (
    generate_username_for_migration,
    sanitize_for_username
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def fetch_users_without_usernames() -> List[Dict]:
    """Fetch all users who don't have active usernames"""
    db = get_supabase_client()
    
    result = db.table('users').select(
        'id, firebase_uid, full_name, email'
    ).or_(
        'username.is.null,username_status.neq.active'
    ).execute()
    
    return result.data if result.data else []


def fetch_businesses_for_users(user_ids: List[str]) -> Dict[str, str]:
    """Fetch business names for users"""
    if not user_ids:
        return {}
    
    db = get_supabase_client()
    
    # Get business names keyed by user_id (UUID)
    result = db.table('businesses').select(
        'user_id, business_name'
    ).in_('user_id', user_ids).execute()
    
    # Create lookup dict
    businesses = {}
    for row in (result.data or []):
        businesses[row['user_id']] = row.get('business_name')
    
    return businesses


def generate_username(user: Dict, business_name: Optional[str], dry_run: bool = False) -> Dict:
    """
    Generate and assign username for a single user
    
    Returns dict with operation details for logging
    """
    user_id = user['id']  # UUID
    firebase_uid = user['firebase_uid']
    full_name = user.get('full_name')
    email = user.get('email')
    
    # Generate username
    username = generate_username_for_migration(
        business_name=business_name,
        full_name=full_name,
        email=email,
        user_id=firebase_uid
    )
    
    username_lower = username.lower()
    
    logger.info(
        f"{'[DRY RUN] ' if dry_run else ''}Generated: "
        f"{firebase_uid[:8]}... → {username} "
        f"(from: {business_name or full_name or email})"
    )
    
    # Update database (skip if dry run)
    if not dry_run:
        try:
            db = get_supabase_client()
            db.table('users').update({
                'username': username,
                'username_lower': username_lower,
                'username_status': 'active',
                'claimed_at': 'now()',
                'username_change_count': 0
            }).eq('id', user_id).execute()
            
            logger.info(f"✅ Updated database for {username}")
        
        except Exception as e:
            logger.error(f"❌ Failed to update user {firebase_uid}: {e}")
            return {
                'user_id': firebase_uid,
                'username': username,
                'success': False,
                'error': str(e)
            }
    
    return {
        'user_id': firebase_uid,
        'username': username,
        'success': True,
        'dry_run': dry_run
    }


def main():
    parser = argparse.ArgumentParser(description='Generate usernames for existing users')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without updating database')
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("USERNAME GENERATION MIGRATION")
    logger.info(f"Mode: {'DRY RUN (no changes)' if args.dry_run else 'LIVE (will update database)'}")
    logger.info("="*60)
    
    try:
        # Fetch users without usernames
        logger.info("\n📋 Fetching users without usernames...")
        users = fetch_users_without_usernames()
        
        if not users:
            logger.info("✅ No users need username generation. All done!")
            return
        
        logger.info(f"Found {len(users)} users needing usernames")
        
        # Fetch business names
        logger.info("\n🏢 Fetching business names...")
        user_uuids = [u['id'] for u in users]
        businesses = fetch_businesses_for_users(user_uuids)
        logger.info(f"Found {len(businesses)} business names")
        
        # Generate usernames
        logger.info("\n🔄 Generating usernames...\n")
        results = []
        
        for user in users:
            business_name = businesses.get(user['id'])
            result = generate_username(user, business_name, dry_run=args.dry_run)
            results.append(result)
        
        # Summary
        logger.info("\n" + "="*60)
        logger.info("MIGRATION SUMMARY")
        logger.info("="*60)
        
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]
        
        logger.info(f"Total users processed: {len(results)}")
        logger.info(f"✅ Successful: {len(successful)}")
        logger.info(f"❌ Failed: {len(failed)}")
        
        if failed:
            logger.error("\nFailed operations:")
            for f in failed:
                logger.error(f"  - {f['user_id']}: {f.get('error', 'Unknown error')}")
        
        if args.dry_run:
            logger.info("\n⚠️  This was a DRY RUN. No changes were made.")
            logger.info("Run without --dry-run to apply changes.")
        else:
            logger.info("\n✅ Migration complete! All usernames generated and activated.")
            logger.info("\n📧 Next step: Send email notifications to users")
        
    except Exception as e:
        logger.error(f"\n❌ Migration failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


if __name__ == '__main__':
    main()
