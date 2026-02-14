"""
Environment Isolation Tests — Razorpay Sandbox/Production Safety
=================================================================
Tests for environment detection, plan ID resolution, cache isolation,
and startup validation.

Run: python -m pytest tests/test_environment_isolation.py -v
"""

import pytest
from unittest.mock import patch, MagicMock
import os


# =============================================================================
# ENVIRONMENT DETECTION TESTS
# =============================================================================

class TestEnvironmentDetection:
    """Tests for services.environment module."""

    def test_detect_sandbox_from_test_key(self):
        """rzp_test_XXXX key should detect as 'sandbox'."""
        from services.environment import detect_environment
        assert detect_environment('rzp_test_abc123') == 'sandbox'

    def test_detect_production_from_live_key(self):
        """rzp_live_XXXX key should detect as 'production'."""
        from services.environment import detect_environment
        assert detect_environment('rzp_live_abc123') == 'production'

    def test_detect_invalid_key_raises(self):
        """Unrecognizable key prefix should raise EnvironmentConfigurationError."""
        from services.environment import detect_environment, EnvironmentConfigurationError
        with pytest.raises(EnvironmentConfigurationError, match="unrecognizable prefix"):
            detect_environment('invalid_key_123')

    def test_detect_missing_key_raises(self):
        """Empty/missing key should raise EnvironmentConfigurationError."""
        from services.environment import detect_environment, EnvironmentConfigurationError
        with pytest.raises(EnvironmentConfigurationError, match="not set"):
            detect_environment('')

    def test_detect_none_key_reads_env(self):
        """None key should fall back to RAZORPAY_KEY_ID env var."""
        from services.environment import detect_environment
        with patch.dict(os.environ, {'RAZORPAY_KEY_ID': 'rzp_test_fallback'}):
            assert detect_environment(None) == 'sandbox'

    def test_detect_none_key_missing_env_raises(self):
        """None key with no env var should raise."""
        from services.environment import detect_environment, EnvironmentConfigurationError
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop('RAZORPAY_KEY_ID', None)
            with pytest.raises(EnvironmentConfigurationError):
                detect_environment(None)

    def test_is_production_true(self):
        """is_production() should return True for live keys."""
        from services.environment import is_production, get_razorpay_environment
        get_razorpay_environment.cache_clear()
        with patch.dict(os.environ, {'RAZORPAY_KEY_ID': 'rzp_live_prod123'}):
            assert is_production() is True
        get_razorpay_environment.cache_clear()

    def test_is_sandbox_true(self):
        """is_sandbox() should return True for test keys."""
        from services.environment import is_sandbox, get_razorpay_environment
        get_razorpay_environment.cache_clear()
        with patch.dict(os.environ, {'RAZORPAY_KEY_ID': 'rzp_test_test123'}):
            assert is_sandbox() is True
        get_razorpay_environment.cache_clear()

    def test_get_plan_id_column_sandbox(self):
        """Should return 'razorpay_plan_id_sandbox' in sandbox mode."""
        from services.environment import get_plan_id_column, get_razorpay_environment
        get_razorpay_environment.cache_clear()
        with patch.dict(os.environ, {'RAZORPAY_KEY_ID': 'rzp_test_xxx'}):
            assert get_plan_id_column() == 'razorpay_plan_id_sandbox'
        get_razorpay_environment.cache_clear()

    def test_get_plan_id_column_production(self):
        """Should return 'razorpay_plan_id_production' in production mode."""
        from services.environment import get_plan_id_column, get_razorpay_environment
        get_razorpay_environment.cache_clear()
        with patch.dict(os.environ, {'RAZORPAY_KEY_ID': 'rzp_live_xxx'}):
            assert get_plan_id_column() == 'razorpay_plan_id_production'
        get_razorpay_environment.cache_clear()


# =============================================================================
# PLAN ID RESOLUTION TESTS
# =============================================================================

class TestPlanIdResolution:
    """Tests for PricingService plan ID resolution."""

    def _make_plan_row(self, sandbox_id='plan_test_123', production_id='plan_live_456', legacy_id='plan_test_123'):
        """Helper to create a mock plan row."""
        return {
            'id': 'uuid-123',
            'product_domain': 'shop',
            'plan_slug': 'starter',
            'billing_cycle': 'monthly',
            'amount_paise': 199900,
            'currency': 'INR',
            'razorpay_plan_id': legacy_id,
            'razorpay_plan_id_sandbox': sandbox_id,
            'razorpay_plan_id_production': production_id,
            'display_name': 'Starter',
            'pricing_version': 1,
            'is_active': True,
        }

    def test_resolve_sandbox_plan_id(self):
        """In sandbox mode, should resolve to razorpay_plan_id_sandbox."""
        from services.pricing_service import PricingService
        service = PricingService()
        service._env = 'sandbox'
        
        row = self._make_plan_row()
        result = service._resolve_plan_id(row)
        assert result == 'plan_test_123'

    def test_resolve_production_plan_id(self):
        """In production mode, should resolve to razorpay_plan_id_production."""
        from services.pricing_service import PricingService
        service = PricingService()
        service._env = 'production'
        
        row = self._make_plan_row()
        result = service._resolve_plan_id(row)
        assert result == 'plan_live_456'

    def test_resolve_missing_production_id_raises(self):
        """Missing production plan ID should raise PricingConfigurationError."""
        from services.pricing_service import PricingService, PricingConfigurationError
        service = PricingService()
        service._env = 'production'
        
        row = self._make_plan_row(production_id=None)
        with pytest.raises(PricingConfigurationError, match="production"):
            service._resolve_plan_id(row)

    def test_resolve_sandbox_fallback_to_legacy(self):
        """In sandbox, if sandbox column is empty, fall back to legacy column."""
        from services.pricing_service import PricingService
        service = PricingService()
        service._env = 'sandbox'
        
        row = self._make_plan_row(sandbox_id=None, legacy_id='plan_legacy_789')
        result = service._resolve_plan_id(row)
        assert result == 'plan_legacy_789'

    def test_resolve_production_no_fallback_to_legacy(self):
        """In production, NEVER fall back to legacy column."""
        from services.pricing_service import PricingService, PricingConfigurationError
        service = PricingService()
        service._env = 'production'
        
        row = self._make_plan_row(production_id=None, legacy_id='plan_legacy_789')
        with pytest.raises(PricingConfigurationError):
            service._resolve_plan_id(row)

    def test_transform_plan_includes_resolved_id(self):
        """_transform_plan should include resolved razorpay_plan_id."""
        from services.pricing_service import PricingService
        service = PricingService()
        service._env = 'sandbox'
        
        row = self._make_plan_row()
        result = service._transform_plan(row)
        assert result['razorpay_plan_id'] == 'plan_test_123'


# =============================================================================
# CACHE ISOLATION TESTS
# =============================================================================

class TestCacheIsolation:
    """Tests for environment-scoped cache keys."""

    def test_cache_key_includes_environment(self):
        """Cache keys must include the environment."""
        from services.pricing_service import PricingCache
        cache = PricingCache()
        
        key = cache._make_key('sandbox', 'shop', 'starter', 'monthly')
        assert 'sandbox' in key
        assert 'shop' in key
        assert 'starter' in key

    def test_cache_sandbox_and_production_are_separate(self):
        """Same plan should have different cache entries for sandbox vs production."""
        from services.pricing_service import PricingCache
        cache = PricingCache()
        
        # Set sandbox value
        cache.set({'id': 'test_123'}, 'sandbox', 'shop', 'starter', 'monthly')
        # Set production value
        cache.set({'id': 'live_456'}, 'production', 'shop', 'starter', 'monthly')
        
        # Retrieve should be isolated
        sandbox_val = cache.get('sandbox', 'shop', 'starter', 'monthly')
        prod_val = cache.get('production', 'shop', 'starter', 'monthly')
        
        assert sandbox_val['id'] == 'test_123'
        assert prod_val['id'] == 'live_456'

    def test_cache_invalidation_clears_all(self):
        """invalidate_all should clear both environments."""
        from services.pricing_service import PricingCache
        cache = PricingCache()
        
        cache.set({'id': 'test'}, 'sandbox', 'shop', 'starter')
        cache.set({'id': 'live'}, 'production', 'shop', 'starter')
        
        count = cache.invalidate_all()
        assert count == 2
        assert cache.get('sandbox', 'shop', 'starter') is None
        assert cache.get('production', 'shop', 'starter') is None

    def test_cache_stats(self):
        """Cache stats should track hits and misses."""
        from services.pricing_service import PricingCache
        cache = PricingCache()
        
        # Miss
        cache.get('sandbox', 'shop', 'starter')
        # Set + Hit
        cache.set({'id': 'test'}, 'sandbox', 'shop', 'starter')
        cache.get('sandbox', 'shop', 'starter')
        
        stats = cache.stats()
        assert stats['hits'] == 1
        assert stats['misses'] == 1
        assert stats['size'] == 1


# =============================================================================
# STARTUP VERIFICATION TESTS
# =============================================================================

class TestStartupVerification:
    """Tests for verify_pricing_for_environment."""

    @patch('services.pricing_service.get_supabase_client')
    def test_all_plans_configured_returns_empty(self, mock_get_client):
        """When all plans have env-specific IDs, return empty list."""
        from services.pricing_service import verify_pricing_for_environment
        
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().select().eq().is_().execute.return_value = MagicMock(
            data=[
                {
                    'product_domain': 'shop',
                    'plan_slug': 'starter',
                    'razorpay_plan_id_sandbox': 'plan_test_123',
                    'razorpay_plan_id_production': 'plan_live_456',
                    'razorpay_plan_id': 'plan_test_123',
                },
            ]
        )
        
        missing = verify_pricing_for_environment('production')
        assert missing == []

    @patch('services.pricing_service.get_supabase_client')
    def test_missing_production_ids_detected(self, mock_get_client):
        """Plans missing production IDs should be reported."""
        from services.pricing_service import verify_pricing_for_environment
        
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().select().eq().is_().execute.return_value = MagicMock(
            data=[
                {
                    'product_domain': 'shop',
                    'plan_slug': 'starter',
                    'razorpay_plan_id_sandbox': 'plan_test_123',
                    'razorpay_plan_id_production': None,
                    'razorpay_plan_id': 'plan_test_123',
                },
            ]
        )
        
        missing = verify_pricing_for_environment('production')
        assert 'shop/starter' in missing

    @patch('services.pricing_service.get_supabase_client')
    def test_sandbox_falls_back_to_legacy(self, mock_get_client):
        """Sandbox env should fall back to legacy razorpay_plan_id column."""
        from services.pricing_service import verify_pricing_for_environment
        
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table().select().eq().is_().execute.return_value = MagicMock(
            data=[
                {
                    'product_domain': 'shop',
                    'plan_slug': 'starter',
                    'razorpay_plan_id_sandbox': None,
                    'razorpay_plan_id_production': None,
                    'razorpay_plan_id': 'plan_legacy_123',
                },
            ]
        )
        
        missing = verify_pricing_for_environment('sandbox')
        # Should NOT be missing — legacy fallback should cover it
        assert missing == []


# =============================================================================
# PRODUCTS CONFIG TESTS
# =============================================================================

class TestProductsConfig:
    """Tests for updated PricingTier with dual plan IDs."""

    def test_pricing_tier_has_sandbox_field(self):
        """PricingTier should have razorpay_plan_id_sandbox field."""
        from config.products import PRODUCT_REGISTRY
        shop = PRODUCT_REGISTRY.get('shop')
        assert shop is not None
        for tier in shop.pricing:
            assert hasattr(tier, 'razorpay_plan_id_sandbox')

    def test_pricing_tier_has_production_field(self):
        """PricingTier should have razorpay_plan_id_production field."""
        from config.products import PRODUCT_REGISTRY
        shop = PRODUCT_REGISTRY.get('shop')
        assert shop is not None
        for tier in shop.pricing:
            assert hasattr(tier, 'razorpay_plan_id_production')

    def test_pricing_tier_backward_compat_property(self):
        """PricingTier.razorpay_plan_id property should resolve for current env."""
        from config.products import PRODUCT_REGISTRY
        shop = PRODUCT_REGISTRY.get('shop')
        assert shop is not None
        # Should not raise — backward-compat property should work
        for tier in shop.pricing:
            plan_id = tier.razorpay_plan_id
            assert isinstance(plan_id, str)
