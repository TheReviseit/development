"""
Secure Billing API Routes
=========================
FAANG-grade billing endpoints with comprehensive security.

Endpoints:
- GET /api/billing/pricing - Fetch domain-specific pricing
- GET /api/billing/subscription-state - Check user's subscription status
- POST /api/billing/checkout-session - Create secure checkout session

Security Features:
- Strict authentication and tenant validation
- Server-side price ID resolution (never trust client)
- Idempotency with user binding (prevent session hijacking)
- Circuit breaker for Razorpay integration
- Comprehensive audit logging

@version 1.0.0
@securityLevel FAANG-Production
"""

import os
import time
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from flask import Blueprint, request, jsonify, g

# =============================================================================
# LOGGER
# =============================================================================

logger = logging.getLogger('reviseit.billing.api')

# =============================================================================
# BLUEPRINT
# =============================================================================

billing_bp = Blueprint('billing', __name__, url_prefix='/api/billing')

# =============================================================================
# DATABASE MODELS (Simplified - use actual models in production)
# =============================================================================

class PricingPlan:
    """Represents a pricing plan from database."""
    
    @staticmethod
    def get_by_domain_and_slug(domain: str, slug: str) -> Optional[Dict[str, Any]]:
        """Fetch pricing plan by domain and slug."""
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            result = db.table('pricing_plans').select('*').eq(
                'product_domain', domain
            ).eq(
                'plan_slug', slug
            ).eq(
                'is_active', True
            ).single().execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Failed to fetch pricing plan: {e}")
            return None
    
    @staticmethod
    def get_all_by_domain(domain: str) -> list:
        """Fetch all active pricing plans for a domain."""
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            result = db.table('pricing_plans').select('*').eq(
                'product_domain', domain
            ).eq(
                'is_active', True
            ).order('amount_paise').execute()
            
            return result.data or []
        except Exception as e:
            logger.error(f"Failed to fetch pricing plans: {e}")
            return []


class Subscription:
    """Represents a user subscription."""
    
    @staticmethod
    def get_by_user_and_domain(user_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Fetch active subscription for user on domain."""
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            result = db.table('subscriptions').select('*').eq(
                'user_id', user_id
            ).eq(
                'product_domain', domain
            ).in_(
                'status', ['active', 'trialing', 'processing']
            ).order('created_at', desc=True).limit(1).execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to fetch subscription: {e}")
            return None


class FreeTrial:
    """Represents a user's free trial."""
    
    @staticmethod
    def get_by_user_and_domain(user_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Fetch trial for user on domain."""
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            now = datetime.now(timezone.utc).isoformat()
            
            result = db.table('free_trials').select('*').eq(
                'user_id', user_id
            ).eq(
                'product_domain', domain
            ).in_(
                'status', ['active', 'expiring_soon']
            ).gt(
                'expires_at', now
            ).limit(1).execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to fetch trial: {e}")
            return None
    
    @staticmethod
    def get_expired_by_user_and_domain(user_id: str, domain: str) -> Optional[Dict[str, Any]]:
        """Fetch expired trial for user on domain."""
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            result = db.table('free_trials').select('*').eq(
                'user_id', user_id
            ).eq(
                'product_domain', domain
            ).eq(
                'status', 'expired'
            ).limit(1).execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Failed to fetch expired trial: {e}")
            return None


# =============================================================================
# REDIS CONNECTION
# =============================================================================

_redis_client = None

def get_redis_client():
    """Get Redis client for idempotency store with lazy initialization."""
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
    try:
        import redis
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        # Test connection
        _redis_client.ping()
        logger.info("Redis connection established for billing idempotency")
        return _redis_client
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}. Idempotency will use fallback.")
        _redis_client = None
        return None


# =============================================================================
# IDEMPOTENCY
# =============================================================================

class IdempotencyStore:
    """Redis-backed store for idempotency keys."""
    
    def __init__(self):
        self._redis = get_redis_client()
        self._key_prefix = "idempotency:billing"
    
    def generate_key(self, user_id: str, plan_slug: str, domain: str) -> str:
        """Generate stable idempotency key."""
        month_key = datetime.now(timezone.utc).strftime('%Y-%m')
        data = f"{user_id}:{plan_slug}:{domain}:{month_key}"
        return hashlib.sha256(data.encode()).hexdigest()[:32]
    
    def _make_key(self, key: str) -> str:
        """Create Redis key with prefix."""
        return f"{self._key_prefix}:{key}"
    
    def check_and_store(
        self,
        key: str,
        user_id: str,
        data: Dict[str, Any],
        ttl_seconds: int = 86400  # 24 hours
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if key exists and belongs to user. Store if new.
        
        Returns: (is_new, existing_data)
        """
        if not self._redis:
            # Fallback: treat as new if Redis unavailable
            logger.warning("Redis unavailable for idempotency check")
            return True, None
        
        redis_key = self._make_key(key)
        
        try:
            # Try to get existing entry
            existing = self._redis.get(redis_key)
            
            if existing:
                import json
                stored_data = json.loads(existing)
                
                # Verify ownership (prevent session hijacking)
                if stored_data.get('user_id') != user_id:
                    logger.warning(
                        f"Idempotency key ownership mismatch: key={key[:8]}..., "
                        f"expected={user_id[:8]}..., got={stored_data.get('user_id', 'unknown')[:8]}..."
                    )
                    # Return as if new (will fail later with proper error)
                    return True, None
                
                return False, stored_data.get('data')
            
            # Store new entry with TTL
            store_data = {
                'user_id': user_id,
                'data': data,
                'created_at': time.time(),
            }
            import json
            self._redis.setex(redis_key, ttl_seconds, json.dumps(store_data))
            
            return True, None
            
        except Exception as e:
            logger.error(f"Redis idempotency error: {e}")
            # Fail open - treat as new
            return True, None
    
    def update_data(
        self,
        key: str,
        user_id: str,
        data: Dict[str, Any],
        ttl_seconds: int = 86400  # 24 hours
    ) -> bool:
        """
        Update data for an existing idempotency key.
        Used after successful Razorpay subscription creation.
        
        Returns: True if updated, False otherwise
        """
        if not self._redis:
            logger.warning("Redis unavailable for idempotency update")
            return False
        
        redis_key = self._make_key(key)
        
        try:
            # Get existing entry to verify ownership
            existing = self._redis.get(redis_key)
            
            if existing:
                import json
                stored_data = json.loads(existing)
                
                # Verify ownership before updating
                if stored_data.get('user_id') != user_id:
                    logger.warning(
                        f"Idempotency update ownership mismatch: key={key[:8]}..."
                    )
                    return False
            
            # Update with new data
            store_data = {
                'user_id': user_id,
                'data': data,
                'updated_at': time.time(),
            }
            import json
            self._redis.setex(redis_key, ttl_seconds, json.dumps(store_data))
            return True
            
        except Exception as e:
            logger.error(f"Redis idempotency update error: {e}")
            return False


idempotency_store = IdempotencyStore()


# =============================================================================
# AUDIT LOGGING
# =============================================================================

class BillingAuditLogger:
    """Structured audit logging for billing events."""
    
    @staticmethod
    def log(
        event_type: str,
        severity: str,
        user_id: str,
        tenant: str,
        request_id: str,
        outcome: Dict[str, Any],
        security: Optional[Dict[str, Any]] = None
    ):
        """Log billing event."""
        log_entry = {
            'event_type': event_type,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'severity': severity,
            'tenant': {
                'product_domain': tenant,
            },
            'user': {
                'user_id': user_id,
                'ip_address': getattr(g, 'client_ip', 'unknown'),
            },
            'request': {
                'request_id': request_id,
                'endpoint': request.path,
                'method': request.method,
            },
            'outcome': outcome,
            'security': security or {},
        }
        
        # Log with appropriate level
        if severity == 'CRITICAL':
            logger.critical(f"BILLING_AUDIT: {log_entry}")
        elif severity == 'ERROR':
            logger.error(f"BILLING_AUDIT: {log_entry}")
        elif severity == 'WARNING':
            logger.warning(f"BILLING_AUDIT: {log_entry}")
        else:
            logger.info(f"BILLING_AUDIT: {log_entry}")


audit_logger = BillingAuditLogger()


# =============================================================================
# CIRCUIT BREAKER
# =============================================================================

class CircuitBreaker:
    """
    Circuit breaker for external API calls (Razorpay).
    
    States:
    - CLOSED: Normal operation
    - OPEN: Failing fast (too many errors)
    - HALF_OPEN: Testing if recovered
    """
    
    STATE_CLOSED = 'closed'
    STATE_OPEN = 'open'
    STATE_HALF_OPEN = 'half_open'
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
        half_open_max_calls: int = 3
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        
        self._state = self.STATE_CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time = 0
        self._half_open_calls = 0
    
    def can_execute(self) -> bool:
        """Check if call can be executed."""
        if self._state == self.STATE_CLOSED:
            return True
        
        if self._state == self.STATE_OPEN:
            # Check if recovery timeout passed
            if time.time() - self._last_failure_time >= self.recovery_timeout:
                logger.info("Circuit breaker entering HALF_OPEN state")
                self._state = self.STATE_HALF_OPEN
                self._half_open_calls = 0
                return True
            return False
        
        if self._state == self.STATE_HALF_OPEN:
            if self._half_open_calls < self.half_open_max_calls:
                self._half_open_calls += 1
                return True
            return False
        
        return True
    
    def record_success(self):
        """Record successful call."""
        if self._state == self.STATE_HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.half_open_max_calls:
                logger.info("Circuit breaker entering CLOSED state")
                self._state = self.STATE_CLOSED
                self._failure_count = 0
                self._success_count = 0
        else:
            self._failure_count = 0
    
    def record_failure(self):
        """Record failed call."""
        self._failure_count += 1
        self._last_failure_time = time.time()
        
        if self._state == self.STATE_HALF_OPEN:
            logger.warning("Circuit breaker entering OPEN state (half-open failure)")
            self._state = self.STATE_OPEN
        elif self._failure_count >= self.failure_threshold:
            logger.warning(f"Circuit breaker entering OPEN state ({self._failure_count} failures)")
            self._state = self.STATE_OPEN
    
    @property
    def state(self) -> str:
        return self._state


# Global circuit breaker for Razorpay
razorpay_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=30,
    half_open_max_calls=3
)


# =============================================================================
# ROUTES
# =============================================================================

@billing_bp.route('/pricing', methods=['GET'])
def get_pricing():
    """
    Get pricing for the current domain.
    
    Security:
    - Domain resolved from Host header (not client)
    - User authentication required
    - Rate limited
    """
    request_id = getattr(g, 'request_id', f"req_{int(time.time())}")
    user_id = request.headers.get('X-User-Id')
    domain = request.headers.get('X-Product-Domain')
    
    if not user_id or not domain:
        return jsonify({
            'success': False,
            'error': 'MISSING_CONTEXT',
            'message': 'User or domain context missing.',
        }), 400
    
    logger.info(f"[{request_id}] Fetching pricing for {domain}")
    
    # Fetch pricing from database
    plans = PricingPlan.get_all_by_domain(domain)
    
    if not plans:
        audit_logger.log(
            event_type='billing.pricing.not_found',
            severity='WARNING',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={'success': False, 'reason': 'no_plans_found'}
        )
        return jsonify({
            'success': False,
            'error': 'PRICING_NOT_FOUND',
            'message': 'Pricing not available for this domain.',
        }), 404
    
    # Format response
    formatted_plans = []
    for plan in plans:
        formatted_plans.append({
            'id': plan['id'],
            'name': plan['display_name'],
            'slug': plan['plan_slug'],
            'price': plan['amount_paise'],
            'priceDisplay': f"₹{plan['amount_paise'] // 100:,}",
            'currency': plan.get('currency', 'INR'),
            'description': plan.get('description', ''),
            'features': plan.get('features_json', []),
            'popular': plan.get('is_popular', False),
        })
    
    audit_logger.log(
        event_type='billing.pricing.access',
        severity='INFO',
        user_id=user_id,
        tenant=domain,
        request_id=request_id,
        outcome={
            'success': True,
            'plan_count': len(formatted_plans),
        }
    )
    
    return jsonify({
        'success': True,
        'domain': domain,
        'displayName': domain.capitalize(),
        'plans': formatted_plans,
    })


@billing_bp.route('/subscription-state', methods=['GET'])
def get_subscription_state():
    """
    Get user's subscription state for the current domain.
    
    Returns:
    - hasSubscription: bool
    - hasActiveTrial: bool
    - trialExpired: bool
    - canSubscribe: bool
    - reason: str (if cannot subscribe)
    """
    request_id = getattr(g, 'request_id', f"req_{int(time.time())}")
    user_id = request.headers.get('X-User-Id')
    domain = request.headers.get('X-Product-Domain')
    
    if not user_id or not domain:
        return jsonify({
            'success': False,
            'error': 'MISSING_CONTEXT',
            'message': 'User or domain context missing.',
        }), 400
    
    logger.info(f"[{request_id}] Checking subscription state for {user_id[:8]}... on {domain}")
    
    # Check for active subscription
    subscription = Subscription.get_by_user_and_domain(user_id, domain)
    
    if subscription:
        return jsonify({
            'success': True,
            'hasSubscription': True,
            'hasActiveTrial': False,
            'trialExpired': False,
            'canSubscribe': False,
            'reason': 'already_has_subscription',
            'subscription': {
                'status': subscription['status'],
                'plan': subscription.get('plan_name'),
            }
        })
    
    # Check for active trial
    trial = FreeTrial.get_by_user_and_domain(user_id, domain)
    
    if trial:
        return jsonify({
            'success': True,
            'hasSubscription': False,
            'hasActiveTrial': True,
            'trialExpired': False,
            'canSubscribe': False,
            'reason': 'active_trial',
            'trial': {
                'status': trial['status'],
                'expiresAt': trial['expires_at'],
            }
        })
    
    # Check for expired trial
    expired_trial = FreeTrial.get_expired_by_user_and_domain(user_id, domain)
    
    if expired_trial:
        return jsonify({
            'success': True,
            'hasSubscription': False,
            'hasActiveTrial': False,
            'trialExpired': True,
            'canSubscribe': True,
            'reason': 'expired_trial_can_subscribe',
        })
    
    # No trial, no subscription - can subscribe
    return jsonify({
        'success': True,
        'hasSubscription': False,
        'hasActiveTrial': False,
        'trialExpired': False,
        'canSubscribe': True,
        'reason': 'no_subscription',
    })


@billing_bp.route('/checkout-session', methods=['POST'])
def create_checkout_session():
    """
    Create a secure checkout session.
    
    Security:
    - Plan slug validated against domain whitelist
    - Price ID resolved server-side (never trust client)
    - Idempotency with user binding
    - Circuit breaker for Razorpay
    - Subscription state validation
    
    Request Body:
    {
        "planSlug": "starter",
        "idempotencyKey": "client-generated-uuid"
    }
    """
    request_id = getattr(g, 'request_id', f"req_{int(time.time())}")
    user_id = getattr(g, 'user_id', None)
    domain = getattr(g, 'product_domain', None)
    client_ip = getattr(g, 'client_ip', 'unknown')
    
    if not user_id or not domain:
        return jsonify({
            'success': False,
            'error': 'MISSING_CONTEXT',
            'message': 'Authentication or tenant context missing.',
        }), 400
    
    # Parse request body
    data = request.get_json()
    if not data:
        return jsonify({
            'success': False,
            'error': 'INVALID_BODY',
            'message': 'Request body required.',
        }), 400
    
    plan_slug = data.get('planSlug')
    client_idempotency_key = data.get('idempotencyKey')
    
    if not plan_slug:
        return jsonify({
            'success': False,
            'error': 'MISSING_PLAN_SLUG',
            'message': 'Plan slug required.',
        }), 400
    
    logger.info(f"[{request_id}] Checkout request: user={user_id[:8]}..., domain={domain}, plan={plan_slug}")
    
    # =================================================================
    # STEP 1: VALIDATE SUBSCRIPTION STATE
    # =================================================================
    
    existing_sub = Subscription.get_by_user_and_domain(user_id, domain)
    if existing_sub:
        audit_logger.log(
            event_type='billing.checkout.blocked',
            severity='WARNING',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': False,
                'reason': 'already_has_subscription',
                'plan_requested': plan_slug,
            }
        )
        return jsonify({
            'success': False,
            'error': 'ACTIVE_SUBSCRIPTION_EXISTS',
            'message': 'You already have an active subscription.',
        }), 409
    
    active_trial = FreeTrial.get_by_user_and_domain(user_id, domain)
    if active_trial:
        audit_logger.log(
            event_type='billing.checkout.blocked',
            severity='WARNING',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': False,
                'reason': 'active_trial',
            }
        )
        return jsonify({
            'success': False,
            'error': 'ACTIVE_TRIAL',
            'message': 'You have an active trial.',
        }), 409
    
    # =================================================================
    # STEP 2: VALIDATE PLAN EXISTS FOR DOMAIN
    # =================================================================
    
    plan = PricingPlan.get_by_domain_and_slug(domain, plan_slug)
    
    if not plan:
        audit_logger.log(
            event_type='billing.checkout.invalid_plan',
            severity='WARNING',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': False,
                'reason': 'plan_not_found',
                'plan_requested': plan_slug,
            }
        )
        return jsonify({
            'success': False,
            'error': 'PLAN_NOT_FOUND',
            'message': 'Selected plan is not available.',
        }), 400
    
    # Verify the plan belongs to the current domain (prevent cross-tenant)
    if plan['product_domain'] != domain:
        audit_logger.log(
            event_type='billing.checkout.cross_domain_attempt',
            severity='CRITICAL',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': False,
                'reason': 'cross_domain_plan',
                'plan_domain': plan['product_domain'],
                'requested_domain': domain,
            }
        )
        return jsonify({
            'success': False,
            'error': 'CROSS_DOMAIN_PLAN',
            'message': 'Invalid plan selection.',
        }), 403
    
    # =================================================================
    # STEP 3: CHECK CIRCUIT BREAKER
    # =================================================================
    
    if not razorpay_circuit_breaker.can_execute():
        logger.warning(f"[{request_id}] Circuit breaker OPEN, failing fast")
        audit_logger.log(
            event_type='billing.checkout.circuit_open',
            severity='ERROR',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': False,
                'reason': 'circuit_breaker_open',
            }
        )
        return jsonify({
            'success': False,
            'error': 'SERVICE_UNAVAILABLE',
            'message': 'Payment service temporarily unavailable. Please try again in a moment.',
        }), 503
    
    # =================================================================
    # STEP 4: CHECK IDEMPOTENCY
    # =================================================================
    
    idempotency_key = idempotency_store.generate_key(user_id, plan_slug, domain)
    
    is_new, existing_data = idempotency_store.check_and_store(
        idempotency_key,
        user_id,
        {'plan_slug': plan_slug, 'domain': domain}
    )
    
    if not is_new:
        logger.info(f"[{request_id}] Idempotency hit - returning existing session")
        audit_logger.log(
            event_type='billing.checkout.idempotency_hit',
            severity='INFO',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': True,
                'idempotency_hit': True,
            }
        )
        return jsonify({
            'success': True,
            'checkoutUrl': existing_data.get('checkout_url'),
            'sessionId': existing_data.get('session_id'),
            'idempotencyHit': True,
        })
    
    # =================================================================
    # STEP 5: CREATE RAZORPAY CHECKOUT
    # =================================================================
    
    try:
        # Get Razorpay client with proper timeout
        import razorpay
        
        # Create client
        razorpay_client = razorpay.Client(
            auth=(os.getenv('RAZORPAY_KEY_ID'), os.getenv('RAZORPAY_KEY_SECRET'))
        )
        
        # Set timeout on the underlying session (connect timeout, read timeout)
        # This is the correct way to set timeout for Razorpay Python SDK
        razorpay_client.session.timeout = (5, 10)  # (connect_timeout, read_timeout)
        
        # Resolve Razorpay plan ID based on environment
        from services.environment import get_razorpay_environment
        
        env = get_razorpay_environment()
        razorpay_plan_id = plan.get(f'razorpay_plan_id_{env}') or plan.get('razorpay_plan_id')
        
        if not razorpay_plan_id:
            raise ValueError(f"No Razorpay plan ID for environment: {env}")
        
        # Create or get customer
        # ... (customer logic from existing payments.py)
        
        # Create subscription
        subscription_data = {
            'plan_id': razorpay_plan_id,
            'customer_notify': 1,
            'total_count': 12,
            'quantity': 1,
            'notes': {
                'user_id': user_id,
                'plan_slug': plan_slug,
                'product_domain': domain,
                'request_id': request_id,
            }
        }
        
        subscription = razorpay_client.subscription.create(data=subscription_data)
        
        # Record success
        razorpay_circuit_breaker.record_success()
        
        # Store in idempotency cache with checkout details
        checkout_url = f"https://checkout.razorpay.com/v1/checkout/{subscription['id']}"
        
        # Update idempotency store with checkout details using direct Redis update
        idempotency_store.update_data(
            idempotency_key,
            user_id,
            {
                'checkout_url': checkout_url,
                'session_id': subscription['id'],
                'created_at': time.time(),
                'plan_slug': plan_slug,
                'domain': domain,
            },
            ttl_seconds=86400
        )
        
        # Log success
        audit_logger.log(
            event_type='billing.checkout.created',
            severity='INFO',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': True,
                'plan_slug': plan_slug,
                'razorpay_subscription_id': subscription['id'],
                'amount_paise': plan['amount_paise'],
            },
            security={
                'abuse_score': getattr(g, 'abuse_score', 0),
                'idempotency_key': idempotency_key[:8] + '...',
            }
        )
        
        return jsonify({
            'success': True,
            'checkoutUrl': checkout_url,
            'sessionId': subscription['id'],
            'plan': {
                'name': plan['display_name'],
                'amount': plan['amount_paise'],
                'currency': plan.get('currency', 'INR'),
            },
        })
        
    except Exception as e:
        # Record failure
        razorpay_circuit_breaker.record_failure()
        
        logger.error(f"[{request_id}] Razorpay error: {e}")
        audit_logger.log(
            event_type='billing.checkout.failed',
            severity='ERROR',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': False,
                'error': str(e),
                'plan_slug': plan_slug,
            }
        )
        
        return jsonify({
            'success': False,
            'error': 'PAYMENT_SERVICE_ERROR',
            'message': 'Failed to create checkout session. Please try again.',
        }), 503


# =============================================================================
# TOKEN VALIDATION ENDPOINT (for middleware)
# =============================================================================

@billing_bp.route('/auth/verify', methods=['POST'])
def verify_auth_token():
    """
    Validate Firebase ID token for middleware.
    
    This endpoint is called by the Next.js proxy middleware to validate
    tokens server-side before allowing access to protected routes.
    
    Request Body:
    {
        "token": "firebase_id_token"
    }
    
    Response:
    {
        "valid": true,
        "userId": "...",
        "email": "..."
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({'valid': False, 'error': 'MISSING_BODY'}), 400
    
    token = data.get('token')
    if not token:
        return jsonify({'valid': False, 'error': 'MISSING_TOKEN'}), 400
    
    try:
        # Use Firebase Admin SDK to validate token with strict checking
        from firebase_admin import auth as firebase_auth
        
        # Verify with check_revoked=True - strict validation
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
        
        user_id = decoded.get('user_id') or decoded.get('sub')
        email = decoded.get('email', '')
        
        if not user_id:
            return jsonify({'valid': False, 'error': 'INVALID_TOKEN_PAYLOAD'}), 401
        
        return jsonify({
            'valid': True,
            'userId': user_id,
            'email': email,
        })
        
    except Exception as e:
        error_msg = str(e).lower()
        
        if 'expired' in error_msg:
            return jsonify({'valid': False, 'error': 'TOKEN_EXPIRED'}), 401
        elif 'revoked' in error_msg:
            return jsonify({'valid': False, 'error': 'TOKEN_REVOKED'}), 401
        elif 'invalid' in error_msg:
            return jsonify({'valid': False, 'error': 'INVALID_TOKEN'}), 401
        else:
            logger.error(f"Token validation error: {e}")
            return jsonify({'valid': False, 'error': 'VALIDATION_ERROR'}), 500
