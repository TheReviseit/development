"""
Audit Logging Service
Enterprise-grade async audit logging for console operations.

Features:
- Non-blocking: Never fails the request
- Type-safe: Accepts any string ID (UUID or external provider ID)
- Traceable: Includes correlation ID for distributed tracing
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from flask import request, has_request_context

logger = logging.getLogger('console.audit')


def get_client_ip() -> Optional[str]:
    """Get client IP from request headers."""
    if not has_request_context():
        return None
    
    # Check for forwarded IP first (behind proxy)
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip()
    
    return request.remote_addr


def get_request_id() -> Optional[str]:
    """Get request correlation ID from headers."""
    if not has_request_context():
        return None
    return request.headers.get('X-Request-Id')


def get_user_agent() -> Optional[str]:
    """Get user agent from request headers."""
    if not has_request_context():
        return None
    return request.headers.get('User-Agent')


def _write_audit_log_sync(audit_data: Dict[str, Any]) -> None:
    """
    Synchronously write audit log to database.
    Called from background thread.
    """
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        db.table('otp_console_audit_logs').insert(audit_data).execute()
        
    except Exception as e:
        # Log to file as fallback - NEVER raise
        logger.error(
            f"Audit log write failed: {e}",
            extra={
                'action': audit_data.get('action'),
                'resource_type': audit_data.get('resource_type'),
                'resource_id': audit_data.get('resource_id'),
                'correlation_id': audit_data.get('correlation_id')
            }
        )


def log_audit_event(
    user_id: Optional[str],
    org_id: Optional[str],
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    external_provider_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    async_mode: bool = True
) -> None:
    """
    Log an audit event asynchronously (non-blocking).
    
    This function:
    - NEVER blocks the request
    - NEVER raises exceptions  
    - Accepts any string as resource_id (UUID or external ID like sub_xxx)
    
    Args:
        user_id: Console user ID (UUID as string, or None)
        org_id: Organization ID (UUID as string, or None)
        action: Action performed (e.g., 'create_billing_order', 'create_api_key')
        resource_type: Type of resource (e.g., 'subscription', 'api_key', 'project')
        resource_id: Resource identifier - can be UUID or external ID (TEXT)
        external_provider_id: External provider ID (e.g., Razorpay sub_xxx)
        metadata: Additional data to log
        correlation_id: Request correlation ID for tracing
        ip_address: Client IP address (auto-detected if None)
        success: Whether the action succeeded
        error_message: Error message if action failed
        async_mode: If True, log in background thread (default). If False, log synchronously.
    """
    try:
        # Build audit data
        audit_data = {
            'action': action,
            'success': success,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Add optional fields (only if provided)
        if user_id:
            audit_data['user_id'] = str(user_id)
        if org_id:
            audit_data['org_id'] = str(org_id)
        if resource_type:
            audit_data['resource_type'] = resource_type
        if resource_id:
            audit_data['resource_id'] = str(resource_id)  # TEXT, not UUID
        if external_provider_id:
            audit_data['external_provider_id'] = str(external_provider_id)
        if metadata:
            audit_data['metadata'] = metadata
        if error_message:
            audit_data['error_message'] = error_message
            
        # Auto-detect from request context
        audit_data['correlation_id'] = correlation_id or get_request_id()
        audit_data['ip_address'] = ip_address or get_client_ip()
        audit_data['user_agent'] = get_user_agent()
        
        if async_mode:
            # Fire and forget - run in background thread
            thread = threading.Thread(
                target=_write_audit_log_sync,
                args=(audit_data,),
                daemon=True
            )
            thread.start()
        else:
            # Synchronous mode (for testing or critical paths)
            _write_audit_log_sync(audit_data)
            
    except Exception as e:
        # Log to file as fallback - NEVER fail the request
        logger.error(
            f"Failed to queue audit event: {e}",
            extra={
                'action': action,
                'resource_type': resource_type,
                'correlation_id': correlation_id
            }
        )


def log_billing_event(
    user_id: str,
    org_id: str,
    action: str,
    razorpay_id: Optional[str] = None,
    plan_name: Optional[str] = None,
    amount: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    """
    Convenience wrapper for billing-specific audit events.
    
    Args:
        user_id: Console user ID
        org_id: Organization ID
        action: Billing action (e.g., 'create_billing_order', 'verify_payment')
        razorpay_id: Razorpay subscription/order/payment ID (sub_xxx, order_xxx, pay_xxx)
        plan_name: Plan name (starter, growth, enterprise)
        amount: Amount in paise
        metadata: Additional metadata
    """
    full_metadata = metadata or {}
    if plan_name:
        full_metadata['plan_name'] = plan_name
    if amount:
        full_metadata['amount'] = amount
    if razorpay_id:
        full_metadata['razorpay_id'] = razorpay_id
    
    log_audit_event(
        user_id=user_id,
        org_id=org_id,
        action=action,
        resource_type='subscription',
        resource_id=razorpay_id,  # Store as TEXT, works now
        external_provider_id=razorpay_id,
        metadata=full_metadata
    )
