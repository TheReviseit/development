"""
Inventory Safety Net - Background Tasks
Detects and repairs orphaned stock confirmations.

This is a SAFETY NET, not a primary correctness mechanism.
The atomic RPC should prevent orphans, but this catches edge cases.
"""

import logging
from typing import Dict, Any

logger = logging.getLogger('reviseit.tasks.inventory_safety')


def repair_orphaned_confirmations() -> Dict[str, Any]:
    """
    Safety net: Find confirmed reservations without matching orders
    and restore the stock.
    
    This should rarely find anything if the atomic RPC is working correctly.
    Run every 5-10 minutes via Celery beat or cron.
    
    Returns:
        Dict with repair results
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Call the safety net RPC
        result = db.rpc('repair_orphaned_confirmations', {}).execute()
        
        if result.data:
            orphans_restored = result.data.get('orphans_restored', 0)
            
            if orphans_restored > 0:
                logger.warning(
                    f"🚨 SAFETY NET: Restored {orphans_restored} orphaned stock confirmations. "
                    f"This indicates a potential bug in the atomic confirmation flow.",
                    extra={"orphans_restored": orphans_restored}
                )
            else:
                logger.debug("✅ Safety net check: No orphans found")
            
            return {
                'success': True,
                'orphans_restored': orphans_restored
            }
        
        return {'success': True, 'orphans_restored': 0}
        
    except Exception as e:
        logger.error(f"Safety net repair failed: {e}", exc_info=True)
        return {'success': False, 'error': str(e)}


def validate_inventory_consistency() -> Dict[str, Any]:
    """
    Validate that confirmed reservations all have matching orders.
    Does NOT repair, just reports.
    
    Returns:
        Dict with validation results
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        # Find any confirmed reservations without matching orders
        result = db.from_('stock_reservations').select(
            'id, order_id, product_id, quantity, confirmed_at'
        ).eq('status', 'confirmed').is_('order_id', 'null').execute()
        
        orphaned = result.data if result.data else []
        
        if orphaned:
            logger.warning(
                f"⚠️ Found {len(orphaned)} orphaned confirmations (missing order_id)",
                extra={"orphaned_count": len(orphaned)}
            )
        
        return {
            'success': True,
            'is_consistent': len(orphaned) == 0,
            'orphaned_count': len(orphaned),
            'orphaned_reservations': [o['id'] for o in orphaned[:10]]  # Limit to 10
        }
        
    except Exception as e:
        logger.error(f"Consistency validation failed: {e}", exc_info=True)
        return {'success': False, 'error': str(e)}


# Celery task wrapper (if using Celery)
try:
    from celery_app import celery
    
    @celery.task(name='inventory.repair_orphaned_confirmations')
    def repair_orphaned_confirmations_task():
        """Celery task for orphan repair."""
        return repair_orphaned_confirmations()
    
    @celery.task(name='inventory.validate_consistency')
    def validate_consistency_task():
        """Celery task for consistency validation."""
        return validate_inventory_consistency()

except ImportError:
    # Celery not available - tasks can still be called directly
    pass
