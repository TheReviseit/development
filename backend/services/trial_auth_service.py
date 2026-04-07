"""
Trial-Enabled Console Auth Service
==================================

Extends ConsoleAuthService with automatic trial management.

Key Integration Points:
1. After successful shop signup → auto-start 7-day trial
2. After shop login → check trial status and inject context
3. Trial conversion tracking on upgrade

Usage:
    service = TrialConsoleAuthService(supabase_client)
    result = await service.signup_with_trial(
        email=email,
        password=password,
        name=name,
        signup_domain='shop',  # This triggers trial
        ip_address=ip,
    )
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple

from .console_auth_service import (
    ConsoleAuthService,
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    generate_verification_token,
)

logger = logging.getLogger('reviseit.trial_auth')


class TrialConsoleAuthService(ConsoleAuthService):
    """
    Extended auth service with trial management for shop domain.

    On signup with domain='shop':
    1. Create user and organization (inherited)
    2. Automatically start 7-day free trial for Starter Plan
    3. Return trial context in response
    """

    TRIAL_DOMAINS = frozenset({'shop'})  # Domains with trial eligibility

    async def signup_with_trial(
        self,
        email: str,
        password: str,
        name: Optional[str] = None,
        ip_address: Optional[str] = None,
        signup_domain: Optional[str] = None,
        device_fingerprint: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Signup with automatic trial start for eligible domains.

        Args:
            email: User email
            password: User password
            name: User display name
            ip_address: Client IP for abuse detection
            signup_domain: Product domain (shop, marketing, etc.)
            device_fingerprint: Browser/device fingerprint
            user_agent: Browser user agent

        Returns:
            Extended signup response with trial context
        """
        # Call parent signup (creates user, org, etc.)
        result = await self.signup(
            email=email,
            password=password,
            name=name,
            ip_address=ip_address,
            signup_domain=signup_domain,
        )

        if not result.get('success'):
            return result

        user_id = result['user']['id']
        org_id = result['org']['id']
        user_email = result['user']['email']

        # Auto-start trial for eligible domains
        trial_context = None
        if signup_domain in self.TRIAL_DOMAINS:
            trial_context = await self._start_shop_trial(
                user_id=user_id,
                org_id=org_id,
                email=user_email,
                ip_address=ip_address,
                device_fingerprint=device_fingerprint,
                user_agent=user_agent,
            )

            if trial_context:
                result['trial'] = trial_context
                logger.info(
                    f"shop_trial_started user_id={user_id} org_id={org_id} "
                    f"trial_id={trial_context.get('trial_id')}"
                )
            else:
                # Trial start failed, but signup succeeded
                logger.warning(
                    f"shop_trial_start_failed user_id={user_id} "
                    f"- continuing without trial"
                )

        return result

    async def _start_shop_trial(
        self,
        user_id: str,
        org_id: str,
        email: str,
        ip_address: Optional[str],
        device_fingerprint: Optional[str],
        user_agent: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Start a 7-day Starter Plan trial for shop domain.

        Args:
            user_id: User UUID
            org_id: Organization UUID
            email: User email
            ip_address: Client IP
            device_fingerprint: Browser fingerprint
            user_agent: User agent string

        Returns:
            Trial context dict or None if failed
        """
        try:
            from services.trial_engine import (
                TrialEngine,
                TrialStartOptions,
                TrialSource,
            )
            from services.pricing_service import get_pricing_service

            # Get Starter Plan ID
            pricing = get_pricing_service()
            try:
                plan = pricing.get_plan('shop', 'starter', 'monthly')
                plan_id = plan['id']
            except Exception as e:
                logger.error(f"Failed to get starter plan: {e}")
                return None

            # Extract email domain
            email_domain = email.split('@')[1] if '@' in email else None

            # Create trial engine
            engine = TrialEngine(supabase_client=self.db)

            # Start options
            options = TrialStartOptions(
                user_id=user_id,
                org_id=org_id,
                plan_slug='starter',
                plan_id=plan_id,
                domain='shop',
                trial_days=7,
                source=TrialSource.SHOP,
                ip_address=ip_address,
                email_domain=email_domain,
                device_fingerprint=device_fingerprint,
                user_agent=user_agent,
            )

            # Start trial
            trial_context = await engine.start_trial(options)
            return trial_context.to_dict()

        except Exception as e:
            logger.error(f"_start_shop_trial error: {e}", exc_info=True)
            return None

    async def get_trial_status_for_user(
        self,
        user_id: str,
        org_id: str,
    ) -> Dict[str, Any]:
        """
        Get trial status for authenticated user.

        Used during login to inject trial context.
        """
        try:
            from services.trial_engine import get_trial_engine

            engine = get_trial_engine()
            entitlement = await engine.check_entitlement(
                user_id=user_id,
                org_id=org_id,
                domain='shop',
            )
            return entitlement

        except Exception as e:
            logger.error(f"get_trial_status_for_user error: {e}")
            return {
                'has_trial_access': False,
                'access_level': 'none',
                'trial_status': None,
            }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_trial_auth_service() -> TrialConsoleAuthService:
    """Get TrialConsoleAuthService instance."""
    from supabase_client import get_supabase_client
    db = get_supabase_client()
    return TrialConsoleAuthService(supabase_client=db)


async def auto_start_trial_on_signup(
    user_id: str,
    org_id: str,
    email: str,
    domain: str,
    ip_address: Optional[str] = None,
    device_fingerprint: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Standalone function to auto-start trial after signup.

    Called by webhook or after successful signup.

    Args:
        user_id: New user UUID
        org_id: Organization UUID
        email: User email
        domain: Signup domain (shop, etc.)
        ip_address: Client IP
        device_fingerprint: Browser fingerprint
        user_agent: User agent

    Returns:
        Trial context dict or None
    """
    if domain not in {'shop'}:
        return None

    try:
        from services.trial_engine import (
            get_trial_engine,
            TrialStartOptions,
            TrialSource,
        )
        from services.pricing_service import get_pricing_service

        pricing = get_pricing_service()
        plan = pricing.get_plan('shop', 'starter', 'monthly')

        engine = get_trial_engine()

        options = TrialStartOptions(
            user_id=user_id,
            org_id=org_id,
            plan_slug='starter',
            plan_id=plan['id'],
            domain='shop',
            trial_days=7,
            source=TrialSource.ORGANIC if domain != 'shop' else TrialSource.SHOP,
            ip_address=ip_address,
            email_domain=email.split('@')[1] if '@' in email else None,
            device_fingerprint=device_fingerprint,
            user_agent=user_agent,
        )

        trial_context = await engine.start_trial(options)
        return trial_context.to_dict()

    except Exception as e:
        logger.error(f"auto_start_trial_on_signup error: {e}", exc_info=True)
        return None
