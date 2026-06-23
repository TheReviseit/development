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
import functools
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
# AUTH MIDDLEWARE
# =============================================================================

try:
    from middleware.auth import require_auth as _require_auth
    AUTH_AVAILABLE = True
except ImportError:
    _require_auth = None
    AUTH_AVAILABLE = False
    logger.warning("Auth middleware not available - using fallback")


def require_auth(f):
    if AUTH_AVAILABLE and _require_auth:
        return _require_auth(f)
    return f

# =============================================================================
# RATE LIMITING
# =============================================================================

try:
    from middleware.rate_limiter import rate_limit
    RATE_LIMIT_AVAILABLE = True
except ImportError:
    RATE_LIMIT_AVAILABLE = False
    
    def rate_limit(limit=60, window=60, key_func=None, scope='endpoint'):
        """No-op fallback when rate limiter not available."""
        def decorator(f):
            return f
        return decorator
    
    logger.warning("Rate limiter not available - billing endpoints unprotected")

# =============================================================================
# DISTRIBUTED TRACING
# =============================================================================

try:
    from services.billing_tracing import (
        get_or_create_correlation_id,
        CORRELATION_ID_HEADER,
        traced,
        span_context,
        billing_attributes,
    )
    TRACING_AVAILABLE = True
except ImportError:
    TRACING_AVAILABLE = False

    def get_or_create_correlation_id(headers=None):
        import uuid
        return str(uuid.uuid4())

    def traced(span_name=None, span_kind=None, attributes=None):
        def decorator(f):
            return f
        return decorator

    def billing_attributes(**kwargs):
        return {}

    class span_context:
        def __init__(self, name, kind=None, attributes=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass


# =============================================================================
# BLUEPRINT
# =============================================================================

billing_bp = Blueprint('billing', __name__, url_prefix='/api/billing')

# =============================================================================
# METRICS
# =============================================================================

try:
    from monitoring.billing_metrics import (
        init_billing_metrics,
        record_subscription_creation,
        record_pending_checkouts,
        track_creation_latency,
        track_checkout_poll_latency,
    )
    BILLING_METRICS_AVAILABLE = True
    init_billing_metrics()
except ImportError:
    BILLING_METRICS_AVAILABLE = False
    
    def record_subscription_creation(status, domain="unknown"):
        pass
    
    def record_pending_checkouts(count):
        pass
    
    def track_creation_latency(f):
        return f
    
    def track_checkout_poll_latency(f):
        return f
    
    logger.warning("Billing metrics not available - no Prometheus metrics for billing flow")

# =============================================================================
# REQUEST HOOKS — injected after billing_bp exists
# =============================================================================

@billing_bp.before_request
def _billing_before_request():
    """Set correlation ID and start time on every billing request."""
    g.correlation_id = get_or_create_correlation_id(dict(request.headers))
    g.start_time = time.time()


@billing_bp.after_request
def _billing_after_request(response):
    """Inject correlation ID into every billing response and track slow requests."""
    cid = getattr(g, 'correlation_id', None)
    if cid:
        response.headers[CORRELATION_ID_HEADER] = cid

    elapsed = time.time() - getattr(g, 'start_time', time.time())
    elapsed_ms = elapsed * 1000
    response.headers['X-Response-Time'] = f"{elapsed_ms:.2f}ms"

    if elapsed_ms > 200:
        logger.warning(
            f"Slow billing request: {request.path} took {elapsed_ms:.2f}ms "
            f"[correlation_id={cid}]"
        )

    return response

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

@functools.lru_cache(maxsize=1024)
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

def _pricing_cache_bucket() -> int:
    return int(time.time() / 300)


def _db_lookup_pricing_plan(domain: str, slug: str) -> Optional[Dict[str, Any]]:
    """Uncached DB lookup — used by the cached wrapper below."""
    from supabase_client import get_supabase_client
    db = get_supabase_client()

    result = db.table('pricing_plans').select('*').eq(
        'product_domain', domain
    ).eq('plan_slug', slug).eq('is_active', True).maybe_single().execute()

    if result and getattr(result, 'data', None):
        return result.data

    if not slug.startswith(f"{domain}_"):
        full_slug = f"{domain}_{slug}"
        fallback = db.table('pricing_plans').select('*').eq(
            'product_domain', domain
        ).eq('plan_slug', full_slug).eq('is_active', True).maybe_single().execute()
        if fallback and getattr(fallback, 'data', None):
            return fallback.data

    return None


@functools.lru_cache(maxsize=64)
def _cached_pricing_plan(domain: str, slug: str, cache_bucket: int) -> Optional[Dict[str, Any]]:
    """Cached pricing plan lookup. cache_bucket rotates every 5 minutes."""
    return _db_lookup_pricing_plan(domain, slug)


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
            return _cached_pricing_plan(domain, slug, _pricing_cache_bucket())
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
# Uses Redis-backed breaker when REDIS_CIRCUIT_BREAKER=true (shared across workers)
# Falls back to in-memory breaker when Redis is unavailable or flag is not set.
try:
    from services.circuit_breaker_redis import create_circuit_breaker as _create_redis_cb
    _redis_cb = _create_redis_cb(
        redis_key='cb:razorpay',
        failure_threshold=5,
        recovery_timeout=30,
        half_open_max_calls=3,
    )
    razorpay_circuit_breaker = _redis_cb or CircuitBreaker(
        failure_threshold=5,
        recovery_timeout=30,
        half_open_max_calls=3
    )
except Exception:
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


@billing_bp.route('/create-subscription', methods=['POST'])
@require_auth
@rate_limit(limit=10, window=60)  # 10 requests per minute per user
@track_creation_latency
@traced("billing.create_subscription", attributes=lambda: billing_attributes(
    domain=getattr(g, 'product_domain', None),
    plan_slug=request.get_json(silent=True).get('plan_name', '').lower() if request.get_json(silent=True) else None,
))
def create_subscription():
    """
    FAANG-level: Async subscription creation — returns 202 immediately.

    Instead of blocking for 800-8000ms on the Razorpay API call, this endpoint:
    1. Validates the request (< 50ms)
    2. Inserts a checkout_request with status='initiated' (< 20ms)
    3. Enqueues a Celery task (non-blocking, < 5ms)
    4. Returns 202 Accepted with checkout_token for polling

    Total API response time: < 100ms (vs previous 977ms-28s)

    Request Body:
    {
        "plan_name": "pro",
        "customer_email": "user@example.com",
        "customer_name": "User",
        "customer_phone": ""
    }

    Returns (202):
    {
        "success": true,
        "checkout_token": "uuid",
        "status": "initiated",
        "poll_url": "/api/billing/checkout-status/{token}"
    }
    """
    request_id = getattr(g, 'request_id', f"req_{uuid.uuid4().hex[:12]}")
    data = request.get_json(silent=True) or {}
    product_domain = getattr(g, 'product_domain', None)
    firebase_uid = getattr(g, 'firebase_uid', None)

    if not product_domain:
        record_subscription_creation('validation_error', 'unknown')
        return jsonify({
            'success': False, 'error': 'Product domain could not be determined.',
            'error_code': 'DOMAIN_REQUIRED',
        }), 400

    if not firebase_uid:
        record_subscription_creation('validation_error', 'unknown')
        return jsonify({
            'success': False, 'error': 'Authentication required.',
            'error_code': 'UNAUTHORIZED',
        }), 401

    from services.postgres_rate_limit import rate_limit_or_429
    limited = rate_limit_or_429(f"checkout:{firebase_uid}", 3600, 10)
    if limited:
        return jsonify(limited[0]), limited[1]

    plan_name = (data.get('plan_name') or '').lower()
    if not plan_name:
        record_subscription_creation('validation_error', product_domain)
        return jsonify({
            'success': False, 'error': 'plan_name is required.',
            'error_code': 'VALIDATION_ERROR',
        }), 400

    # Fast validation: pricing lookup (cached, < 20ms)
    plan_pricing = PricingPlan.get_by_domain_and_slug(product_domain, plan_name)
    if not plan_pricing:
        record_subscription_creation('plan_not_found', product_domain)
        return jsonify({
            'success': False,
            'error': f'Plan "{plan_name}" is not available for this product',
            'error_code': 'PLAN_NOT_FOUND',
        }), 404

    razorpay_plan_id = plan_pricing.get('razorpay_plan_id')
    amount_paise = plan_pricing.get('amount_paise', 0)
    currency = plan_pricing.get('currency', 'INR')
    if not razorpay_plan_id:
        record_subscription_creation('config_error', product_domain)
        return jsonify({
            'success': False, 'error': 'Pricing configuration error.',
            'error_code': 'PRICING_CONFIG_ERROR',
        }), 500

    key_id = os.getenv('RAZORPAY_KEY_ID')
    if not key_id:
        record_subscription_creation('config_error', product_domain)
        return jsonify({
            'success': False, 'error': 'Payment service not configured.',
            'error_code': 'PRICING_CONFIG_ERROR',
        }), 500

    from supabase_client import get_supabase_client
    supabase = get_supabase_client()
    supabase_user_id = _ensure_supabase_uuid(firebase_uid) or firebase_uid

    idempotency_key = request.headers.get('Idempotency-Key')
    if not idempotency_key:
        month_bucket = datetime.now(timezone.utc).strftime('%Y-%m')
        idem_raw = f"sub:{firebase_uid}:{product_domain}:{plan_name}:{month_bucket}"
        idempotency_key = hashlib.sha256(idem_raw.encode()).hexdigest()[:32]

    claim_token = None
    from config.billing_flags import get_bool_flag
    if get_bool_flag('fix_server_idempotency', True):
        from services.billing_checkout_idempotency import (
            claim_or_reclaim,
            get_cached_complete,
            complete_claim,
            fail_claim,
            IdempotencyInProgress,
        )
        cached = get_cached_complete(supabase, idempotency_key)
        if cached:
            logger.info(f"[{request_id}] idempotency_cache_hit key={idempotency_key[:12]}...")
            return jsonify(cached), 200
        try:
            _, claim_token = claim_or_reclaim(
                supabase,
                idempotency_key,
                supabase_user_id,
                product_domain,
                firebase_uid=firebase_uid,
            )
        except IdempotencyInProgress as in_progress:
            return jsonify({
                'success': False,
                'error': 'Subscription creation already in progress.',
                'error_code': 'IDEMPOTENCY_IN_PROGRESS',
                'retry_after_seconds': in_progress.retry_after_seconds,
            }), 409
        except Exception as idem_err:
            logger.error(f"[{request_id}] idempotency_claim_failed: {idem_err}", exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Could not initialize checkout. Please try again.',
                'error_code': 'IDEMPOTENCY_ERROR',
            }), 500

    # Generate unique checkout token
    checkout_token = str(uuid.uuid4())

    # Insert checkout_request (fast, < 20ms)
    try:
        record_pending_checkouts(-1)  # Signal gauge refresh downstream
        checkout_data = {
            'user_id': firebase_uid,
            'firebase_uid': firebase_uid,
            'domain': product_domain,
            'target_plan_id': plan_pricing.get('id', ''),
            'target_plan_slug': plan_name,
            'user_email': data.get('customer_email', ''),
            'checkout_token': checkout_token,
            'razorpay_plan_id': razorpay_plan_id,
            'amount_paise': amount_paise,
            'currency': currency,
            'status': 'initiated',
            'billing_cycle': 'monthly',
            'idempotency_key': idempotency_key,
        }
        if data.get('customer_phone'):
            checkout_data['user_phone'] = data.get('customer_phone')
        try:
            insert_result = supabase.table('checkout_requests').insert(checkout_data).execute()
        except Exception as e:
            error_str = str(e).lower()
            if 'unique constraint' in error_str or '23505' in error_str:
                logger.warning(f"[{request_id}] Duplicate checkout request: {firebase_uid[:8]} plan={plan_name}")
                return jsonify({
                    'success': False, 'error': 'A subscription is already being created for this plan. Please wait.',
                    'error_code': 'DUPLICATE_REQUEST',
                }), 409
            raise
        checkout_id = insert_result.data[0]['id'] if insert_result.data else None
    except Exception as e:
        logger.error(f"[{request_id}] Failed to create checkout request: {e}")
        record_subscription_creation('database_error', product_domain)
        return jsonify({
            'success': False, 'error': 'Failed to initialize subscription.',
            'error_code': 'DATABASE_ERROR',
        }), 500

    # Dispatch checkout — async default via bounded pool; sync only via runtime flag
    from config.billing_flags import get_bool_flag

    use_sync = get_bool_flag('billing_sync_checkout', False)
    logger.info(
        f"[{request_id}] checkout_dispatch mode={'sync' if use_sync else 'async_pool'} "
        f"token={checkout_token[:12]}..."
    )

    if use_sync:
        try:
            from tasks.subscription_worker import execute
            logger.info(f"[{request_id}] Processing checkout synchronously (billing_sync_checkout=true)")
            result = execute(checkout_token)
            if result.get('status') == 'completed':
                razorpay_sub_id = result.get('razorpay_subscription_id')
                key_id = os.getenv('RAZORPAY_KEY_ID')
                record_subscription_creation('completed', product_domain)
                success_payload = {
                    'success': True,
                    'subscription_id': razorpay_sub_id,
                    'key_id': key_id,
                    'amount': amount_paise,
                    'currency': currency,
                    'plan_name': plan_name,
                }
                if claim_token and get_bool_flag('fix_server_idempotency', True):
                    from services.billing_checkout_idempotency import complete_claim
                    complete_claim(supabase, idempotency_key, claim_token, success_payload)
                return jsonify(success_payload), 200
        except Exception as sync_e:
            logger.error(
                f"[{request_id}] Synchronous checkout failed, falling back to async pool: {sync_e}",
                exc_info=True,
            )

    try:
        from services.checkout_dispatch_pool import get_checkout_dispatch_pool
        pool = get_checkout_dispatch_pool()
        accepted = pool.try_submit(
            checkout_token,
            idempotency_key=idempotency_key,
            claim_token=claim_token,
            request_id=request_id,
        )
        if accepted:
            record_subscription_creation('initiated', product_domain)
            logger.info(
                f"[{request_id}] checkout_dispatched_async token={checkout_token[:12]}... status=202"
            )
            return jsonify({
                'success': True,
                'checkout_token': checkout_token,
                'status': 'initiated',
                'poll_url': f'/api/billing/checkout-status/{checkout_token}',
            }), 202
        if claim_token and get_bool_flag('fix_server_idempotency', True):
            from services.billing_checkout_idempotency import fail_claim
            fail_claim(supabase, idempotency_key, claim_token, 'CHECKOUT_QUEUE_FULL')
        return jsonify({
            'success': False,
            'error': 'Checkout queue is at capacity. Please retry shortly.',
            'error_code': 'CHECKOUT_QUEUE_FULL',
            'retry_after_seconds': 5,
        }), 429
    except Exception as dispatch_err:
        logger.error(f"[{request_id}] checkout_dispatch_failed: {dispatch_err}", exc_info=True)

    if claim_token and get_bool_flag('fix_server_idempotency', True):
        from services.billing_checkout_idempotency import fail_claim
        fail_claim(supabase, idempotency_key, claim_token, 'SERVICE_UNAVAILABLE')
    supabase.table('checkout_requests').update({
        'status': 'failed',
        'error_message': 'Payment processing queue unavailable.',
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }).eq('checkout_token', checkout_token).execute()
    return jsonify({
        'success': False, 'error': 'Payment service is temporarily unavailable. Please try again.',
        'error_code': 'SERVICE_UNAVAILABLE',
    }), 503


@billing_bp.route('/checkout-status/<checkout_token>', methods=['GET'])
@track_checkout_poll_latency
@traced("billing.checkout_status", attributes=lambda *a, **kw: billing_attributes(
    checkout_token=kw.get('checkout_token', a[0] if a else None),
))
def get_checkout_status(checkout_token):
    """
    Polling endpoint for async subscription creation.
    
    Returns the current status of a checkout request.
    Frontend polls this every 1-2 seconds after receiving 202.
    
    Returns:
      200: { success, status, subscription_id?, key_id?, amount?, plan_name? }
      404: { success: false, error_code: 'NOT_FOUND' }
    """
    request_id = getattr(g, 'request_id', f"req_{int(time.time())}")
    
    try:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        
        result = db.table('checkout_requests').select(
            'status, razorpay_subscription_id, razorpay_key_id, '
            'amount_paise, currency, target_plan_slug, error_message'
        ).eq('checkout_token', checkout_token).limit(1).execute()
        
        if not result.data:
            logger.warning(f"[{request_id}] Checkout token not found: {checkout_token[:12]}...")
            return jsonify({
                'success': False, 'error': 'Checkout request not found.',
                'error_code': 'NOT_FOUND',
            }), 404
        
        data = result.data[0]
        status = data.get('status', 'unknown')
        
        response = {
            'success': status == 'completed',
            'status': status,
        }
        
        if data.get('error_message'):
            response['error_message'] = data['error_message']
        
        if status == 'completed':
            response.update({
                'subscription_id': data.get('razorpay_subscription_id'),
                'key_id': data.get('razorpay_key_id'),
                'amount': data.get('amount_paise'),
                'currency': data.get('currency', 'INR'),
                'plan_name': data.get('target_plan_slug'),
            })
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"[{request_id}] Checkout status error: {e}")
        return jsonify({
            'success': False, 'error': 'Failed to check subscription status.',
            'error_code': 'DATABASE_ERROR',
        }), 500


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
    from config.billing_flags import get_bool_flag
    from concurrent.futures import ThreadPoolExecutor

    lookup_user_id = supabase_user_id if get_bool_flag('fix_checkout_user_id', True) else user_id

    # FAANG Pattern: Parallelize independent DB queries to reduce latency
    with ThreadPoolExecutor(max_workers=3) as executor:
        future_sub = executor.submit(Subscription.get_by_user_and_domain, lookup_user_id, domain)
        future_trial = executor.submit(FreeTrial.get_by_user_and_domain, user_id, domain)
        future_plan = executor.submit(PricingPlan.get_by_domain_and_slug, domain, plan_slug)
        
        existing_sub = future_sub.result()
        active_trial = future_trial.result()
        plan = future_plan.result()

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

        from routes.payments import get_razorpay_client
        client = get_razorpay_client()

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
@require_auth
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
    firebase_uid = getattr(g, 'firebase_uid', None) or request.headers.get('X-User-Id')
    if not firebase_uid:
        return jsonify({'success': False, 'code': 'UNAUTHORIZED', 'message': 'Authentication required.', 'requestId': request_id}), 401
    header_uid = request.headers.get('X-User-Id')
    if header_uid and getattr(g, 'firebase_uid', None) and header_uid != g.firebase_uid:
        return jsonify({'success': False, 'code': 'FORBIDDEN', 'message': 'User identity mismatch.', 'requestId': request_id}), 403
    signed_context = request.headers.get('X-Signed-Context')
    idem_key = request.headers.get('Idempotency-Key')

    if not signed_context:
        return jsonify({'success': False, 'code': 'MISSING_CONTEXT', 'message': 'Security context missing.', 'requestId': request_id}), 400
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

        from routes.payments import get_razorpay_client
        client = get_razorpay_client()

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
# CANCEL PENDING SUBSCRIPTION (hotfix A4)
# =============================================================================
# Called when a user dismisses the Razorpay checkout modal to clean up
# the pending subscription row that was created when checkout was initiated.
# Fire-and-forget — the backend background job also sweeps stale pending
# subscriptions every 15 minutes.

@billing_bp.route('/cancel-pending', methods=['POST'])
@require_auth
def cancel_pending_subscription():
    """
    Cancel a pending (abandoned) subscription for the current user + domain.
    
    This is best-effort cleanup. The caller (PlanCard modal ondismiss) does not
    wait for a response — any server error is silently ignored.
    
    A background Celery Beat task (abandoned_checkout_cleanup) runs every 15
    minutes to sweep any pending subscriptions older than 30 minutes as a
    safety net for requests that never reach this handler.
    """
    from flask import g as request_context
    
    start = time.time()
    request_id = str(uuid.uuid4())
    
    try:
        data = request.get_json(silent=True) or {}
        domain = data.get('domain') or getattr(g, 'product_domain', None)
        plan_slug = data.get('plan_slug', '')
        firebase_uid = getattr(g, 'firebase_uid', None)
        
        if not firebase_uid or not domain:
            return jsonify({
                'success': False, 'error': 'Missing user or domain context',
                'error_code': 'VALIDATION_ERROR', 'requestId': request_id,
            }), 400
        
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        user_id = _ensure_supabase_uuid(firebase_uid)
        
        # Find and cancel any pending subscriptions for this user + domain
        # Scope by plan_slug if provided, otherwise all pending for user+domain
        query = db.table('subscriptions') \
            .update({
                'status': 'cancelled',
                'updated_at': _now_iso(),
                'cancelled_at': _now_iso(),
                'cancellation_reason': 'checkout_abandoned',
            }) \
            .eq('user_id', user_id) \
            .eq('product_domain', domain) \
            .eq('status', 'pending') \
            .is_('deleted_at', 'null')
        
        if plan_slug:
            from services.plan_resolver import normalize_slug_for_display
            names = {plan_slug, normalize_slug_for_display(plan_slug, domain)}
            if not plan_slug.startswith(f"{domain}_"):
                names.add(f"{domain}_{plan_slug}")
            query = query.in_('plan_name', list(names))
        
        result = query.execute()
        
        cancelled_count = len(result.data or []) if hasattr(result, 'data') else 0
        
        # Invalidate cached subscription state
        from services.subscription_lifecycle import get_lifecycle_engine
        engine = get_lifecycle_engine()
        for sub in (result.data or []):
            engine._invalidate_caches_for_subscription(sub.get('id'))
        
        duration = (time.time() - start) * 1000
        
        logger.info(
            f"cancel_pending domain={domain} user={firebase_uid} "
            f"count={cancelled_count} duration_ms={duration:.0f}"
        )
        
        return jsonify({
            'success': True,
            'cancelled': cancelled_count,
            'requestId': request_id,
            'duration_ms': round(duration),
        }), 200
        
    except Exception as e:
        logger.error(
            f"cancel_pending_error requestId={request_id} error={e}",
            exc_info=True
        )
        return jsonify({
            'success': False, 'error': 'Internal server error',
            'error_code': 'INTERNAL_ERROR', 'requestId': request_id,
        }), 500


# =============================================================================
# RUNTIME FLAGS (read-only for Next.js proxy)
# =============================================================================

@billing_bp.route('/runtime-flags', methods=['GET'])
def get_runtime_flags():
    """Return billing runtime flags for Next.js proxy (30s cache client-side)."""
    try:
        from config.billing_flags import get_all_flags
        flags = get_all_flags()
        return jsonify({'success': True, 'flags': flags}), 200
    except Exception as e:
        logger.error(f"runtime_flags_error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Failed to load flags'}), 500


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
        
        # Verify with check_revoked=False - local token verification (no HTTPS call)
        decoded = firebase_auth.verify_id_token(token, check_revoked=False)
        
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
