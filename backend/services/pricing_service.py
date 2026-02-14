"""
Pricing Service — Environment-Aware, Cached, Enterprise Grade
================================================================
Single source of truth for plan pricing with automatic
sandbox/production Razorpay plan ID resolution.

Features:
    - Environment-scoped caching (sandbox & production never mix)
    - Auto-detection of sandbox vs production from RAZORPAY_KEY_ID
    - Fail-fast on missing plan IDs (PricingConfigurationError)
    - Versioned pricing with effective_from/effective_to support
    - Startup verification: verify_pricing_for_environment()

Public API:
    get_pricing_service() → PricingService (singleton)
    invalidate_cache() → int (number of keys cleared)
    verify_pricing_for_environment(env) → list of missing plans

Exceptions:
    PricingNotFoundError     — plan does not exist in the database
    PricingConfigurationError — plan exists but missing env-specific plan ID
"""

import os
import time
import logging
from typing import Dict, List, Any, Optional, Literal

logger = logging.getLogger('reviseit.pricing_service')


# =============================================================================
# EXCEPTIONS
# =============================================================================

class PricingNotFoundError(Exception):
    """Raised when a pricing plan does not exist in the database."""
    pass


class PricingConfigurationError(Exception):
    """Raised when pricing exists but is misconfigured (e.g., missing plan ID for current env)."""
    pass


# =============================================================================
# IN-MEMORY CACHE (environment-scoped)
# =============================================================================

class PricingCache:
    """
    Simple in-memory cache with TTL and environment-scoped keys.
    
    Cache key format: pricing:{env}:{domain}:{slug}:{cycle}
    This guarantees sandbox and production values NEVER mix.
    """
    
    def __init__(self, ttl: int = 300):
        self._cache: Dict[str, dict] = {}
        self._timestamps: Dict[str, float] = {}
        self._ttl = ttl
        self._hits = 0
        self._misses = 0
    
    def _make_key(self, env: str, domain: str, slug: str = '', cycle: str = '') -> str:
        """Generate environment-scoped cache key."""
        parts = ['pricing', env, domain]
        if slug:
            parts.append(slug)
        if cycle:
            parts.append(cycle)
        return ':'.join(parts)
    
    def get(self, env: str, domain: str, slug: str = '', cycle: str = '') -> Optional[Any]:
        """Get cached value if not expired."""
        key = self._make_key(env, domain, slug, cycle)
        if key in self._cache:
            if time.time() - self._timestamps[key] < self._ttl:
                self._hits += 1
                return self._cache[key]
            else:
                # Expired — remove
                del self._cache[key]
                del self._timestamps[key]
        self._misses += 1
        return None
    
    def set(self, value: Any, env: str, domain: str, slug: str = '', cycle: str = '') -> None:
        """Cache a value with timestamp."""
        key = self._make_key(env, domain, slug, cycle)
        self._cache[key] = value
        self._timestamps[key] = time.time()
    
    def invalidate_all(self) -> int:
        """Clear entire cache. Returns number of keys removed."""
        count = len(self._cache)
        self._cache.clear()
        self._timestamps.clear()
        return count
    
    def stats(self) -> Dict[str, Any]:
        """Return cache statistics."""
        return {
            'size': len(self._cache),
            'hits': self._hits,
            'misses': self._misses,
            'hit_rate': f"{self._hits/(self._hits+self._misses)*100:.1f}%" if (self._hits + self._misses) > 0 else "N/A",
            'ttl_seconds': self._ttl,
        }


# =============================================================================
# PRICING SERVICE
# =============================================================================

class PricingService:
    """
    Enterprise pricing service with environment-aware plan ID resolution.
    
    Usage:
        service = get_pricing_service()
        plan = service.get_plan('shop', 'starter', 'monthly')
        # plan['razorpay_plan_id'] is automatically resolved for current environment
    """
    
    def __init__(self, cache_ttl: int = 300):
        self._cache = PricingCache(ttl=cache_ttl)
        self._supabase = None
        self._env = None
    
    @property
    def supabase(self):
        """Lazy-load Supabase client."""
        if self._supabase is None:
            from supabase_client import get_supabase_client
            self._supabase = get_supabase_client()
        return self._supabase
    
    @property
    def env(self) -> str:
        """Get current environment (cached)."""
        if self._env is None:
            from services.environment import get_razorpay_environment
            self._env = get_razorpay_environment()
        return self._env
    
    def _resolve_plan_id(self, plan_row: dict) -> str:
        """
        Resolve the correct Razorpay plan ID for the current environment.
        
        Reads from razorpay_plan_id_sandbox or razorpay_plan_id_production
        based on auto-detected environment.
        
        Falls back to legacy razorpay_plan_id column if environment-specific
        column is not yet populated (backwards compatibility during migration).
        
        Args:
            plan_row: Database row dict from pricing_plans table.
        
        Returns:
            Razorpay plan ID string.
        
        Raises:
            PricingConfigurationError: If no plan ID exists for current environment.
        """
        env = self.env
        env_column = f"razorpay_plan_id_{env}"
        
        # Primary: use environment-specific column
        plan_id = plan_row.get(env_column)
        
        # Fallback: legacy column (for backwards compatibility during migration)
        if not plan_id:
            if env == 'sandbox':
                plan_id = plan_row.get('razorpay_plan_id')
            # For production: NEVER fall back to legacy — must be explicitly set
        
        if not plan_id:
            domain = plan_row.get('product_domain', '?')
            slug = plan_row.get('plan_slug', '?')
            raise PricingConfigurationError(
                f"No {env} Razorpay plan ID configured for {domain}/{slug}. "
                f"Expected column '{env_column}' to be set in pricing_plans table. "
                f"{'Run seed script with live plan IDs.' if env == 'production' else ''}"
            )
        
        return plan_id
    
    def _transform_plan(self, plan_row: dict) -> dict:
        """
        Transform a raw DB row into the consumer-facing plan dict.
        
        Resolves razorpay_plan_id to the correct environment automatically.
        Consumers see only 'razorpay_plan_id' — they don't know about environments.
        """
        plan = dict(plan_row)
        plan['razorpay_plan_id'] = self._resolve_plan_id(plan_row)
        return plan
    
    def get_plan(
        self,
        product_domain: str,
        plan_slug: str,
        billing_cycle: str = 'monthly',
    ) -> dict:
        """
        Get a specific plan's full pricing data.
        
        Args:
            product_domain: 'shop', 'dashboard', 'marketing', 'api', etc.
            plan_slug: 'starter', 'business', 'pro', 'growth'
            billing_cycle: 'monthly', 'yearly' (default: 'monthly')
        
        Returns:
            Dict with all pricing fields + resolved razorpay_plan_id
        
        Raises:
            PricingNotFoundError: Plan doesn't exist
            PricingConfigurationError: Plan exists but no Razorpay plan ID for env
        """
        # Check cache first
        cached = self._cache.get(self.env, product_domain, plan_slug, billing_cycle)
        if cached is not None:
            return cached
        
        # Query database
        try:
            result = self.supabase.table('pricing_plans').select('*').match({
                'product_domain': product_domain,
                'plan_slug': plan_slug,
                'billing_cycle': billing_cycle,
                'is_active': True,
            }).is_('effective_to', 'null').order(
                'pricing_version', desc=True
            ).limit(1).execute()
        except Exception as e:
            logger.error(f"Database error fetching plan {product_domain}/{plan_slug}: {e}")
            raise PricingConfigurationError(f"Failed to fetch pricing: {e}")
        
        if not result.data:
            raise PricingNotFoundError(
                f"Plan '{plan_slug}' not found for domain '{product_domain}' "
                f"(cycle={billing_cycle})"
            )
        
        plan = self._transform_plan(result.data[0])
        
        # Cache the resolved result
        self._cache.set(plan, self.env, product_domain, plan_slug, billing_cycle)
        
        logger.debug(
            f"Pricing resolved: {product_domain}/{plan_slug} → "
            f"₹{plan['amount_paise']/100:,.0f} (env={self.env})"
        )
        
        return plan
    
    def get_all_plans(
        self,
        product_domain: str,
        billing_cycle: str = 'monthly',
    ) -> List[dict]:
        """
        Get all active plans for a domain.
        
        Args:
            product_domain: Product domain to filter by
            billing_cycle: Billing cycle filter (default: 'monthly')
        
        Returns:
            List of plan dicts with resolved razorpay_plan_id
        """
        # Check cache
        cache_key_slug = f"_all_{billing_cycle}"
        cached = self._cache.get(self.env, product_domain, cache_key_slug)
        if cached is not None:
            return cached
        
        try:
            result = self.supabase.table('pricing_plans').select('*').match({
                'product_domain': product_domain,
                'billing_cycle': billing_cycle,
                'is_active': True,
            }).is_('effective_to', 'null').order('amount_paise').execute()
        except Exception as e:
            logger.error(f"Database error fetching plans for {product_domain}: {e}")
            raise PricingConfigurationError(f"Failed to fetch pricing: {e}")
        
        plans = []
        for row in (result.data or []):
            try:
                plans.append(self._transform_plan(row))
            except PricingConfigurationError as e:
                # Log but skip plans without valid env plan IDs
                # (allows partial display even if some plans aren't configured)
                logger.warning(f"Skipping plan in listing: {e}")
        
        # Cache the list
        self._cache.set(plans, self.env, product_domain, cache_key_slug)
        
        return plans
    
    def get_plan_by_id(self, pricing_plan_id: str) -> dict:
        """
        Get a plan by its UUID (pricing_plans.id).
        
        Used by plan_change_service when looking up by pending_pricing_plan_id.
        
        Args:
            pricing_plan_id: UUID of the pricing_plans row
        
        Returns:
            Dict with resolved razorpay_plan_id
        
        Raises:
            PricingNotFoundError: Plan UUID not found
            PricingConfigurationError: Plan exists but missing env plan ID
        """
        try:
            result = self.supabase.table('pricing_plans').select(
                '*'
            ).eq('id', pricing_plan_id).limit(1).execute()
        except Exception as e:
            logger.error(f"Database error fetching plan {pricing_plan_id}: {e}")
            raise PricingConfigurationError(f"Failed to fetch pricing: {e}")
        
        if not result.data:
            raise PricingNotFoundError(
                f"Pricing plan with ID '{pricing_plan_id}' not found"
            )
        
        return self._transform_plan(result.data[0])
    
    def get_cache_stats(self) -> dict:
        """Return cache statistics for admin/monitoring."""
        return {
            **self._cache.stats(),
            'environment': self.env,
        }


# =============================================================================
# STARTUP VERIFICATION
# =============================================================================

def verify_pricing_for_environment(env: str = None) -> List[str]:
    """
    Verify that all active pricing plans have Razorpay plan IDs
    configured for the specified environment.
    
    Args:
        env: "sandbox" or "production". If None, auto-detects.
    
    Returns:
        List of plan identifiers (domain/slug) that are missing
        an env-specific Razorpay plan ID. Empty list = all good.
    """
    if env is None:
        from services.environment import get_razorpay_environment
        env = get_razorpay_environment()
    
    env_column = f"razorpay_plan_id_{env}"
    
    try:
        from supabase_client import get_supabase_client
        supabase = get_supabase_client()
        
        result = supabase.table('pricing_plans').select(
            'product_domain, plan_slug, billing_cycle, '
            'razorpay_plan_id_sandbox, razorpay_plan_id_production, '
            'razorpay_plan_id'
        ).eq('is_active', True).is_('effective_to', 'null').execute()
        
        missing = []
        for row in (result.data or []):
            plan_id = row.get(env_column)
            
            # Fallback for sandbox: check legacy column
            if not plan_id and env == 'sandbox':
                plan_id = row.get('razorpay_plan_id')
            
            if not plan_id:
                identifier = f"{row['product_domain']}/{row['plan_slug']}"
                missing.append(identifier)
        
        if missing:
            logger.warning(
                f"⚠️ {len(missing)} plans missing {env} Razorpay IDs: "
                f"{', '.join(missing)}"
            )
        else:
            logger.info(f"✅ All active plans have {env} Razorpay plan IDs configured")
        
        return missing
        
    except Exception as e:
        logger.error(f"Failed to verify pricing for {env}: {e}")
        return [f"VERIFICATION_FAILED: {e}"]


# =============================================================================
# MODULE SINGLETON & PUBLIC API
# =============================================================================

_pricing_service: Optional[PricingService] = None


def get_pricing_service() -> PricingService:
    """Get the singleton PricingService instance."""
    global _pricing_service
    if _pricing_service is None:
        cache_ttl = int(os.getenv('PRICING_CACHE_TTL', '300'))
        _pricing_service = PricingService(cache_ttl=cache_ttl)
        logger.info(f"✅ PricingService initialized (cache_ttl={cache_ttl}s)")
    return _pricing_service


def invalidate_cache() -> int:
    """Invalidate the pricing cache. Returns number of keys cleared."""
    service = get_pricing_service()
    count = service._cache.invalidate_all()
    logger.info(f"🗑️ Pricing cache invalidated ({count} keys)")
    return count
