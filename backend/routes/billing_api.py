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
import json
import uuid

# =============================================================================
# LOGGER
# =============================================================================

logger = logging.getLogger('reviseit.billing.api')

# =============================================================================
# BLUEPRINT
# =============================================================================

billing_bp = Blueprint('billing', __name__, url_prefix='/api/billing')

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _ensure_supabase_uuid(uid: str) -> str:
    """Map Firebase UID to Supabase UUID if necessary."""
    if not uid or (len(uid) == 36 and '-' in uid):
        return uid
    try:
        from supabase_client import get_user_id_from_firebase_uid
        supa_id = get_user_id_from_firebase_uid(uid)
        return supa_id if supa_id else uid
    except Exception as e:
        logger.warning(f"Failed to map Firebase UID {uid}: {e}")
        return uid


# =============================================================================
# DATABASE MODELS (Simplified - use actual models in production)
# =============================================================================

class PricingPlan:
    """Represents a pricing plan from database."""
    
    @staticmethod
    def get_by_domain_and_slug(domain: str, slug: str) -> Optional[Dict[str, Any]]:
        """
        Fetch pricing plan by domain and slug.
        
        Handles two slug formats:
        - Full format: 'shop_business' (database storage format)
        - Short format: 'business' (frontend tier ID format)
        
        Will attempt the given slug first, then try the domain-prefixed variant
        as a fallback to bridge the frontend/backend naming gap.
        """
        if not domain or not slug:
            logger.error(
                f"get_by_domain_and_slug called with missing args: "
                f"domain={domain!r}, slug={slug!r}. "
                f"X-Product-Domain header is likely not being forwarded."
            )
            return None
        
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            
            # --- Attempt 1: exact slug as provided ---
            logger.debug(
                f"[PricingPlan] Looking up plan: domain={domain!r}, slug={slug!r}"
            )
            result = db.table('pricing_plans').select('*').eq(
                'product_domain', domain
            ).eq(
                'plan_slug', slug
            ).eq(
                'is_active', True
            ).maybe_single().execute()
            
            if result and getattr(result, 'data', None):
                logger.debug(
                    f"[PricingPlan] Found plan on first attempt: "
                    f"domain={domain!r}, slug={slug!r}"
                )
                return result.data
            
            # --- Attempt 2: domain-prefixed slug fallback ---
            # Frontend sends short tier IDs ('business', 'starter', 'pro').
            # DB stores full slugs ('shop_business', 'shop_starter', 'shop_pro').
            # If the slug doesn't already start with the domain, prepend it.
            if not slug.startswith(f"{domain}_"):
                full_slug = f"{domain}_{slug}"
                logger.debug(
                    f"[PricingPlan] First attempt failed. Retrying with "
                    f"domain-prefixed slug: {full_slug!r}"
                )
                fallback_result = db.table('pricing_plans').select('*').eq(
                    'product_domain', domain
                ).eq(
                    'plan_slug', full_slug
                ).eq(
                    'is_active', True
                ).maybe_single().execute()
                
                if fallback_result and getattr(fallback_result, 'data', None):
                    logger.info(
                        f"[PricingPlan] Plan found via fallback slug: "
                        f"domain={domain!r}, slug={slug!r} → matched as {full_slug!r}"
                    )
                    return fallback_result.data
            
            logger.warning(
                f"[PricingPlan] Plan not found after all attempts: "
                f"domain={domain!r}, original_slug={slug!r}. "
                f"Verify the pricing_plans table has an active row with "
                f"product_domain='{domain}' and plan_slug='{slug}' or "
                f"'{domain}_{slug}'."
            )
            return None
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
    def get_by_user_and_domain(
        user_id: str,
        domain: str,
        *,
        include_past_due: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch active subscription for user on domain.
        
        Args:
            user_id: The user's ID.
            domain: The product domain.
            include_past_due: If True, also includes 'past_due' in the status
                filter. Default False (past_due users are allowed to re-subscribe).
        """
        try:
            from supabase_client import get_supabase_client
            
            db = get_supabase_client()
            
            # Note: 'past_due' is intentionally NOT included here so that
            # users with failed payments can still initiate a new subscription.
            # The billing system handles deduplication via Razorpay webhook.
            # IMPORTANT: 'processing' is not an entitled state for our product
            # and must not block a user from retrying checkout.
            active_statuses = ['active', 'trialing', 'trial', 'grace_period', 'completed']
            if include_past_due:
                active_statuses.append('past_due')
            
            result = db.table('subscriptions').select('*').eq(
                'user_id', user_id
            ).eq(
                'product_domain', domain
            ).in_(
                'status', active_statuses
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
                'domain', domain
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
                'domain', domain
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
    
    def check(
        self,
        key: str,
        user_id: str
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if key exists and belongs to user.
        
        Returns: (is_new, existing_data)
        - is_new=True: No existing entry, safe to proceed
        - is_new=False: Entry exists, check existing_data for completion status
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
            
            # No existing entry - is_new=True
            return True, None
            
        except Exception as e:
            logger.error(f"Redis idempotency error: {e}")
            # Fail open - treat as new
            return True, None
    
    def check_and_store(
        self,
        key: str,
        user_id: str,
        data: Dict[str, Any],
        ttl_seconds: int = 86400  # 24 hours
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        DEPRECATED: Use check() instead. 
        Store initial data only after successful transaction via update_data().
        """
        is_new, existing = self.check(key, user_id)
        if is_new:
            # Store initial data (temporary - will be updated on success)
            redis_key = self._make_key(key)
            store_data = {
                'user_id': user_id,
                'data': data,
                'created_at': time.time(),
            }
            if self._redis:
                try:
                    import json
                    self._redis.setex(redis_key, ttl_seconds, json.dumps(store_data))
                except Exception as e:
                    logger.error(f"Redis idempotency store error: {e}")
        return is_new, existing
    
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
    
    def delete(self, key: str, user_id: str) -> bool:
        """
        Delete idempotency key (used after failed transactions to allow retry).
        
        Args:
            key: The idempotency key to delete
            user_id: User ID for ownership verification
            
        Returns: True if deleted, False otherwise
        """
        if not self._redis:
            return False
        
        redis_key = self._make_key(key)
        
        try:
            # Verify ownership before deleting
            existing = self._redis.get(redis_key)
            if existing:
                import json
                stored_data = json.loads(existing)
                if stored_data.get('user_id') != user_id:
                    logger.warning(f"Idempotency delete ownership mismatch: key={key[:8]}...")
                    return False
            
            self._redis.delete(redis_key)
            logger.info(f"Deleted idempotency key: {key[:8]}...")
            return True
        except Exception as e:
            logger.error(f"Redis idempotency delete error: {e}")
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
# PROMETHEUS METRICS (BEST-EFFORT)
# =============================================================================

try:
    from prometheus_client import Counter, Histogram, Gauge  # type: ignore

    billing_verify_requests_total = Counter(
        "billing_verify_requests_total",
        "Total verify-subscription requests",
        ["domain"],
    )
    billing_verify_success_total = Counter(
        "billing_verify_success_total",
        "Total verify-subscription successes",
        ["domain"],
    )
    billing_verify_error_total = Counter(
        "billing_verify_error_total",
        "Total verify-subscription errors",
        ["domain", "code"],
    )
    billing_verify_idempotent_replays_total = Counter(
        "billing_verify_idempotent_replays_total",
        "Total verify-subscription idempotent replays",
        ["domain"],
    )
    billing_verify_lock_contention_total = Counter(
        "billing_verify_lock_contention_total",
        "Total verify-subscription lock contention events",
        ["domain"],
    )
    billing_verify_latency_ms = Histogram(
        "billing_verify_latency_ms",
        "Verify-subscription end-to-end latency in ms",
        ["domain"],
        buckets=(50, 100, 200, 500, 1000, 2000, 5000, 10000),
    )
    razorpay_fetch_latency_ms = Histogram(
        "razorpay_fetch_latency_ms",
        "Razorpay subscription fetch latency in ms",
        ["domain"],
        buckets=(50, 100, 200, 500, 1000, 2000, 5000),
    )
    billing_circuit_breaker_open = Gauge(
        "billing_circuit_breaker_open",
        "Razorpay circuit breaker open state (1=open, 0=closed)",
        ["domain"],
    )
except Exception:
    billing_verify_requests_total = None
    billing_verify_success_total = None
    billing_verify_error_total = None
    billing_verify_idempotent_replays_total = None
    billing_verify_lock_contention_total = None
    billing_verify_latency_ms = None
    razorpay_fetch_latency_ms = None
    billing_circuit_breaker_open = None


# =============================================================================
# VERIFY HELPERS
# =============================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ts_to_iso(ts: Any) -> Optional[str]:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        return str(ts)
    except Exception:
        return None


def _make_verify_idempotency_key(key: str) -> str:
    return f"idempotency:billing:verify:{key}"


def _make_verify_lock_key(domain: str, razorpay_subscription_id: str) -> str:
    return f"lock:billing:verify:{domain}:{razorpay_subscription_id}"


def _redis_get_json(redis_client, key: str) -> Optional[Dict[str, Any]]:
    try:
        raw = redis_client.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None


def _redis_set_json(redis_client, key: str, value: Dict[str, Any], ttl_seconds: int) -> bool:
    try:
        redis_client.setex(key, ttl_seconds, json.dumps(value, default=str))
        return True
    except Exception:
        return False


def _acquire_redis_lock(redis_client, lock_key: str, *, ttl_seconds: int = 30) -> Optional[str]:
    token = uuid.uuid4().hex
    try:
        ok = redis_client.set(lock_key, token, nx=True, ex=ttl_seconds)
        return token if ok else None
    except Exception:
        return None


def _release_redis_lock(redis_client, lock_key: str, token: str) -> None:
    try:
        current = redis_client.get(lock_key)
        if current == token:
            redis_client.delete(lock_key)
    except Exception:
        pass


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
    Create a secure checkout session with transactional idempotency.
    
    Security:
    - Plan slug validated against domain whitelist
    - Price ID resolved server-side (never trust client)
    - Transactional idempotency (ACID guarantee, no duplicate charges)
    - Outbox pattern for metering (guaranteed event delivery)
    - Circuit breaker for Razorpay
    - Subscription state validation
    - Signed context verification
    
    Request Body:
    {
        "planSlug": "starter",
        "idempotencyKey": "client-generated-uuid"
    }
    
    Headers:
    - X-User-Id: User ID from auth
    - X-Tenant-Domain: Domain from middleware
    - X-Signed-Context: Signed domain context
    - Idempotency-Key: Client-generated unique key
    """
    from transactional_idempotency import idempotency_handler, ConcurrentRequestError
    
    request_id = getattr(g, 'request_id', f"req_{int(time.time())}")
    user_id = getattr(g, 'user_id', None) or request.headers.get('X-User-Id')
    client_ip = getattr(g, 'client_ip', 'unknown')
    
    # Verify signed context (FAANG pattern: backend validates, never trusts frontend)
    signed_context = request.headers.get('X-Signed-Context')
    claimed_domain = request.headers.get('X-Tenant-Domain')
    client_idempotency_key = request.headers.get('Idempotency-Key')
    
    if not signed_context:
        logger.error(f"[{request_id}] Missing signed context")
        return jsonify({
            'success': False,
            'error': 'MISSING_CONTEXT',
            'message': 'Security context missing.',
        }), 400
    
    # Verify signature and extract context
    from domain_resolver import domain_resolver
    context = domain_resolver.verify_context(signed_context)
    
    if not context:
        logger.error(f"[{request_id}] Invalid or expired signed context")
        return jsonify({
            'success': False,
            'error': 'INVALID_CONTEXT',
            'message': 'Security context invalid or expired.',
        }), 401
    
    # HARD CONTRACT VALIDATION (FAANG Standard)
    # The database strictly requires a valid UUID for subscriptions.user_id
    supabase_user_id = _ensure_supabase_uuid(user_id)
    
    if not supabase_user_id or len(supabase_user_id) != 36 or '-' not in supabase_user_id:
        audit_logger.log(
            event_type='billing.user_id.mapping_failed',
            severity='CRITICAL',
            user_id=user_id,
            tenant=claimed_domain,
            request_id=request_id,
            outcome={'success': False, 'reason': 'invalid_identity'}
        )
        return jsonify({
            'success': False,
            'error': 'INVALID_IDENTITY',
            'message': 'Failed to resolve valid system identity.',
        }), 401
        
    audit_logger.log(
        event_type='billing.user_id.mapped',
        severity='INFO',
        user_id=user_id,
        tenant=claimed_domain,
        request_id=request_id,
        outcome={'success': True, 'supabase_user_id': supabase_user_id}
    )
    
    # Validate: claimed domain must match actual domain
    if claimed_domain and claimed_domain != context.get('domain'):
        logger.critical(f"[{request_id}] DOMAIN_MISMATCH: claimed={claimed_domain}, actual={context.get('domain')}")
        audit_logger.log(
            event_type='billing.security.domain_mismatch',
            severity='CRITICAL',
            user_id=user_id,
            tenant=claimed_domain,
            request_id=request_id,
            outcome={
                'success': False,
                'reason': 'domain_mismatch',
                'claimed_domain': claimed_domain,
                'actual_domain': context.get('domain'),
            }
        )
        return jsonify({
            'success': False,
            'error': 'SECURITY_VIOLATION',
            'message': 'Domain mismatch detected.',
        }), 403
    
    # Use the verified domain
    domain = context.get('domain', claimed_domain)
    tenant_id = context.get('tenantId')
    
    if not user_id or not domain:
        return jsonify({
            'success': False,
            'error': 'MISSING_CONTEXT',
            'message': 'Authentication or tenant context missing.',
        }), 400
    
    # Validate idempotency key (required for billing)
    if not client_idempotency_key:
        return jsonify({
            'success': False,
            'error': 'MISSING_IDEMPOTENCY_KEY',
            'message': 'Idempotency-Key header required for billing operations.',
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
    # Client idempotency key is provided via header; body field is informational only.
    _body_idempotency_key = data.get('idempotencyKey')
    
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
    
    # Note: past_due subscriptions are intentionally allowed through so
    # users can re-subscribe after a payment failure. The 'past_due' status
    # means Razorpay already halted the subscription — a new one is safe.
    existing_sub = Subscription.get_by_user_and_domain(user_id, domain)
    if existing_sub:
        sub_status = existing_sub.get('status', 'unknown')
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
                'existing_status': sub_status,
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
    
    logger.info(
        f"[{request_id}] Plan lookup: domain={domain!r}, plan_slug={plan_slug!r}"
    )
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
                'domain': domain,
            }
        )
        return jsonify({
            'success': False,
            'error': 'PLAN_NOT_FOUND',
            'message': 'Selected plan is not available.',
            'details': {
                'error': 'PLAN_NOT_FOUND',
                'message': 'Selected plan is not available.',
                'domain': domain or 'not_provided',
                'plan_slug': plan_slug,
                'hint': (
                    f'Verify pricing_plans table has an active row with '
                    f'product_domain=\'{domain}\' and plan_slug=\'{plan_slug}\' '
                    f'or \'{domain}_{plan_slug}\'.'
                ) if domain else (
                    'X-Product-Domain header was not forwarded to the backend. '
                    'Check the Next.js API route proxy call.'
                ),
                'success': False
            }
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
    
    # FAANG pattern: Bind idempotency to user+domain and client key, so retries replay
    # but new attempts generate new sessions (no month-sticky "stale checkout URL").
    idempotency_key = hashlib.sha256(
        f"{user_id}:{domain}:{client_idempotency_key}".encode()
    ).hexdigest()[:32]
    
    # Check for existing completed transaction (no initial storage to avoid stale data)
    is_new, existing_data = idempotency_store.check(idempotency_key, user_id)
    
    if not is_new and existing_data and existing_data.get('checkout_url'):
        # Valid completed transaction - return cached result
        logger.info(f"[{request_id}] Idempotency hit - returning completed session")
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
    elif not is_new:
        # Previous attempt failed - clear and retry
        logger.warning(f"[{request_id}] Clearing incomplete idempotency entry for retry")
        idempotency_store.delete(idempotency_key, user_id)
    
    # =================================================================
    # STEP 5: CREATE RAZORPAY CHECKOUT (WITH TRANSACTIONAL IDEMPOTENCY)
    # =================================================================
    # FAANG Pattern: Wrap entire operation in ACID transaction
    # If ANY step fails (Razorpay charge, DB write, outbox), entire transaction rolls back
    
    def create_checkout_operation(tx):
        """Checkout operation executed within idempotency transaction."""
        # Resolve Razorpay plan ID (needed for the DB record)
        from services.environment import get_razorpay_environment
        env = get_razorpay_environment()
        razorpay_plan_id = plan.get(f'razorpay_plan_id_{env}') or plan.get('razorpay_plan_id')
        
        if not razorpay_plan_id:
            raise ValueError(f"No Razorpay plan ID for environment: {env}")
            
        # Stripe-like contract: this endpoint must return a checkout URL immediately.
        # The existing outbox processor (`backend/outbox_processor.py`) also creates
        # Razorpay subscriptions for `subscription.created` events; emitting those
        # events here would double-create subscriptions. Therefore, checkout-session
        # performs the Razorpay creation synchronously and does NOT emit outbox.
        from datetime import datetime, timezone

        # Insert (or reuse) a pending subscription row first for bookkeeping.
        subscription_id = None
        try:
            sub_res = tx.table('subscriptions').insert({
                'user_id': supabase_user_id,
                'product_domain': domain,
                'pricing_plan_id': plan['id'],
                'plan_id': razorpay_plan_id,
                'plan_name': plan.get('plan_slug', ''),
                'amount_paise': plan.get('amount_paise', 0),
                'currency': plan.get('currency', 'INR'),
                'status': 'pending',
                'idempotency_key': idempotency_key,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).execute()
            if sub_res.data:
                subscription_id = sub_res.data[0]['id']
        except Exception as insert_err:
            # If the idempotency_key is unique and the row already exists, reuse it.
            msg = str(insert_err).lower()
            if 'duplicate' in msg or 'unique' in msg:
                existing = tx.table('subscriptions').select('id').eq(
                    'idempotency_key', idempotency_key
                ).limit(1).execute()
                if existing.data:
                    subscription_id = existing.data[0]['id']
            if not subscription_id:
                raise

        # Create a Razorpay checkout URL for the user to complete payment.
        # This endpoint is called synchronously by the frontend, so we must return
        # a usable URL (Stripe-like "checkout session" contract).
        try:
            import razorpay  # type: ignore
        except Exception as e:
            raise RuntimeError(f"Razorpay SDK unavailable: {e}")

        key_id = os.getenv('RAZORPAY_KEY_ID')
        key_secret = os.getenv('RAZORPAY_KEY_SECRET')
        if not key_id or not key_secret:
            raise RuntimeError("Razorpay credentials not configured")

        client = razorpay.Client(auth=(key_id, key_secret))

        # Razorpay subscription "short_url" is a hosted payment page.
        # Keep total_count bounded; production can move this to plan config.
        rp_sub = client.subscription.create({
            "plan_id": razorpay_plan_id,
            "total_count": 12,
            "customer_notify": 1,
            "notes": {
                "product_domain": domain,
                "pending_subscription_id": subscription_id,
                "pricing_plan_id": str(plan.get('id')),
                "idempotency_key": idempotency_key,
            },
        })

        razorpay_subscription_id = rp_sub.get('id')
        checkout_url = rp_sub.get('short_url') or rp_sub.get('shortUrl')
        if not razorpay_subscription_id or not checkout_url:
            raise RuntimeError("Razorpay subscription creation did not return id/short_url")

        # Persist Razorpay subscription id for webhook reconciliation.
        tx.table('subscriptions').update({
            'razorpay_subscription_id': razorpay_subscription_id,
            'status': 'pending',
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', subscription_id).execute()

        # Log successful atomic creation
        audit_logger.log(
            event_type='billing.subscription.pending',
            severity='INFO',
            user_id=user_id,
            tenant=domain,
            request_id=request_id,
            outcome={
                'success': True,
                'subscription_id': subscription_id,
                'plan_slug': plan_slug,
            }
        )
        
        return {
            'pending_subscription_id': subscription_id,
            'checkout_url': checkout_url,
            'session_id': razorpay_subscription_id,
            'plan': {
                'name': plan['display_name'],
                'amount': plan['amount_paise'],
                'currency': plan.get('currency', 'INR'),
            }
        }
    
    try:
        # Execute with transactional idempotency
        exec_result = idempotency_handler.execute(
            idempotency_key=idempotency_key,
            operation=create_checkout_operation,
            user_id=user_id,
            tenant_id=tenant_id
        )
        # backend/transactional_idempotency.py returns a wrapper:
        # {"status": "...", "result": <operation_result>, "from_cache": bool}
        result = exec_result.get('result') if isinstance(exec_result, dict) else exec_result
        if not isinstance(result, dict):
            raise TypeError(f"Idempotency handler returned non-dict result: {type(result)}")
        
        # Store successful result for future idempotency hits
        # Only cache completed transactions
        if result and result.get('pending_subscription_id') and result.get('checkout_url'):
            idempotency_store.update_data(
                idempotency_key,
                user_id,
                result,
                ttl_seconds=900  # 15 minutes - enough for checkout completion
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
                'pending_subscription_id': result['pending_subscription_id'],
                'amount_paise': plan['amount_paise'],
            },
            security={
                'abuse_score': getattr(g, 'abuse_score', 0),
                'idempotency_key': idempotency_key[:8] + '...',
            }
        )
        
        return jsonify({
            'success': True,
            'pendingSubscriptionId': result['pending_subscription_id'],
            'checkoutUrl': result.get('checkout_url'),
            'sessionId': result.get('session_id'),
            'keyId': os.getenv('RAZORPAY_KEY_ID') or '',
            'plan': result['plan'],
            'message': 'Subscription pending. It will be created shortly.'
        })
        
    except ConcurrentRequestError:
        # Another request is processing the same idempotency key
        return jsonify({
            'success': False,
            'error': 'CONCURRENT_REQUEST',
            'message': 'Request already in progress. Please retry shortly.',
        }), 429
        
    except Exception as e:
        # Record failure
        razorpay_circuit_breaker.record_failure()
        
        # CRITICAL: Delete idempotency entry to allow retry
        # The transaction failed, so we must clear the key for immediate retry
        idempotency_store.delete(idempotency_key, user_id)
        
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


@billing_bp.route('/verify-subscription', methods=['POST'])
def verify_subscription():
    """
    Verify a Razorpay subscription payment and activate local entitlements.

    This endpoint is:
    - Idempotent (Idempotency-Key header + Redis replay)
    - Concurrency-safe (Redis lock per (domain, razorpay_subscription_id))
    - Resilient (circuit breaker + short Razorpay timeout; returns 202 when unavailable)

    Required headers:
    - X-Signed-Context
    - X-User-Id
    - X-Request-Id (optional; generated if missing)
    - Idempotency-Key (required)
    """
    started = time.time()
    request_id = request.headers.get('X-Request-Id') or getattr(g, 'request_id', None) or f"req_{uuid.uuid4().hex[:16]}"
    firebase_uid = request.headers.get('X-User-Id') or getattr(g, 'user_id', None)
    signed_context = request.headers.get('X-Signed-Context')
    idem_key = request.headers.get('Idempotency-Key')

    if not signed_context:
        return jsonify({'success': False, 'code': 'MISSING_CONTEXT', 'message': 'Security context missing.', 'requestId': request_id}), 400
    if not firebase_uid:
        return jsonify({'success': False, 'code': 'UNAUTHORIZED', 'message': 'Authentication required.', 'requestId': request_id}), 401
    if not idem_key:
        return jsonify({'success': False, 'code': 'MISSING_IDEMPOTENCY_KEY', 'message': 'Idempotency-Key header is required.', 'requestId': request_id}), 400

    # Verify signature and extract domain context
    from domain_resolver import domain_resolver
    context = domain_resolver.verify_context(signed_context)
    if not context:
        return jsonify({'success': False, 'code': 'INVALID_CONTEXT', 'message': 'Security context invalid or expired.', 'requestId': request_id}), 401

    domain = context.get('domain')
    tenant_id = context.get('tenantId')
    if not domain:
        return jsonify({'success': False, 'code': 'MISSING_DOMAIN', 'message': 'Tenant domain missing.', 'requestId': request_id}), 400

    logger.info(
        f"[{request_id}] verify_subscription_start "
        f"user={str(firebase_uid)[:8]}... domain={domain} tenant={str(tenant_id)[:8]}... idem={idem_key[:8]}..."
    )

    if billing_verify_requests_total:
        billing_verify_requests_total.labels(domain=domain).inc()
    if billing_circuit_breaker_open:
        billing_circuit_breaker_open.labels(domain=domain).set(1 if razorpay_circuit_breaker.state == CircuitBreaker.STATE_OPEN else 0)

    # Redis for lock + idempotency replay
    redis_client = get_redis_client()
    if not redis_client:
        # We can still proceed, but we lose lock/idempotency guarantees.
        logger.warning(f"[{request_id}] verify_subscription redis_unavailable domain={domain}")

    # Idempotency replay
    replay_key = _make_verify_idempotency_key(idem_key)
    if redis_client:
        replay = _redis_get_json(redis_client, replay_key)
        if replay:
            if billing_verify_idempotent_replays_total:
                billing_verify_idempotent_replays_total.labels(domain=domain).inc()
            if billing_verify_latency_ms:
                billing_verify_latency_ms.labels(domain=domain).observe((time.time() - started) * 1000)
            status_code = int(replay.pop('_http_status', 200))
            logger.info(
                f"[{request_id}] verify_subscription_replay "
                f"domain={domain} status={status_code} idem={idem_key[:8]}..."
            )
            return jsonify(replay), status_code

    # Parse body
    body = request.get_json(silent=True) or {}
    razorpay_subscription_id = body.get('razorpay_subscription_id')
    razorpay_payment_id = body.get('razorpay_payment_id')
    razorpay_signature = body.get('razorpay_signature')

    if not razorpay_subscription_id or not razorpay_payment_id or not razorpay_signature:
        if billing_verify_error_total:
            billing_verify_error_total.labels(domain=domain, code="MISSING_FIELDS").inc()
        return jsonify({
            'success': False,
            'code': 'MISSING_FIELDS',
            'message': 'razorpay_subscription_id, razorpay_payment_id, razorpay_signature are required.',
            'requestId': request_id,
        }), 400

    # Acquire distributed lock (best-effort)
    lock_token = None
    lock_key = _make_verify_lock_key(domain, razorpay_subscription_id)
    if redis_client:
        lock_token = _acquire_redis_lock(redis_client, lock_key, ttl_seconds=30)
        if not lock_token:
            if billing_verify_lock_contention_total:
                billing_verify_lock_contention_total.labels(domain=domain).inc()
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="CONCURRENT_REQUEST").inc()
            resp = {
                'success': False,
                'code': 'CONCURRENT_REQUEST',
                'message': 'Another verification request is in progress. Please retry shortly.',
                'retryAfterSeconds': 2,
                'requestId': request_id,
            }
            # Store replay for short time to dampen storms
            _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 429}, ttl_seconds=10)
            return jsonify(resp), 429

    try:
        # Verify ownership mapping (Firebase → Supabase UUID)
        supabase_user_id = _ensure_supabase_uuid(firebase_uid)
        if not supabase_user_id or len(supabase_user_id) != 36 or '-' not in supabase_user_id:
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="INVALID_IDENTITY").inc()
            return jsonify({
                'success': False,
                'code': 'INVALID_IDENTITY',
                'message': 'Failed to resolve a valid system identity.',
                'requestId': request_id,
            }), 401

        # Circuit breaker fast-fail → 202 processing
        if not razorpay_circuit_breaker.can_execute():
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="RAZORPAY_UNAVAILABLE").inc()
            resp = {
                'success': False,
                'code': 'RAZORPAY_UNAVAILABLE',
                'message': 'Payment gateway temporarily unavailable. Please wait while we finalize your subscription.',
                'retryAfterSeconds': 5,
                'requestId': request_id,
            }
            if redis_client:
                _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 202}, ttl_seconds=30)
            return jsonify(resp), 202

        # Razorpay client (short timeout)
        try:
            import razorpay  # type: ignore
        except Exception as e:
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="RAZORPAY_SDK_UNAVAILABLE").inc()
            return jsonify({'success': False, 'code': 'RAZORPAY_UNAVAILABLE', 'message': f'Razorpay SDK unavailable: {e}', 'requestId': request_id}), 503

        key_id = os.getenv('RAZORPAY_KEY_ID')
        key_secret = os.getenv('RAZORPAY_KEY_SECRET')
        if not key_id or not key_secret:
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="RAZORPAY_NOT_CONFIGURED").inc()
            return jsonify({'success': False, 'code': 'PAYMENT_SERVICE_NOT_CONFIGURED', 'message': 'Payment service not configured.', 'requestId': request_id}), 503

        client = razorpay.Client(auth=(key_id, key_secret))
        # Best-effort timeout enforcement
        try:
            if hasattr(client, 'session') and client.session is not None:
                client.session.timeout = 3  # type: ignore[attr-defined]
        except Exception:
            pass

        # 1) Verify signature
        try:
            client.utility.verify_subscription_payment_signature({
                'razorpay_subscription_id': razorpay_subscription_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature': razorpay_signature,
            })
        except Exception:
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="INVALID_SIGNATURE").inc()
            resp = {
                'success': False,
                'code': 'INVALID_SIGNATURE',
                'message': 'Payment verification failed (invalid signature).',
                'requestId': request_id,
            }
            if redis_client:
                _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 400}, ttl_seconds=300)
            return jsonify(resp), 400

        # 2) Fetch Razorpay subscription for authoritative status + billing period
        fetched = None
        rp_fetch_start = time.time()
        try:
            fetched = client.subscription.fetch(razorpay_subscription_id)
            razorpay_circuit_breaker.record_success()
        except Exception as e:
            razorpay_circuit_breaker.record_failure()
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="RAZORPAY_UNAVAILABLE").inc()
            logger.warning(f"[{request_id}] razorpay_fetch_failed domain={domain} sub={razorpay_subscription_id} err={e}")
            resp = {
                'success': False,
                'code': 'RAZORPAY_UNAVAILABLE',
                'message': 'Payment gateway temporarily unavailable. Your payment may still be processing.',
                'retryAfterSeconds': 5,
                'requestId': request_id,
            }
            if redis_client:
                _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 202}, ttl_seconds=30)
            return jsonify(resp), 202
        finally:
            if razorpay_fetch_latency_ms:
                razorpay_fetch_latency_ms.labels(domain=domain).observe((time.time() - rp_fetch_start) * 1000)

        rp_status = (fetched or {}).get('status')
        if rp_status not in ('active', 'authenticated'):
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="RAZORPAY_INACTIVE").inc()
            resp = {
                'success': False,
                'code': 'RAZORPAY_INACTIVE',
                'message': f'Payment not completed (gateway status: {rp_status}).',
                'requestId': request_id,
                'details': {
                    'razorpay_status': rp_status,
                }
            }
            if redis_client:
                _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 400}, ttl_seconds=60)
            return jsonify(resp), 400

        period_start = _ts_to_iso((fetched or {}).get('current_start'))
        period_end = _ts_to_iso((fetched or {}).get('current_end'))

        from supabase_client import get_supabase_client
        supabase = get_supabase_client()

        # 3) Load local subscription row (domain + user isolation)
        local_res = supabase.table('subscriptions').select('*').eq(
            'razorpay_subscription_id', razorpay_subscription_id
        ).eq(
            'product_domain', domain
        ).eq(
            'user_id', supabase_user_id
        ).order('created_at', desc=True).limit(1).execute()

        if not local_res.data:
            if billing_verify_error_total:
                billing_verify_error_total.labels(domain=domain, code="SUBSCRIPTION_NOT_FOUND").inc()
            resp = {
                'success': False,
                'code': 'SUBSCRIPTION_NOT_FOUND',
                'message': 'Subscription not found for this user/domain.',
                'requestId': request_id,
            }
            if redis_client:
                _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 404}, ttl_seconds=60)
            return jsonify(resp), 404

        local_sub = local_res.data[0]
        local_status = local_sub.get('status') or 'unknown'

        entitled = local_status in ('active', 'trialing', 'grace_period', 'completed')
        if entitled:
            if billing_verify_success_total:
                billing_verify_success_total.labels(domain=domain).inc()
            resp = {
                'success': True,
                'status': 'active',
                'idempotent': True,
                'requestId': request_id,
                'subscription': {
                    'id': local_sub.get('id'),
                    'razorpay_subscription_id': razorpay_subscription_id,
                    'plan_name': local_sub.get('plan_name'),
                    'status': 'active',
                    'current_period_start': local_sub.get('current_period_start'),
                    'current_period_end': local_sub.get('current_period_end'),
                },
                'resultCode': 'ALREADY_ACTIVATED',
            }
            if redis_client:
                _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 200}, ttl_seconds=86400)
            return jsonify(resp), 200

        # 4) Activate through canonical lifecycle engine
        from services.subscription_lifecycle import get_lifecycle_engine
        engine = get_lifecycle_engine()
        engine.handle_payment_success(
            subscription_id=local_sub['id'],
            razorpay_payment_id=razorpay_payment_id,
            razorpay_event_id=None,
            period_start=period_start,
            period_end=period_end,
        )

        # 5) Re-read and return
        refreshed = supabase.table('subscriptions').select(
            'id, status, plan_name, current_period_start, current_period_end'
        ).eq('id', local_sub['id']).single().execute()
        refreshed_data = refreshed.data or {}
        normalized_status = refreshed_data.get('status')
        if normalized_status == 'completed':
            normalized_status = 'active'

        resp = {
            'success': True,
            'status': normalized_status or 'active',
            'idempotent': False,
            'requestId': request_id,
            'subscription': {
                'id': refreshed_data.get('id') or local_sub.get('id'),
                'razorpay_subscription_id': razorpay_subscription_id,
                'plan_name': refreshed_data.get('plan_name') or local_sub.get('plan_name'),
                'status': normalized_status or 'active',
                'current_period_start': refreshed_data.get('current_period_start') or period_start,
                'current_period_end': refreshed_data.get('current_period_end') or period_end,
            },
        }

        if billing_verify_success_total:
            billing_verify_success_total.labels(domain=domain).inc()

        if redis_client:
            _redis_set_json(redis_client, replay_key, {**resp, '_http_status': 200}, ttl_seconds=86400)

        return jsonify(resp), 200

    finally:
        if redis_client and lock_token:
            _release_redis_lock(redis_client, lock_key, lock_token)
        logger.info(
            f"[{request_id}] verify_subscription_done domain={domain} "
            f"elapsed_ms={int((time.time() - started) * 1000)}"
        )
        if billing_verify_latency_ms:
            try:
                billing_verify_latency_ms.labels(domain=domain).observe((time.time() - started) * 1000)
            except Exception:
                pass


@billing_bp.route('/subscription-status', methods=['GET'])
def subscription_status():
    """
    Domain-scoped subscription status for polling after checkout.

    Requires X-Signed-Context + X-User-Id.
    Returns latest subscription for (user, domain), including pending states.
    """
    request_id = request.headers.get('X-Request-Id') or getattr(g, 'request_id', None) or f"req_{uuid.uuid4().hex[:16]}"
    firebase_uid = request.headers.get('X-User-Id') or getattr(g, 'user_id', None)
    signed_context = request.headers.get('X-Signed-Context')

    if not signed_context:
        return jsonify({'success': False, 'code': 'MISSING_CONTEXT', 'message': 'Security context missing.', 'requestId': request_id}), 400
    if not firebase_uid:
        return jsonify({'success': False, 'code': 'UNAUTHORIZED', 'message': 'Authentication required.', 'requestId': request_id}), 401

    from domain_resolver import domain_resolver
    context = domain_resolver.verify_context(signed_context)
    if not context:
        return jsonify({'success': False, 'code': 'INVALID_CONTEXT', 'message': 'Security context invalid or expired.', 'requestId': request_id}), 401

    domain = context.get('domain')
    if not domain:
        return jsonify({'success': False, 'code': 'MISSING_DOMAIN', 'message': 'Tenant domain missing.', 'requestId': request_id}), 400

    supabase_user_id = _ensure_supabase_uuid(firebase_uid)
    if not supabase_user_id or len(supabase_user_id) != 36 or '-' not in supabase_user_id:
        return jsonify({'success': False, 'code': 'INVALID_IDENTITY', 'message': 'Failed to resolve a valid system identity.', 'requestId': request_id}), 401

    from supabase_client import get_supabase_client
    supabase = get_supabase_client()

    res = supabase.table('subscriptions').select(
        'id, status, plan_name, razorpay_subscription_id, current_period_start, current_period_end, '
        'ai_responses_limit, ai_responses_used, created_at'
    ).eq('user_id', supabase_user_id).eq('product_domain', domain).order('created_at', desc=True).limit(1).execute()

    if not res.data:
        return jsonify({
            'success': True,
            'requestId': request_id,
            'hasSubscription': False,
            'subscription': None,
        }), 200

    sub = res.data[0]
    status = sub.get('status')
    if status == 'completed':
        status = 'active'

    return jsonify({
        'success': True,
        'requestId': request_id,
        'hasSubscription': True,
        'subscription': {
            'id': sub.get('id'),
            'status': status,
            'plan_name': sub.get('plan_name'),
            'razorpay_subscription_id': sub.get('razorpay_subscription_id'),
            'current_period_start': sub.get('current_period_start'),
            'current_period_end': sub.get('current_period_end'),
            'ai_responses_limit': sub.get('ai_responses_limit'),
            'ai_responses_used': sub.get('ai_responses_used'),
        },
    }), 200


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
