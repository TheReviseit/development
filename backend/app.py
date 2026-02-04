"""
Flask Backend for WhatsApp Admin Dashboard
Production-ready with advanced caching, memory management, and performance optimizations.

Performance Features:
- Gunicorn + gevent for async I/O
- Multi-layer caching (L1: in-memory, L2: Redis)
- Circuit breaker for external API calls
- Gzip compression
- Request profiling and metrics
"""

import os
import time
import asyncio
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps

# Load environment variables first
load_dotenv()

# =============================================================================
# Production Configuration
# =============================================================================

try:
    from config import get_config
    prod_config = get_config()
    PRODUCTION_CONFIG_AVAILABLE = True
except ImportError:
    PRODUCTION_CONFIG_AVAILABLE = False
    prod_config = None

# =============================================================================
# Monitoring and Logging Setup (before other imports)
# =============================================================================

try:
    from monitoring import setup_structured_logging, get_logger
    setup_structured_logging()
    logger = get_logger('reviseit.app')
    LOGGING_CONFIGURED = True
except ImportError:
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger('reviseit.app')
    LOGGING_CONFIGURED = False

# Suppress noisy third-party loggers
import logging
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logging.getLogger('hpack').setLevel(logging.WARNING)

# =============================================================================
# Service Imports
# =============================================================================

from whatsapp_service import WhatsAppService

# New modular routes
try:
    from routes import register_routes
    ROUTES_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Routes module not available: {e}")
    ROUTES_AVAILABLE = False
    register_routes = None

# Rate limiting middleware
try:
    from middleware import rate_limit, get_webhook_security
    RATE_LIMIT_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Rate limiting not available: {e}")
    RATE_LIMIT_AVAILABLE = False
    rate_limit = None
    get_webhook_security = None

# Supabase client for multi-tenant credential lookup
try:
    # Use enterprise-grade credential manager for credentials (with caching, retry, fallback)
    from credential_manager import (
        get_credentials_by_phone_number_id,
        get_credential_manager,
        credential_health_check,
    )
    # Import other functions from supabase_client
    from supabase_client import (
        get_business_data_for_user,
        get_firebase_uid_from_user_id,
        get_business_id_for_user,
        get_business_data_from_supabase,
        get_ai_capabilities_from_supabase,
        get_business_from_supabase,  # New consolidated business data
        store_message,
        update_message_status,
        get_or_create_conversation
    )
    SUPABASE_AVAILABLE = True
    CREDENTIAL_MANAGER_AVAILABLE = True
    logger.info("🚀 Enterprise Credential Manager loaded")
except ImportError as e:
    # Fallback to original supabase_client
    logger.warning(f"Credential manager not available, using supabase_client: {e}")
    CREDENTIAL_MANAGER_AVAILABLE = False
    try:
        from supabase_client import (
            get_credentials_by_phone_number_id, 
            get_business_data_for_user,
            get_firebase_uid_from_user_id,
            get_business_id_for_user,
            get_business_data_from_supabase,
            get_ai_capabilities_from_supabase,
            get_business_from_supabase,
            store_message,
            update_message_status,
            get_or_create_conversation
        )
        SUPABASE_AVAILABLE = True
    except ImportError as e2:
        logger.warning(f"Supabase client not available: {e2}")
        SUPABASE_AVAILABLE = False
        get_credentials_by_phone_number_id = None
        get_business_data_for_user = None
        get_firebase_uid_from_user_id = None
        get_business_data_from_supabase = None
        get_ai_capabilities_from_supabase = None
        get_business_from_supabase = None
        store_message = None
        update_message_status = None
        get_or_create_conversation = None

# Firebase client for business data (Firestore)
try:
    from firebase_client import get_business_data_from_firestore, initialize_firebase
    FIREBASE_AVAILABLE = initialize_firebase()
    from push_notification import send_push_to_user
except ImportError as e:
    logger.warning(f"Firebase client or push utility not available: {e}")
    FIREBASE_AVAILABLE = False
    get_business_data_from_firestore = None
    send_push_to_user = None

# =============================================================================
# Production Extensions (Caching, Compression, Profiling)
# =============================================================================

try:
    from extensions import init_extensions
    EXTENSIONS_AVAILABLE = True
except ImportError:
    EXTENSIONS_AVAILABLE = False
    init_extensions = None

# Advanced caching
try:
    from cache import get_cache_manager, cache_response
    ADVANCED_CACHE_AVAILABLE = True
except ImportError:
    ADVANCED_CACHE_AVAILABLE = False
    get_cache_manager = None

# Circuit breaker for resilience
try:
    from resilience import (
        get_circuit_breaker, 
        with_circuit_breaker,
        retry_with_backoff,
        get_fallback_handler,
    )
    RESILIENCE_AVAILABLE = True
except ImportError:
    RESILIENCE_AVAILABLE = False
    get_circuit_breaker = None

# Metrics
try:
    from monitoring import track_request_latency, get_metrics_summary, check_kpis
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

# =============================================================================
# AI Brain Import
# =============================================================================

try:
    from ai_brain import AIBrain, AIBrainConfig
    from supabase_client import get_supabase_client
    
    supabase_client = get_supabase_client() if SUPABASE_AVAILABLE else None
    ai_brain = AIBrain(
        config=AIBrainConfig.from_env(),
        supabase_client=supabase_client
    )
    AI_BRAIN_AVAILABLE = True
    logger.info("🧠 AI Brain initialized with usage tracking")
except Exception as e:
    logger.warning(f"AI Brain not available (initialization failed): {e}")
    ai_brain = None
    AI_BRAIN_AVAILABLE = False

# =============================================================================
# Flask App Initialization
# =============================================================================

app = Flask(__name__)

# Configure from production config
if PRODUCTION_CONFIG_AVAILABLE and prod_config:
    app.config.update(prod_config.to_flask_config())

# Configure CORS
frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
allowed_origins = [
    # Development URLs
    'http://localhost:3000',
    'http://localhost:3001',
    # Production frontend URLs
    'https://flowauxi.com',
    'https://www.flowauxi.com',
]
# Add FRONTEND_URL from env if not already in list
if frontend_url and frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

CORS(app, resources={
    r"/api/*": {
        "origins": allowed_origins,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-User-ID", "X-User-Id", "X-Request-Id"]
    }
})

# Initialize WhatsApp service
whatsapp_service = WhatsAppService()

# Initialize production extensions (compression, caching, profiling)
if EXTENSIONS_AVAILABLE and init_extensions:
    redis_url = os.getenv("REDIS_URL")
    init_extensions(app, redis_url)
    logger.info("✅ Production extensions initialized")

# Register modular routes
if ROUTES_AVAILABLE and register_routes:
    register_routes(app)

# Register OTP API routes (v1)
try:
    from routes.otp import otp_bp
    app.register_blueprint(otp_bp, url_prefix='/v1/otp')
    logger.info("🔐 OTP API routes registered (/v1/otp/*)")
except ImportError as e:
    logger.warning(f"OTP routes not available: {e}")

# Register Console Auth routes
try:
    from routes.console_auth import console_auth_bp
    app.register_blueprint(console_auth_bp)
    logger.info("👤 Console Auth routes registered (/console/auth/*)")
except ImportError as e:
    logger.warning(f"Console Auth routes not available: {e}")

# Register Console API routes
try:
    from routes.console_api import console_api_bp
    app.register_blueprint(console_api_bp)
    logger.info("📊 Console API routes registered (/console/*)")
except ImportError as e:
    logger.warning(f"Console API routes not available: {e}")

# Initialize webhook security
webhook_security = None
if RATE_LIMIT_AVAILABLE and get_webhook_security:
    webhook_security = get_webhook_security()
    logger.info("🔒 Webhook security initialized")

# Initialize cache manager
cache_manager = None
if ADVANCED_CACHE_AVAILABLE and get_cache_manager:
    cache_manager = get_cache_manager()
    logger.info("💾 Advanced cache manager initialized")

# =============================================================================
# Request Timing Middleware
# =============================================================================

@app.before_request
def before_request():
    """Record request start time."""
    g.start_time = time.time()


@app.after_request
def after_request(response):
    """Add performance headers to response."""
    if hasattr(g, 'start_time'):
        elapsed_ms = (time.time() - g.start_time) * 1000
        response.headers['X-Response-Time'] = f"{elapsed_ms:.2f}ms"
        
        # Log slow requests
        if elapsed_ms > 500:
            logger.warning(f"Slow request: {request.path} took {elapsed_ms:.2f}ms")
    
    # Add rate limit headers if available
    if hasattr(g, 'rate_limit_info'):
        info = g.rate_limit_info
        response.headers['X-RateLimit-Limit'] = str(info.get('limit', 60))
        response.headers['X-RateLimit-Remaining'] = str(info.get('remaining', 60))
    
    return response


# =============================================================================
# Business Data Cache
# =============================================================================

BUSINESS_DATA_CACHE = {}
DEFAULT_BUSINESS_DATA = {
    "business_id": "default",
    "business_name": "Our Business",
    "industry": "other",
    "products_services": [],
    "contact": {"phone": os.getenv('WHATSAPP_PHONE_NUMBER_ID', '')},
}


# =============================================================================
# API Endpoints
# =============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint with system status."""
    health = {
        'status': 'ok',
        'message': 'WhatsApp Admin API is running',
        'components': {
            'ai_brain': AI_BRAIN_AVAILABLE,
            'supabase': SUPABASE_AVAILABLE,
            'firebase': FIREBASE_AVAILABLE,
            'cache': ADVANCED_CACHE_AVAILABLE,
            'resilience': RESILIENCE_AVAILABLE,
            'credential_manager': CREDENTIAL_MANAGER_AVAILABLE if 'CREDENTIAL_MANAGER_AVAILABLE' in dir() else False,
        }
    }
    
    # Add metrics if available
    if METRICS_AVAILABLE:
        try:
            health['metrics'] = get_metrics_summary()
        except Exception:
            pass
    
    return jsonify(health), 200


@app.route('/api/health/detailed', methods=['GET'])
def detailed_health_check():
    """Detailed health check with KPI status."""
    health = {
        'status': 'healthy',
        'timestamp': time.time(),
    }
    
    # Check cache
    if cache_manager:
        health['cache'] = cache_manager.get_stats()
    
    # Check credential manager
    if CREDENTIAL_MANAGER_AVAILABLE:
        try:
            health['credentials'] = credential_health_check()
        except Exception as e:
            health['credentials'] = {'error': str(e)}
    
    # Check KPIs
    if METRICS_AVAILABLE:
        try:
            health['kpis'] = check_kpis()
            if health['kpis']['status'] != 'healthy':
                health['status'] = health['kpis']['status']
        except Exception as e:
            health['kpis'] = {'error': str(e)}
    
    return jsonify(health), 200


@app.route('/api/health/credentials', methods=['GET'])
def credentials_health():
    """Credential manager health and statistics."""
    if CREDENTIAL_MANAGER_AVAILABLE:
        try:
            manager = get_credential_manager()
            return jsonify({
                'status': 'ok',
                'health': manager.health_check(),
                'stats': manager.get_stats(),
            }), 200
        except Exception as e:
            return jsonify({
                'status': 'error',
                'error': str(e),
            }), 500
    else:
        return jsonify({
            'status': 'unavailable',
            'message': 'Credential manager not available',
        }), 200


@app.route('/api/whatsapp/status', methods=['GET'])
def check_whatsapp_status():
    """Check WhatsApp API configuration status."""
    status = whatsapp_service.check_status()
    return jsonify(status), 200


@app.route('/api/whatsapp/send', methods=['POST'])
def send_message():
    """
    Send a WhatsApp message.
    
    Supports multi-tenant operation via dynamic credentials:
    - phone_number_id: WhatsApp Business Phone Number ID
    - access_token: WhatsApp API access token
    
    If credentials are not provided, falls back to environment variables.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        to = data.get('to', '').strip()
        message = data.get('message', '').strip()
        
        # Dynamic credentials for multi-tenant support
        phone_number_id = data.get('phone_number_id') or os.getenv('WHATSAPP_PHONE_NUMBER_ID')
        access_token = data.get('access_token') or os.getenv('WHATSAPP_ACCESS_TOKEN')
        
        if not to:
            return jsonify({'success': False, 'error': 'Recipient phone number is required'}), 400
        
        if not message:
            return jsonify({'success': False, 'error': 'Message text is required'}), 400
        
        to = to.replace('+', '')
        
        if not to.isdigit():
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format. Use digits only (e.g., 919876543210)'
            }), 400
        
        if len(to) < 10 or len(to) > 15:
            return jsonify({
                'success': False,
                'error': 'Phone number must be between 10 and 15 digits'
            }), 400
        
        # Split long messages (WhatsApp 1600 char limit)
        if len(message) > 1500:
            from tasks.messaging import split_and_send_long_message
            result = split_and_send_long_message.delay(
                phone_number_id=phone_number_id,
                access_token=access_token,
                to=to,
                message=message
            )
            return jsonify({
                'success': True,
                'message': 'Long message queued for sending',
                'task_id': result.id
            }), 202
        
        # Use dynamic credentials if provided, otherwise use default service
        if phone_number_id and access_token:
            result = whatsapp_service.send_message_with_credentials(
                phone_number_id=phone_number_id,
                access_token=access_token,
                to=to,
                message=message
            )
        else:
            result = whatsapp_service.send_text_message(to, message)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        logger.error(f"Send message error: {e}")
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@app.route('/api/whatsapp/send-notification', methods=['POST'])
def send_notification_message():
    """
    Send a WhatsApp notification message for order status updates.
    
    This is a PRODUCTION-GRADE endpoint with:
    - Unified credential lookup (checks Facebook Embedded + whatsapp_connections)
    - Detailed logging with correlation IDs
    - Proper error handling and response codes
    - Request validation
    
    Request body:
        {
            "user_id": "firebase-uid",  // Firebase UID of the business owner
            "to": "919876543210",       // Recipient phone number
            "message": "Your order..."   // Message text
        }
        
    Response:
        Success: 200 {"success": true, "message_id": "...", "source": "..."}
        Queued:  202 {"success": true, "message": "Long notification queued", "task_id": "..."}
        Error:   4xx/5xx {"success": false, "error": "...", "error_code": "..."}
    """
    import uuid
    correlation_id = str(uuid.uuid4())[:8]
    
    try:
        data = request.get_json()
        
        if not data:
            logger.warning(f"📱 [{correlation_id}] No request body provided")
            return jsonify({
                'success': False, 
                'error': 'No data provided',
                'error_code': 'NO_DATA'
            }), 400
        
        # Extract and validate parameters
        user_id = data.get('user_id', '').strip()
        to = data.get('to', '').strip()
        message = data.get('message', '').strip()
        
        if not user_id:
            return jsonify({
                'success': False, 
                'error': 'user_id is required',
                'error_code': 'MISSING_USER_ID'
            }), 400
        
        if not to:
            return jsonify({
                'success': False, 
                'error': 'Recipient phone number is required',
                'error_code': 'MISSING_PHONE'
            }), 400
        
        if not message:
            return jsonify({
                'success': False, 
                'error': 'Message text is required',
                'error_code': 'MISSING_MESSAGE'
            }), 400
        
        # Normalize phone number
        to = to.replace('+', '').replace(' ', '').replace('-', '')
        
        if not to.isdigit():
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format. Use digits only',
                'error_code': 'INVALID_PHONE'
            }), 400
        
        logger.info(f"📱 [{correlation_id}] Processing notification for user {user_id[:15]}... to {to}")
        
        # ========================================================================
        # UNIFIED CREDENTIAL LOOKUP
        # This checks BOTH Facebook Embedded Signup and whatsapp_connections tables
        # ========================================================================
        from supabase_client import get_whatsapp_credentials_unified
        
        credentials = get_whatsapp_credentials_unified(firebase_uid=user_id)
        
        if not credentials:
            logger.error(f"📱 [{correlation_id}] No WhatsApp credentials found for user {user_id[:15]}...")
            return jsonify({
                'success': False,
                'error': 'WhatsApp not configured for this business. Please complete WhatsApp setup.',
                'error_code': 'NO_CREDENTIALS'
            }), 404
        
        phone_number_id = credentials.get('phone_number_id')
        access_token = credentials.get('access_token')
        source = credentials.get('source', 'unknown')
        business_name = credentials.get('business_name', 'Unknown')
        
        if not phone_number_id or not access_token:
            logger.error(f"📱 [{correlation_id}] Incomplete credentials (source: {source})")
            return jsonify({
                'success': False,
                'error': 'WhatsApp credentials incomplete. Please reconnect your WhatsApp account.',
                'error_code': 'INCOMPLETE_CREDENTIALS'
            }), 400
        
        logger.info(
            f"📱 [{correlation_id}] Sending notification to {to} for {business_name} "
            f"(source: {source}, phone_id: {phone_number_id[:8]}...)"
        )
        
        # Handle long messages (WhatsApp 1600 char limit)
        if len(message) > 1500:
            try:
                from tasks.messaging import split_and_send_long_message
                result = split_and_send_long_message.delay(
                    phone_number_id=phone_number_id,
                    access_token=access_token,
                    to=to,
                    message=message
                )
                logger.info(f"📱 [{correlation_id}] Long notification queued (task: {result.id})")
                return jsonify({
                    'success': True,
                    'message': 'Long notification queued for sending',
                    'task_id': result.id,
                    'source': source
                }), 202
            except ImportError:
                # Celery not available, truncate message
                message = message[:1500] + "..."
                logger.warning(f"📱 [{correlation_id}] Celery unavailable, truncating long message")
        
        # Send the notification using WhatsApp service
        result = whatsapp_service.send_message_with_credentials(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            message=message
        )
        
        if result.get('success'):
            logger.info(
                f"✅ [{correlation_id}] Notification sent to {to} "
                f"(message_id: {result.get('message_id', 'N/A')})"
            )
            return jsonify({
                'success': True,
                'message_id': result.get('message_id'),
                'source': source,
                'business_name': business_name
            }), 200
        else:
            error = result.get('error', 'Unknown error')
            error_code = result.get('error_code') or result.get('status_code', 'UNKNOWN')
            logger.warning(f"❌ [{correlation_id}] Notification failed to {to}: {error}")
            return jsonify({
                'success': False,
                'error': error,
                'error_code': str(error_code),
                'data': result.get('data')
            }), 400
            
    except Exception as e:
        logger.error(f"❌ [{correlation_id}] Send notification error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False, 
            'error': f'Server error: {str(e)}',
            'error_code': 'SERVER_ERROR'
        }), 500




# =============================================================================
# WhatsApp Webhook
# =============================================================================

@app.route('/api/whatsapp/webhook', methods=['GET'])
def verify_webhook():
    """Verify webhook for WhatsApp Cloud API."""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    # Check both potential env vars (WhatsApp or Facebook naming convention)
    verify_token = os.getenv('WHATSAPP_VERIFY_TOKEN') or os.getenv('FACEBOOK_WEBHOOK_VERIFY_TOKEN') or 'flowauxi_webhook_token'
    
    if mode == 'subscribe' and token == verify_token:
        logger.info("✅ Webhook verified successfully!")
        return challenge, 200
    else:
        logger.warning(f"❌ Webhook verification failed. Token: {token}")
        return 'Forbidden', 403


@app.route('/api/whatsapp/webhook', methods=['POST'])
def webhook():
    """Receive incoming WhatsApp messages and respond with AI."""
    start_time = time.time()
    
    try:
        data = request.get_json()
        logger.info(f"📨 Webhook received")
        
        # Extract message data
        entry = data.get('entry', [{}])[0]
        changes = entry.get('changes', [{}])[0]
        value = changes.get('value', {})
        messages = value.get('messages', [])
        statuses = value.get('statuses', [])
        
        metadata = value.get('metadata', {})
        phone_number_id = metadata.get('phone_number_id')
        display_phone = metadata.get('display_phone_number', 'Unknown')
        
        # Handle status updates
        if statuses and SUPABASE_AVAILABLE and update_message_status:
            for status_update in statuses:
                status_msg_id = status_update.get('id')
                status = status_update.get('status')
                timestamp = status_update.get('timestamp')
                
                if status_msg_id and status:
                    from datetime import datetime
                    iso_timestamp = None
                    if timestamp:
                        try:
                            iso_timestamp = datetime.fromtimestamp(int(timestamp)).isoformat()
                        except:
                            pass
                    update_message_status(status_msg_id, status, iso_timestamp)
        
        # Return early if no messages (status update only)
        if not messages:
            return jsonify({'status': 'ok'}), 200
        
        message = messages[0]
        msg_id = message.get('id')
        
        # DEDUPLICATION: Skip if we've already processed this message
        # Use cache manager to track processed messages (expires after 1 hour)
        if cache_manager and msg_id:
            cache_key = f"processed_msg:{msg_id}"
            if cache_manager.get(cache_key):
                logger.info(f"⏭️ Skipping duplicate message: {msg_id[:20]}...")
                return jsonify({'status': 'ok', 'message': 'duplicate'}), 200
            # Mark as processed (expires in 3600 seconds = 1 hour)
            cache_manager.set(cache_key, True, ttl=3600)
        
        message = messages[0]
        from_number = message.get('from')
        message_type = message.get('type')
        msg_id = message.get('id')
        
        contacts = value.get('contacts', [])
        contact_name = contacts[0].get('profile', {}).get('name') if contacts else None
        
        message_text = ''
        media_id = None
        if message_type == 'text':
            message_text = message.get('text', {}).get('body', '')
        elif message_type == 'interactive':
            # Handle button responses
            interactive = message.get('interactive', {})
            interactive_type = interactive.get('type')
            
            if interactive_type == 'button_reply':
                # User clicked a button
                button_reply = interactive.get('button_reply', {})
                button_id = button_reply.get('id', '')
                button_title = button_reply.get('title', '')
                
                # Handle "Order This" button - triggers order flow with product
                # Supports both opaque (order_btn_XXXXXXXX) and legacy (order_card_N) formats
                if button_id.startswith('order_btn_') or button_id.startswith('order_card_') or button_id.startswith('order_'):
                    # Extract product identifier from button id
                    product_identifier = button_id.replace('order_', '')
                    message_text = f"order {product_identifier}"
                    logger.info(f"🛒 Order button clicked: {button_id} → '{message_text}'")
                # Map button clicks to text responses for the AI
                elif button_id in ['confirm_yes', 'yes'] or 'yes' in button_title.lower():
                    message_text = 'yes'
                elif button_id in ['confirm_no', 'no', 'cancel_order'] or 'no' in button_title.lower() or 'cancel' in button_title.lower():
                    message_text = 'no'
                else:
                    message_text = button_title  # Use button title as the response
                
                logger.info(f"🔘 Button clicked: {button_id} ({button_title}) → '{message_text}'")
                # Treat as text message for AI processing
                message_type = 'text'
            elif interactive_type == 'list_reply':
                # User selected from a list
                # FIX: Extract only the title, not description, to avoid sending labels with values
                list_reply = interactive.get('list_reply', {})
                message_text = list_reply.get('title', list_reply.get('id', ''))
                # If title contains newline (shouldn't happen, but handle it), take only first line
                if '\n' in message_text:
                    message_text = message_text.split('\n')[0].strip()
                message_type = 'text'
                logger.info(f"📋 List item selected: '{message_text}' (id: {list_reply.get('id', 'N/A')})")
        elif message_type in ['image', 'video', 'audio', 'document']:
            media_data = message.get(message_type, {})
            media_id = media_data.get('id')
            message_text = media_data.get('caption', '')
        
        logger.info(f"💬 Message from {from_number}: {message_text or f'[{message_type}]'}")
        
        # Fetch credentials
        credentials = None
        business_data = None
        user_id = None
        
        if SUPABASE_AVAILABLE and phone_number_id:
            credentials = get_credentials_by_phone_number_id(phone_number_id)
            if credentials:
                user_id = credentials.get('user_id')
                
                try:
                    firebase_uid = None
                    if get_firebase_uid_from_user_id:
                        firebase_uid = get_firebase_uid_from_user_id(user_id)
                        logger.info(f"🔍 Retrieved Firebase UID: {firebase_uid[:15] if firebase_uid else 'None'}... for user {user_id[:8]}...")
                    
                    # PRIORITY 1: Try new Supabase businesses table first (most cost-effective)
                    if firebase_uid and SUPABASE_AVAILABLE and get_business_from_supabase:
                        logger.info(f"🔍 Attempting to load business data from Supabase businesses table...")
                        business_data = get_business_from_supabase(firebase_uid)
                        if business_data:
                            logger.info(f"✅ Loaded business data from Supabase businesses table: {business_data.get('business_name', 'Unknown')}")
                    
                    # PRIORITY 2: Fall back to Firestore (legacy)
                    if not business_data and firebase_uid and FIREBASE_AVAILABLE and get_business_data_from_firestore:
                        logger.info(f"🔍 Falling back to Firestore for UID: {firebase_uid[:15]}...")
                        business_data = get_business_data_from_firestore(firebase_uid)
                        
                        if business_data:
                            logger.info(f"✅ Loaded business data from Firestore: {business_data.get('business_name', 'Unknown')}")
                        else:
                            logger.warning(f"⚠️ No business data found in Firestore for Firebase UID: {firebase_uid[:15]}...")
                    
                    # PRIORITY 3: Use Supabase AI capabilities + credentials if both above failed
                    if not business_data:
                        logger.info(f"🔄 Attempting to load from Supabase ai_capabilities table...")
                        
                        # Try to load from Supabase (ai_capabilities + business info)
                        if SUPABASE_AVAILABLE and get_business_data_from_supabase and firebase_uid:
                            business_data = get_business_data_from_supabase(firebase_uid, credentials)
                            if business_data:
                                logger.info(f"✅ Loaded business data from Supabase ai_capabilities: {business_data.get('business_name', 'Unknown')}")
                        
                        # Final fallback: minimal data from credentials
                        if not business_data:
                            business_data = {
                                'business_id': firebase_uid or user_id,
                                'business_name': credentials.get('business_name', 'Our Business'),
                                'industry': 'other',
                                'products_services': [],
                                'contact': {'phone': credentials.get('display_phone_number', '')},
                            }
                            logger.info(f"📝 Created minimal fallback business data with name: {business_data['business_name']}")
                    
                    # Ensure business_name is always set from credentials if missing
                    if 'business_name' not in business_data or not business_data['business_name'] or business_data['business_name'] == 'Our Business':
                        logger.info(f"🔄 Business name missing or default, using from credentials: {credentials.get('business_name', 'Our Business')}")
                        business_data['business_name'] = credentials.get('business_name', 'Our Business')
                        
                except Exception as e:
                    logger.error(f"⚠️ Error fetching business data: {e}")
                    import traceback
                    traceback.print_exc()
                    # Even on error, try to use credentials
                    business_data = {
                        'business_id': user_id,
                        'business_name': credentials.get('business_name', 'Our Business'),
                        'industry': 'other',
                        'products_services': [],
                        'contact': {'phone': credentials.get('display_phone_number', '')},
                    }
        
        # Final fallback - should rarely reach here after improvements above
        if not business_data:
            logger.warning(f"⚠️ No business data available, using absolute fallback")
            if credentials:
                business_data = {
                    'business_id': user_id,
                    'business_name': credentials.get('business_name', 'Our Business'),
                    'industry': 'other',
                    'products_services': [],
                    'contact': {'phone': credentials.get('display_phone_number', '')},
                }
                logger.info(f"📝 Final fallback using credentials: {business_data['business_name']}")
            else:
                business_data = DEFAULT_BUSINESS_DATA
                logger.warning(f"⚠️ Using hardcoded DEFAULT_BUSINESS_DATA as last resort")

        # IMPORTANT: Keep Firebase UID as business_id for appointment booking consistency
        # The business_data['business_id'] is set to Firebase UID in firebase_client.py
        # This ensures AI-booked appointments appear in the dashboard correctly
        # For Supabase operations that need business manager ID, use user_id or fetch separately
        current_business_id = business_data.get('business_id')
        needs_business_id = not current_business_id or current_business_id == "default" or len(current_business_id) < 10
        
        if SUPABASE_AVAILABLE and user_id and needs_business_id:
            # Set from Firebase UID if not already set with a valid ID
            firebase_uid = get_firebase_uid_from_user_id(user_id) if get_firebase_uid_from_user_id else None
            if firebase_uid:
                business_data['business_id'] = firebase_uid
                logger.info(f"📝 Set business_id from Firebase UID: {firebase_uid[:10]}...")
            else:
                logger.warning(f"⚠️ Could not get Firebase UID for user_id: {user_id} - order persistence may fail")
        
        # Store Supabase business manager ID separately for analytics/message tracking
        if SUPABASE_AVAILABLE and user_id:
            supabase_business_id = get_business_id_for_user(user_id)
            if supabase_business_id:
                business_data['supabase_business_manager_id'] = supabase_business_id
                logger.info(f"📝 Stored Supabase business manager ID: {supabase_business_id[:10]}...")

        # Store incoming message
        if SUPABASE_AVAILABLE and store_message and user_id:
            store_message(
                user_id=user_id,
                phone_number_id=phone_number_id,
                message_id=msg_id,
                direction='inbound',
                from_number=from_number,
                to_number=display_phone,
                message_type=message_type,
                message_body=message_text if message_text else None,
                status='delivered',
                contact_name=contact_name,
                wamid=msg_id,
                media_id=media_id,
                conversation_origin='user_initiated'
            )

        # Send push notification
        if FIREBASE_AVAILABLE and send_push_to_user and user_id:
            try:
                conversation_id = None
                if get_or_create_conversation and get_business_id_for_user:
                    business_id = get_business_id_for_user(user_id)
                    if business_id:
                        conversation_id = get_or_create_conversation(
                            business_id=business_id,
                            customer_phone=from_number,
                            customer_name=contact_name
                        )
                
                push_title = f"New message from {contact_name or from_number}"
                push_body = message_text if message_type == 'text' else f"Sent a {message_type}"
                push_data = {
                    'conversationId': str(conversation_id) if conversation_id else from_number,
                    'type': 'new_message',
                    'senderPhone': from_number,
                    'senderName': contact_name or from_number
                }
                send_push_to_user(user_id, push_title, push_body, push_data)
            except Exception as push_err:
                logger.warning(f"⚠️ Failed to trigger push notification: {push_err}")

        # Mark as read with typing indicator
        wa_id = credentials.get('phone_number_id') if credentials else None
        token = credentials.get('access_token') if credentials else None
        
        if msg_id:
            whatsapp_service.mark_message_as_read(wa_id, token, msg_id, show_typing=True)
        
        # Generate AI response
        # Track button metadata for interactive messages
        ai_metadata = {}
        
        if message_type == 'text':
            if AI_BRAIN_AVAILABLE and ai_brain:
                try:
                    result = ai_brain.generate_reply(
                        business_data=business_data,
                        user_message=message_text,
                        user_id=from_number,
                        history=None,
                        business_id=business_data.get('business_id')
                    )
                    
                    reply_text = result.get('reply', "I'll connect you with our team shortly.")
                    intent = result.get('intent', 'unknown')
                    needs_human = result.get('needs_human', False)
                    ai_metadata = result.get('metadata', {})
                    
                    # Track metrics
                    if METRICS_AVAILABLE:
                        elapsed_ms = (time.time() - start_time) * 1000
                        from monitoring import track_ai_response
                        track_ai_response(
                            latency_ms=elapsed_ms,
                            intent=intent,
                            cached=ai_metadata.get('from_cache', False)
                        )
                    
                    logger.info(f"🤖 AI Response (intent: {intent}): {reply_text[:50]}...")
                        
                except Exception as e:
                    logger.error(f"❌ Exception in AI generation: {str(e)}")
                    
                    # Use fallback handler if available
                    if RESILIENCE_AVAILABLE and get_fallback_handler:
                        fallback = get_fallback_handler()
                        fallback_response = fallback.get_fallback(
                            error_type="ai_unavailable",
                            business_data=business_data
                        )
                        reply_text = fallback_response.reply
                    else:
                        reply_text = "Thank you for your message! Our team will respond shortly."
            else:
                reply_text = "Thank you for your message! Our team will respond shortly."
        else:
            reply_text = f"Thank you for sending a {message_type}! Our team will review it shortly."
        
        # Split long replies (WhatsApp 1600 char limit)
        if len(reply_text) > 1500:
            # Split at sentence boundaries
            import re
            sentences = re.split(r'(?<=[.!?\n])\s+', reply_text)
            parts = []
            current_part = ""
            
            for sentence in sentences:
                if len(current_part) + len(sentence) + 1 <= 1500:
                    current_part += (" " if current_part else "") + sentence
                else:
                    if current_part:
                        parts.append(current_part)
                    current_part = sentence
            
            if current_part:
                parts.append(current_part)
            
            # Send parts
            for i, part in enumerate(parts):
                if credentials and credentials.get('access_token'):
                    whatsapp_service.send_message_with_credentials(
                        phone_number_id=credentials['phone_number_id'],
                        access_token=credentials['access_token'],
                        to=from_number,
                        message=f"({i+1}/{len(parts)}) {part}" if len(parts) > 1 else part
                    )
                time.sleep(0.5)
            
            return jsonify({'status': 'ok'}), 200
        
        # Send reply - check if we should use interactive buttons
        use_buttons = ai_metadata.get('use_buttons', False)
        buttons = ai_metadata.get('buttons', [])
        product_cards = ai_metadata.get('product_cards', [])
        
        if credentials and credentials.get('access_token'):
            logger.info(f"🏢 Using credentials for: {credentials.get('business_name')}")
            
            # Send product images with "Order This" button in a SINGLE unified message
            # Uses WhatsApp interactive message with image header (per Meta documentation)
            # This provides a professional, cohesive user experience for conversational commerce
            if product_cards:
                cards_with_images = [c for c in product_cards if c.get('image_url')]
                if cards_with_images:
                    logger.info(f"🖼️🔘 Sending {len(cards_with_images)} unified product card(s) (image + button)...")
                    
                    # Send all product cards (pagination is handled by AI brain)
                    for card in cards_with_images:
                        image_url = card.get('image_url')
                        name = card.get('name', 'Product')
                        current_price = card.get('price', 0)
                        original_price = card.get('compare_at_price')  # Original price (if on sale)
                        product_id = card.get('product_id', name)
                        
                        # Size-based pricing support
                        price_range = card.get('price_range')  # e.g., "₹700-₹800"
                        has_size_pricing = card.get('has_size_pricing', False)
                        size_prices = card.get('size_prices', {}) or {}
                        
                        # Debug logging for price information
                        logger.info(f"💰 Product Card: {name}")
                        logger.info(f"   current_price: {current_price} (type: {type(current_price)})")
                        logger.info(f"   original_price (compare_at_price): {original_price} (type: {type(original_price)})")
                        logger.info(f"   has_size_pricing: {has_size_pricing}")
                        logger.info(f"   size_prices: {size_prices}")
                        
                        # Sanitize product_id for button ID: replace spaces with underscores
                        # This ensures valid button IDs and proper matching in ai_brain
                        safe_product_id = str(product_id).replace(' ', '_').replace('-', '_').lower()
                        
                        # Build rich product details for body text with professional formatting
                        body_parts = [f"*{name}*"]
                        
                        # Determine the display price (offer price or regular price)
                        display_price_value = None
                        if has_size_pricing and size_prices:
                            # For size-based pricing, use the first available size price
                            first_size_price = next(iter(size_prices.values()), None)
                            if first_size_price:
                                display_price_value = float(first_size_price)
                            else:
                                display_price_value = float(current_price) if current_price else 0
                        else:
                            display_price_value = float(current_price) if current_price else 0
                        
                        logger.info(f"   display_price_value: {display_price_value}")
                        
                        # Format price based on available pricing info
                        # Check if there's an offer (original_price > display_price)
                        if original_price is not None and original_price != '':
                            try:
                                original_price_float = float(original_price)
                                logger.info(f"   Comparing: original_price_float={original_price_float} > display_price_value={display_price_value}")
                                if original_price_float > display_price_value and display_price_value > 0:
                                    # Has offer - show both original and offer price
                                    logger.info(f"   ✅ Showing offer: original ₹{int(original_price_float)}, offer ₹{int(display_price_value)}")
                                    body_parts.append(f"original price: ₹{int(original_price_float)}\noffer price: ₹{int(display_price_value)}")
                                else:
                                    # Original price exists but not greater than display price - show only display price
                                    logger.info(f"   ⚠️ Original price not greater, showing only display price")
                                    body_parts.append(f"price: ₹{int(display_price_value)}")
                            except (ValueError, TypeError) as e:
                                # Invalid original_price, just show display price
                                logger.warning(f"   ❌ Error converting original_price: {e}")
                                body_parts.append(f"price: ₹{int(display_price_value)}")
                        else:
                            # No original price - show regular price
                            logger.info(f"   ℹ️ No original_price found, showing regular price")
                            body_parts.append(f"price: ₹{int(display_price_value)}")
                        
                        # Add colors first, then sizes if available
                        if card.get('colors'):
                            colors_list = ', '.join(card['colors'][:4])
                            body_parts.append(f"colors: {colors_list}")
                        if card.get('sizes'):
                            sizes_list = ', '.join(card['sizes'][:4])
                            body_parts.append(f"sizes: {sizes_list}")
                        
                        body_text = "\n".join(body_parts)
                        
                        # ENTERPRISE-GRADE: Use opaque button ID if available, fallback to legacy card_index
                        btn_id = card.get("btn_id")
                        if btn_id:
                            # New opaque format: order_btn_xxxxxxxx
                            button_id = f"order_{btn_id}"
                        else:
                            # Legacy format: order_card_N (backwards compatibility)
                            card_index = card.get("card_index", 0)
                            button_id = f"order_card_{card_index}"
                        
                        logger.info(f"🔘 Creating button for: {name}")
                        logger.info(f"   Full product_id: {product_id}")
                        logger.info(f"   Button ID: {button_id} ({'opaque' if btn_id else 'legacy'})")
                        logger.info(f"   Card colors: {card.get('colors')}")
                        logger.info(f"   Card sizes: {card.get('sizes')}")
                        logger.info(f"   Card is_variant: {card.get('is_variant', False)}")
                        
                        order_buttons = [
                            {"id": button_id, "title": "Order This"}
                        ]
                        
                        # Send UNIFIED message: image header + product details + order button
                        # This is the production-ready approach per WhatsApp Cloud API docs
                        result = whatsapp_service.send_interactive_image_buttons(
                            phone_number_id=credentials['phone_number_id'],
                            access_token=credentials['access_token'],
                            to=from_number,
                            image_url=image_url,
                            body_text=body_text,
                            buttons=order_buttons,
                            footer_text="Tap to place your order"
                        )
                        
                        if result.get('success'):
                            logger.info(f"✅ Sent unified product card for: {name}")
                        else:
                            logger.warning(f"⚠️ Failed to send product card: {result.get('error')}")
                        
                        time.sleep(0.3)  # Rate limit between messages
                    
                    # All product cards sent successfully
                    send_result = {'success': True, 'message_id': 'product_cards_sent'}
                    
                    if send_result['success']:
                        logger.info(f"✅ Product catalog sent to {from_number}")
                        return jsonify({'status': 'ok'}), 200
            
            # Check if we should send URL button (for payment links, store links, etc.)
            if ai_metadata.get('use_url_button'):
                url_button_text = ai_metadata.get('url_button_text', 'Open Link')
                url_button_url = ai_metadata.get('url_button_url')
                # Use URL button specific body/header/footer if provided, otherwise fallback to general ones
                url_button_body = ai_metadata.get('url_button_body') or reply_text
                url_button_header = ai_metadata.get('url_button_header') or ai_metadata.get('header_text', '')
                url_button_footer = ai_metadata.get('url_button_footer') or ai_metadata.get('footer_text', '')
                
                if url_button_url:
                    logger.info(f"🔗 Sending CTA URL button: {url_button_text}")
                    send_result = whatsapp_service.send_interactive_url_button(
                        phone_number_id=credentials['phone_number_id'],
                        access_token=credentials['access_token'],
                        to=from_number,
                        body_text=url_button_body,
                        button_text=url_button_text,
                        button_url=url_button_url,
                        header_text=url_button_header if url_button_header else None,
                        footer_text=url_button_footer if url_button_footer else None
                    )
                    
                    # If there's also a list (categories), send it as a second message
                    if ai_metadata.get('use_list') and ai_metadata.get('list_sections'):
                        time.sleep(0.5)  # Small delay between messages
                        list_sections = ai_metadata.get('list_sections', [])
                        list_button = ai_metadata.get('list_button', 'View Categories')
                        list_body = ai_metadata.get('list_body_text') or "."
                        list_header = ai_metadata.get('list_header_text')
                        if list_header is None:
                            list_header = ai_metadata.get('header_text', '')
                        list_footer = ai_metadata.get('list_footer_text', '')
                        logger.info(f"📋 Sending interactive list after URL button: {list_button}")
                        whatsapp_service.send_interactive_list(
                            phone_number_id=credentials['phone_number_id'],
                            access_token=credentials['access_token'],
                            to=from_number,
                            body_text=list_body,
                            button_text=list_button,
                            sections=list_sections,
                            header_text=list_header if list_header else None,
                            footer_text=list_footer if list_footer else None
                        )
                else:
                    logger.warning("⚠️ URL button requested but url_button_url is missing")
                    # Fallback to regular text message
                    send_result = whatsapp_service.send_message_with_credentials(
                        phone_number_id=credentials['phone_number_id'],
                        access_token=credentials['access_token'],
                        to=from_number,
                        message=reply_text
                    )
            
            elif use_buttons and buttons:
                # Send interactive message with buttons
                logger.info(f"🔘 Sending interactive buttons: {[b.get('title') for b in buttons]}")
                # Use dynamic header/footer from AI metadata, fallback to defaults
                header = ai_metadata.get('header_text', 'Quick Reply')
                footer = ai_metadata.get('footer_text', 'Tap a button to respond')
                send_result = whatsapp_service.send_interactive_buttons(
                    phone_number_id=credentials['phone_number_id'],
                    access_token=credentials['access_token'],
                    to=from_number,
                    body_text=reply_text,
                    buttons=buttons,
                    header_text=header,
                    footer_text=footer
                )
                
                # If there's also a list, send it as a second message
                if ai_metadata.get('use_list') and ai_metadata.get('list_sections'):
                    time.sleep(0.5)  # Small delay between messages
                    list_sections = ai_metadata.get('list_sections', [])
                    list_button = ai_metadata.get('list_button', 'View Options')
                    # Use custom body text from metadata, or fallback to button text, or minimal text
                    list_body = ai_metadata.get('list_body_text') or list_button or "."
                    # Use list-specific header if provided, otherwise use general header, otherwise empty
                    list_header = ai_metadata.get('list_header_text')
                    if list_header is None:  # Not explicitly set
                        list_header = ai_metadata.get('header_text', '')
                    footer = ai_metadata.get('footer_text', '')
                    logger.info(f"📋 Sending interactive list: {list_button}")
                    whatsapp_service.send_interactive_list(
                        phone_number_id=credentials['phone_number_id'],
                        access_token=credentials['access_token'],
                        to=from_number,
                        body_text=list_body,
                        button_text=list_button,
                        sections=list_sections,
                        header_text=list_header if list_header else None,
                        footer_text=footer if footer else None
                    )
                    
            elif ai_metadata.get('use_list') and ai_metadata.get('list_sections'):
                # Send interactive list message (menu with up to 10 items)
                list_sections = ai_metadata.get('list_sections', [])
                list_button = ai_metadata.get('list_button', 'View Options')
                # Use custom body text from metadata, or fallback to reply_text
                list_body = ai_metadata.get('list_body_text') or reply_text
                # Use list-specific header if provided, otherwise use general header, otherwise default
                list_header = ai_metadata.get('list_header_text')
                if list_header is None:  # Not explicitly set
                    list_header = ai_metadata.get('header_text', 'Select an Option')
                footer = ai_metadata.get('footer_text', '')
                logger.info(f"📋 Sending interactive list: {list_button}")
                send_result = whatsapp_service.send_interactive_list(
                    phone_number_id=credentials['phone_number_id'],
                    access_token=credentials['access_token'],
                    to=from_number,
                    body_text=list_body,
                    button_text=list_button,
                    sections=list_sections,
                    header_text=list_header if list_header else None,
                    footer_text=footer if footer else None
                )
            else:
                # Send regular text message
                send_result = whatsapp_service.send_message_with_credentials(
                    phone_number_id=credentials['phone_number_id'],
                    access_token=credentials['access_token'],
                    to=from_number,
                    message=reply_text
                )
        else:
            logger.warning("⚠️ Using fallback .env credentials")
            send_result = whatsapp_service.send_text_message(from_number, reply_text)
        
        if send_result['success']:
            reply_message_id = send_result.get('message_id', 'N/A')
            logger.info(f"✅ Reply sent successfully to {from_number}")
            
            if SUPABASE_AVAILABLE and store_message and user_id and reply_message_id != 'N/A':
                store_message(
                    user_id=user_id,
                    phone_number_id=phone_number_id,
                    message_id=reply_message_id,
                    direction='outbound',
                    from_number=display_phone,
                    to_number=from_number,
                    message_type='text',
                    message_body=reply_text,
                    status='sent',
                    wamid=reply_message_id,
                    conversation_origin='business_initiated',
                    is_ai_generated=True
                )
        else:
            logger.error(f"❌ Failed to send reply: {send_result.get('error')}")
        
        return jsonify({'status': 'ok'}), 200
        
    except Exception as e:
        logger.error(f"❌ Webhook error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/whatsapp/set-business-data', methods=['POST'])
def set_business_data():
    """Set business data for AI responses."""
    try:
        data = request.get_json()
        
        # Normalize product data to ensure consistent field naming
        # This handles both snake_case (from API) and camelCase (from Firestore)
        products = data.get('products_services', [])
        if products:
            normalized_products = []
            for p in products:
                if isinstance(p, dict):
                    normalized = {
                        'id': p.get('id', ''),
                        'sku': p.get('sku', ''),
                        'name': p.get('name', ''),
                        'category': p.get('category', ''),
                        'description': p.get('description', ''),
                        'price': p.get('price', 0),
                        'price_unit': p.get('price_unit', p.get('priceUnit', 'INR')),
                        'duration': p.get('duration', ''),
                        'available': p.get('available', True),
                        # Normalize image URL field: accept both snake_case and camelCase
                        'imageUrl': p.get('imageUrl') or p.get('image_url') or p.get('image', ''),
                        'imagePublicId': p.get('imagePublicId') or p.get('image_public_id', ''),
                        'originalSize': p.get('originalSize') or p.get('original_size', 0),
                        'optimizedSize': p.get('optimizedSize') or p.get('optimized_size', 0),
                        'sizes': p.get('sizes', []),
                        'colors': p.get('colors', []),
                        'variants': p.get('variants', []),
                        'brand': p.get('brand', ''),
                        'materials': p.get('materials', []),
                    }
                    normalized_products.append(normalized)
            data['products_services'] = normalized_products
        
        BUSINESS_DATA_CACHE['current'] = data
        
        # Invalidate cache for this business
        if cache_manager and data.get('business_id'):
            cache_manager.invalidate_business(data['business_id'])
        
        logger.info(f"📊 Business data updated: {data.get('business_name', 'Unknown')}")
        logger.info(f"   Products: {len(products)} items (normalized)")
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# =============================================================================
# AI Brain Endpoints
# =============================================================================

@app.route('/api/ai/status', methods=['GET'])
def ai_status():
    """Check AI Brain availability and configuration."""
    status = {
        'available': AI_BRAIN_AVAILABLE,
        'message': 'AI Brain is ready' if AI_BRAIN_AVAILABLE else 'AI Brain not configured'
    }
    
    if AI_BRAIN_AVAILABLE and ai_brain:
        status['cache_stats'] = ai_brain.get_cache_stats()
    
    return jsonify(status), 200


@app.route('/api/ai/generate-reply', methods=['POST'])
def generate_ai_reply():
    """Generate AI reply for customer message."""
    if not AI_BRAIN_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'AI Brain not available. Please install dependencies.'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        business_data = data.get('business_data')
        user_message = data.get('user_message', '').strip()
        history = data.get('history', [])
        business_id = data.get('business_id')
        user_id = data.get('user_id')
        
        if not user_message:
            return jsonify({'success': False, 'error': 'user_message is required'}), 400
        
        if not business_data and not business_id:
            return jsonify({
                'success': False,
                'error': 'Either business_data or business_id is required'
            }), 400
        
        result = ai_brain.generate_reply(
            business_data=business_data,
            user_message=user_message,
            history=history,
            business_id=business_id,
            user_id=user_id
        )
        
        return jsonify({'success': True, **result}), 200
        
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        return jsonify({'success': False, 'error': f'AI generation error: {str(e)}'}), 500


@app.route('/api/ai/detect-intent', methods=['POST'])
def detect_intent():
    """Detect intent from a message."""
    if not AI_BRAIN_AVAILABLE:
        return jsonify({'success': False, 'error': 'AI Brain not available'}), 503
    
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        history = data.get('history', [])
        
        if not message:
            return jsonify({'success': False, 'error': 'message is required'}), 400
        
        result = ai_brain.detect_intent(message, history)
        
        return jsonify({'success': True, **result}), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Intent detection error: {str(e)}'}), 500


# =============================================================================
# Metrics Endpoint
# =============================================================================

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    """Get system metrics (for monitoring dashboards)."""
    metrics = {}
    
    if METRICS_AVAILABLE:
        metrics['performance'] = get_metrics_summary()
        metrics['kpis'] = check_kpis()
    
    if cache_manager:
        metrics['cache'] = cache_manager.get_stats()
    
    if AI_BRAIN_AVAILABLE and ai_brain:
        metrics['ai_cache'] = ai_brain.get_cache_stats()
    
    return jsonify(metrics), 200


# =============================================================================
# Error Handlers
# =============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.errorhandler(429)
def rate_limited(error):
    return jsonify({
        'success': False,
        'error': 'Rate limit exceeded. Please try again later.'
    }), 429


# =============================================================================
# Application Entry Point
# =============================================================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', os.getenv('FLASK_PORT', 5000)))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    print(f'\n🚀 WhatsApp Admin API Server')
    print(f'📡 Running on: http://localhost:{port}')
    print(f'🔧 Environment: {os.getenv("FLASK_ENV", "production")}')
    print(f'🌐 CORS enabled for: {frontend_url}')
    print(f'🧠 AI Brain: {"Ready ✅" if AI_BRAIN_AVAILABLE else "Not configured ⚠️"}')
    print(f'💾 Cache: {"Redis ✅" if ADVANCED_CACHE_AVAILABLE else "In-memory ⚠️"}')
    print(f'📊 Metrics: {"Enabled ✅" if METRICS_AVAILABLE else "Disabled ⚠️"}')
    print(f'🛡️ Resilience: {"Enabled ✅" if RESILIENCE_AVAILABLE else "Disabled ⚠️"}\n')
    
    # On Windows, use_reloader=False to prevent threading/socket issues
    # The reloader spawns a child process that can cause socket conflicts
    import platform
    use_reloader = (platform.system() != 'Windows') and debug
    
    app.run(host='0.0.0.0', port=port, debug=debug, use_reloader=use_reloader)

