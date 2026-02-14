"""
Razorpay Environment Detection — Zero-Config Safety Layer
============================================================
Auto-detects sandbox vs production from RAZORPAY_KEY_ID prefix.

Rules:
    rzp_test_* → "sandbox"
    rzp_live_* → "production"
    anything else → EnvironmentConfigurationError (fail fast)

No manual ENV flags. The Razorpay key prefix is the SOLE source of truth.

Usage:
    from services.environment import get_razorpay_environment, is_production
    env = get_razorpay_environment()  # "sandbox" or "production"
"""

import os
import logging
from functools import lru_cache
from typing import Literal

logger = logging.getLogger('reviseit.environment')

RazorpayEnvironment = Literal["sandbox", "production"]

# Razorpay key prefix → environment mapping
_KEY_PREFIX_MAP = {
    "rzp_test_": "sandbox",
    "rzp_live_": "production",
}


class EnvironmentConfigurationError(Exception):
    """Raised when the Razorpay environment cannot be determined.
    
    This is a FATAL error — the application must not start if
    it cannot determine which environment it's running in.
    """
    pass


def detect_environment(key_id: str = None) -> RazorpayEnvironment:
    """
    Detect Razorpay environment from key prefix.
    
    Args:
        key_id: Optional explicit key ID. If None, reads from RAZORPAY_KEY_ID env var.
    
    Returns:
        "sandbox" or "production"
    
    Raises:
        EnvironmentConfigurationError: If key is missing or prefix unrecognizable.
    """
    if key_id is None:
        key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    
    if not key_id:
        raise EnvironmentConfigurationError(
            "RAZORPAY_KEY_ID environment variable is not set. "
            "Cannot determine sandbox/production environment. "
            "Set RAZORPAY_KEY_ID=rzp_test_XXXX for sandbox or "
            "RAZORPAY_KEY_ID=rzp_live_XXXX for production."
        )
    
    for prefix, env in _KEY_PREFIX_MAP.items():
        if key_id.startswith(prefix):
            return env
    
    raise EnvironmentConfigurationError(
        f"RAZORPAY_KEY_ID has unrecognizable prefix: '{key_id[:12]}...'. "
        f"Expected prefix: 'rzp_test_' (sandbox) or 'rzp_live_' (production). "
        f"Cannot safely proceed without knowing the environment."
    )


@lru_cache(maxsize=1)
def get_razorpay_environment() -> RazorpayEnvironment:
    """
    Get and cache the detected Razorpay environment.
    
    Called once at startup, cached forever (environment doesn't change at runtime).
    
    Returns:
        "sandbox" or "production"
    """
    env = detect_environment()
    logger.info(f"🔐 Razorpay environment detected: {env.upper()}")
    return env


def is_production() -> bool:
    """Check if running in production (live Razorpay keys)."""
    return get_razorpay_environment() == "production"


def is_sandbox() -> bool:
    """Check if running in sandbox (test Razorpay keys)."""
    return get_razorpay_environment() == "sandbox"


def get_plan_id_column() -> str:
    """
    Get the correct pricing_plans column name for the current environment.
    
    Returns:
        "razorpay_plan_id_sandbox" or "razorpay_plan_id_production"
    """
    env = get_razorpay_environment()
    return f"razorpay_plan_id_{env}"


def validate_environment() -> RazorpayEnvironment:
    """
    Validate environment on application startup.
    
    Call this during app initialization. It will:
    1. Detect environment from RAZORPAY_KEY_ID
    2. Log the detected environment
    3. Return the environment name
    4. Raise EnvironmentConfigurationError if misconfigured
    
    Returns:
        "sandbox" or "production"
    
    Raises:
        EnvironmentConfigurationError: If RAZORPAY_KEY_ID is missing or invalid.
    """
    env = get_razorpay_environment()
    
    # Cross-validate with RAZORPAY_KEY_SECRET if present
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if key_secret:
        # Razorpay secrets don't have test/live prefix, so we just verify it exists
        logger.info(f"✅ RAZORPAY_KEY_SECRET is set ({len(key_secret)} chars)")
    else:
        logger.warning("⚠️ RAZORPAY_KEY_SECRET is not set — Razorpay API calls will fail")
    
    return env
