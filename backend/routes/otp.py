"""
OTP API Routes
REST API Endpoints for OTP Platform

Endpoints:
- POST /v1/otp/send - Generate and send OTP
- POST /v1/otp/verify - Verify OTP code
- POST /v1/otp/resend - Resend OTP with channel escalation
- GET /v1/otp/status/<request_id> - Check OTP status
"""

import logging
from flask import Blueprint, request, jsonify, g

from middleware.otp_auth_middleware import require_otp_auth, get_client_ip
from middleware.otp_rate_limiter import check_otp_rate_limits, get_rate_limiter
from middleware.security_enforcer import require_paid_otp_access

logger = logging.getLogger('otp.routes')

# Create blueprint
otp_bp = Blueprint('otp', __name__, url_prefix='/otp')


# =============================================================================
# SEND OTP
# =============================================================================

@otp_bp.route('/send', methods=['POST'])
@require_otp_auth(scopes=['send'])
@require_paid_otp_access()  # 🔒 NO OTP WITHOUT PAID PLAN
def send_otp():
    """
    Generate and send an OTP.
    
    Request Body:
        {
            "to": "+919876543210",
            "purpose": "login",
            "channel": "whatsapp",
            "otp_length": 6,
            "ttl": 300,
            "metadata": {}
        }
    
    Headers:
        Authorization: Bearer otp_live_xxx
        Idempotency-Key: uuid (optional)
    
    Response (Success):
        {
            "success": true,
            "request_id": "otp_req_xxx",
            "expires_in": 300
        }
    
    Response (Sandbox):
        {
            "success": true,
            "request_id": "otp_req_xxx",
            "expires_in": 300,
            "sandbox": true,
            "otp": "123456"
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            "success": False,
            "error": "INVALID_JSON",
            "message": "Invalid JSON in request body"
        }), 400
    
    # Extract parameters
    phone = data.get('to', '').strip()
    purpose = data.get('purpose', '').strip()
    channel = data.get('channel', 'whatsapp').strip()
    otp_length = data.get('otp_length', 6)
    ttl = data.get('ttl', 300)
    metadata = data.get('metadata', {})
    
    # Get idempotency key from header
    idempotency_key = request.headers.get('Idempotency-Key')
    
    # Validation
    if not phone:
        return jsonify({
            "success": False,
            "error": "INVALID_PHONE",
            "message": "Phone number is required"
        }), 400
    
    if not purpose:
        return jsonify({
            "success": False,
            "error": "INVALID_PURPOSE",
            "message": "Purpose is required (login, signup, password_reset, transaction)"
        }), 400
    
    valid_purposes = ['login', 'signup', 'password_reset', 'transaction']
    if purpose not in valid_purposes:
        return jsonify({
            "success": False,
            "error": "INVALID_PURPOSE",
            "message": f"Purpose must be one of: {valid_purposes}"
        }), 400
    
    if channel not in ['whatsapp', 'sms']:
        return jsonify({
            "success": False,
            "error": "INVALID_CHANNEL",
            "message": "Channel must be 'whatsapp' or 'sms'"
        }), 400
    
    if not isinstance(otp_length, int) or not 4 <= otp_length <= 8:
        return jsonify({
            "success": False,
            "error": "INVALID_OTP_LENGTH",
            "message": "OTP length must be between 4 and 8"
        }), 400
    
    if not isinstance(ttl, int) or not 60 <= ttl <= 600:
        return jsonify({
            "success": False,
            "error": "INVALID_TTL",
            "message": "TTL must be between 60 and 600 seconds"
        }), 400
    
    # Normalize phone
    phone = _normalize_phone(phone)
    
    # Check rate limits
    rate_check = check_otp_rate_limits(
        phone=phone,
        purpose=purpose,
        api_key_limit=g.otp_business.get('rate_limit_per_minute', 60)
    )
    
    if not rate_check['allowed']:
        # Record violation for potential auto-block
        get_rate_limiter().record_violation(phone)
        
        return jsonify({
            "success": False,
            "error": rate_check.get('error', 'RATE_LIMITED'),
            "message": rate_check.get('message', 'Rate limit exceeded'),
            "retry_after": rate_check.get('retry_after')
        }), 429
    
    # Get business context from auth middleware
    business_id = g.otp_business['business_id']
    is_sandbox = g.otp_is_sandbox
    
    # Send OTP via service
    try:
        from services.otp_service import get_otp_service
        import asyncio
        
        service = get_otp_service()
        
        # Run async function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.send_otp(
                business_id=business_id,
                phone=phone,
                purpose=purpose,
                channel=channel,
                otp_length=otp_length,
                ttl_seconds=ttl,
                idempotency_key=idempotency_key,
                metadata=metadata,
                is_sandbox=is_sandbox
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            error_code = result.get('error', 'SEND_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Error sending OTP: {e}")
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": "Failed to send OTP"
        }), 500


# =============================================================================
# VERIFY OTP
# =============================================================================

@otp_bp.route('/verify', methods=['POST'])
@require_otp_auth(scopes=['verify'])
def verify_otp():
    """
    Verify a user-submitted OTP.
    
    Request Body:
        {
            "request_id": "otp_req_xxx",
            "otp": "123456"
        }
    
    Response (Success):
        {
            "success": true,
            "verified": true
        }
    
    Response (Failed):
        {
            "success": false,
            "verified": false,
            "error": "INVALID_OTP",
            "attempts_remaining": 4
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            "success": False,
            "error": "INVALID_JSON",
            "message": "Invalid JSON in request body"
        }), 400
    
    request_id = data.get('request_id', '').strip()
    otp = data.get('otp', '').strip()
    
    # Validation
    if not request_id:
        return jsonify({
            "success": False,
            "error": "MISSING_REQUEST_ID",
            "message": "request_id is required"
        }), 400
    
    if not otp:
        return jsonify({
            "success": False,
            "error": "MISSING_OTP",
            "message": "OTP code is required"
        }), 400
    
    if not otp.isdigit():
        return jsonify({
            "success": False,
            "error": "INVALID_OTP",
            "message": "OTP must be numeric"
        }), 400
    
    # Verify via service
    try:
        from services.otp_service import get_otp_service
        import asyncio
        
        service = get_otp_service()
        business_id = g.otp_business['business_id']
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.verify_otp(
                request_id=request_id,
                otp=otp,
                business_id=business_id
            ))
        finally:
            loop.close()
        
        if result.get('success') and result.get('verified'):
            return jsonify(result), 200
        else:
            error_code = result.get('error', 'VERIFICATION_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Error verifying OTP: {e}")
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": "Failed to verify OTP"
        }), 500


# =============================================================================
# RESEND OTP
# =============================================================================

@otp_bp.route('/resend', methods=['POST'])
@require_otp_auth(scopes=['send'])
@require_paid_otp_access()  # 🔒 NO OTP WITHOUT PAID PLAN
def resend_otp():
    """
    Resend an OTP with channel escalation.
    
    Request Body:
        {
            "request_id": "otp_req_xxx",
            "channel": "sms"  // optional, force specific channel
        }
    
    Response:
        {
            "success": true,
            "request_id": "otp_req_xxx",
            "expires_in": 300,
            "channel": "whatsapp",
            "resend_count": 1
        }
    """
    try:
        data = request.get_json() or {}
    except Exception:
        return jsonify({
            "success": False,
            "error": "INVALID_JSON",
            "message": "Invalid JSON in request body"
        }), 400
    
    request_id = data.get('request_id', '').strip()
    force_channel = data.get('channel')
    
    if not request_id:
        return jsonify({
            "success": False,
            "error": "MISSING_REQUEST_ID",
            "message": "request_id is required"
        }), 400
    
    # Resend via service
    try:
        from services.otp_service import get_otp_service
        import asyncio
        
        service = get_otp_service()
        business_id = g.otp_business['business_id']
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.resend_otp(
                request_id=request_id,
                business_id=business_id,
                force_channel=force_channel
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            error_code = result.get('error', 'RESEND_FAILED')
            status_code = _error_to_status(error_code)
            return jsonify(result), status_code
            
    except Exception as e:
        logger.error(f"Error resending OTP: {e}")
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": "Failed to resend OTP"
        }), 500


# =============================================================================
# STATUS CHECK
# =============================================================================

@otp_bp.route('/status/<request_id>', methods=['GET'])
@require_otp_auth(scopes=['verify'])
def get_otp_status(request_id: str):
    """
    Get OTP request status.
    
    Response:
        {
            "success": true,
            "request_id": "otp_req_xxx",
            "status": "pending",
            "delivery_status": "delivered",
            "expires_at": "2024-01-01T12:00:00Z",
            "attempts": 0,
            "resend_count": 0
        }
    """
    if not request_id:
        return jsonify({
            "success": False,
            "error": "MISSING_REQUEST_ID",
            "message": "request_id is required"
        }), 400
    
    try:
        from services.otp_service import get_otp_service
        import asyncio
        
        service = get_otp_service()
        business_id = g.otp_business['business_id']
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(service.get_status(
                request_id=request_id,
                business_id=business_id
            ))
        finally:
            loop.close()
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Error getting OTP status: {e}")
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": "Failed to get OTP status"
        }), 500


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _normalize_phone(phone: str) -> str:
    """Normalize phone number to E.164 format."""
    # Remove spaces, dashes, parentheses
    phone = ''.join(c for c in phone if c.isdigit() or c == '+')
    
    # Ensure + prefix
    if not phone.startswith('+'):
        if len(phone) == 10:
            phone = '+91' + phone  # Default to India
        else:
            phone = '+' + phone
    
    return phone


def _error_to_status(error_code: str) -> int:
    """Map error codes to HTTP status codes."""
    error_map = {
        'INVALID_PHONE': 400,
        'INVALID_PURPOSE': 400,
        'INVALID_CHANNEL': 400,
        'INVALID_OTP': 400,
        'MISSING_REQUEST_ID': 400,
        'MISSING_OTP': 400,
        'INVALID_API_KEY': 401,
        'UNAUTHORIZED': 403,
        'PHONE_BLOCKED': 403,
        'REQUEST_NOT_FOUND': 404,
        'ALREADY_VERIFIED': 409,
        'OTP_EXPIRED': 410,
        'RATE_LIMITED': 429,
        'MAX_ATTEMPTS_EXCEEDED': 429,
        'MAX_RESENDS_EXCEEDED': 429,
        'COOLDOWN_ACTIVE': 429,
        'INTERNAL_ERROR': 500,
        'DATABASE_ERROR': 500,
    }
    return error_map.get(error_code, 400)


# =============================================================================
# HEALTH CHECK
# =============================================================================

@otp_bp.route('/health', methods=['GET'])
def otp_health_check():
    """
    OTP Delivery Health Check Endpoint.
    
    Returns status of critical OTP dependencies:
    - WhatsApp API credentials
    - Celery worker availability
    - Last successful delivery timestamp
    
    Response:
        {
            "success": true,
            "whatsapp": "ok",
            "celery": "ok",
            "last_delivery": "2026-02-04T10:21:00Z"
        }
    """
    import os
    from datetime import datetime
    
    health = {
        "success": True,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    # Check WhatsApp credentials
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
    template_name = os.getenv("WHATSAPP_OTP_TEMPLATE", "otp_authentication")
    
    if phone_number_id and access_token and len(access_token) > 50:
        health["whatsapp"] = "ok"
        health["whatsapp_template"] = template_name
    else:
        health["whatsapp"] = "error"
        health["whatsapp_error"] = "Credentials not configured or invalid"
        health["success"] = False
    
    # Check Celery worker availability
    try:
        from celery_app import celery_app
        if celery_app:
            # Try to inspect active workers
            inspect = celery_app.control.inspect(timeout=2.0)
            active = inspect.active()
            if active:
                health["celery"] = "ok"
                health["celery_workers"] = len(active)
            else:
                health["celery"] = "warning"
                health["celery_warning"] = "No active workers found - OTPs will use sync fallback"
        else:
            health["celery"] = "disabled"
    except Exception as e:
        health["celery"] = "error"
        health["celery_error"] = str(e)
    
    # Check last successful delivery
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table("otp_requests").select(
            "created_at"
        ).eq("delivery_status", "delivered").order(
            "created_at", desc=True
        ).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            health["last_delivery"] = result.data[0]["created_at"]
        else:
            health["last_delivery"] = None
    except Exception as e:
        health["last_delivery_error"] = str(e)
    
    status_code = 200 if health["success"] else 503
    return jsonify(health), status_code


# =============================================================================
# ERROR HANDLERS
# =============================================================================

@otp_bp.errorhandler(404)
def not_found(error):
    return jsonify({
        "success": False,
        "error": "NOT_FOUND",
        "message": "Resource not found"
    }), 404


@otp_bp.errorhandler(500)
def internal_error(error):
    return jsonify({
        "success": False,
        "error": "INTERNAL_ERROR",
        "message": "An internal error occurred"
    }), 500
