"""
OAuth Token Lifecycle Manager
==============================

Manages the full lifecycle of Meta platform access tokens:

    1. Exchange: Short-lived code → short-lived token → long-lived token
    2. Refresh: Auto-refresh 7 days before expiry (Celery Beat)
    3. Revoke: Clean disconnect of channel connections
    4. Audit: All token events logged to token_lifecycle_events table

Instagram Token Flow:
    Authorization Code (via OAuth dialog)
    → Short-lived User Token (1 hour)
    → Long-lived User Token (60 days)
    → Auto-refresh before expiry

WhatsApp follows a similar pattern but uses System User tokens
which don't expire (managed differently).

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import requests

from .circuit_breaker import CircuitBreakerRegistry, with_circuit_breaker

logger = logging.getLogger('flowauxi.messaging.token_manager')

# =========================================================================
# Configuration
# =========================================================================

META_APP_ID = os.getenv('META_APP_ID', os.getenv('FACEBOOK_APP_ID', ''))
META_APP_SECRET = os.getenv('META_APP_SECRET', os.getenv('APP_SECRET', ''))
META_GRAPH_URL = "https://graph.facebook.com/v21.0"
TOKEN_REFRESH_DAYS_BEFORE = 7  # Refresh 7 days before expiry
REQUEST_TIMEOUT = 15


class TokenManager:
    """
    Manages OAuth token lifecycle for all Meta platform channels.

    Features:
        - Short-lived → long-lived token exchange
        - Automatic refresh 7 days before expiry
        - Token revocation on disconnect
        - Full audit trail in token_lifecycle_events
        - Circuit breaker on Meta OAuth endpoint

    Usage:
        mgr = get_token_manager()

        # Exchange OAuth code for tokens
        result = mgr.exchange_code(
            code="AQ...",
            redirect_uri="https://app.flowauxi.com/callback",
        )

        # Refresh a connection's token
        mgr.refresh_token(channel_connection_id="uuid-here")

        # Bulk refresh (Celery Beat, daily)
        mgr.refresh_expiring_tokens()
    """

    def __init__(self, supabase_client=None):
        self._db = supabase_client
        self._session = requests.Session()

    # =====================================================================
    # Token Exchange — OAuth Code → Access Token
    # =====================================================================

    @with_circuit_breaker('meta_oauth')
    def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> Dict[str, Any]:
        """
        Exchange an OAuth authorization code for a short-lived token,
        then exchange that for a long-lived token (60 days).

        Args:
            code: Authorization code from OAuth redirect
            redirect_uri: The redirect URI used in the OAuth flow

        Returns:
            {
                "access_token": "...",
                "token_type": "bearer",
                "expires_in": 5184000,  # 60 days
            }
        """
        # Step 1: Code → short-lived token
        short_lived = self._exchange_code_for_token(code, redirect_uri)
        if not short_lived.get('access_token'):
            raise TokenError(
                f"Failed to exchange code: {short_lived.get('error', {})}"
            )

        # Step 2: Short-lived → long-lived token
        long_lived = self._exchange_for_long_lived(
            short_lived['access_token']
        )
        if not long_lived.get('access_token'):
            # Fall back to short-lived if exchange fails
            logger.warning("token_long_lived_exchange_failed — using short-lived")
            return short_lived

        return long_lived

    def _exchange_code_for_token(
        self, code: str, redirect_uri: str,
    ) -> Dict[str, Any]:
        """Exchange OAuth code for short-lived access token."""
        response = self._session.get(
            f"{META_GRAPH_URL}/oauth/access_token",
            params={
                'client_id': META_APP_ID,
                'client_secret': META_APP_SECRET,
                'redirect_uri': redirect_uri,
                'code': code,
            },
            timeout=REQUEST_TIMEOUT,
        )

        if response.status_code != 200:
            error = response.json().get('error', {})
            logger.error(
                f"token_code_exchange_failed "
                f"status={response.status_code} "
                f"error={error.get('message', 'Unknown')}"
            )
            return {'error': error}

        return response.json()

    @with_circuit_breaker('meta_oauth')
    def _exchange_for_long_lived(
        self, short_lived_token: str,
    ) -> Dict[str, Any]:
        """Exchange short-lived token for long-lived (60 days)."""
        response = self._session.get(
            f"{META_GRAPH_URL}/oauth/access_token",
            params={
                'grant_type': 'fb_exchange_token',
                'client_id': META_APP_ID,
                'client_secret': META_APP_SECRET,
                'fb_exchange_token': short_lived_token,
            },
            timeout=REQUEST_TIMEOUT,
        )

        if response.status_code != 200:
            error = response.json().get('error', {})
            logger.error(f"token_long_lived_exchange_failed: {error}")
            return {'error': error}

        data = response.json()
        logger.info(
            f"token_exchanged type=long_lived "
            f"expires_in={data.get('expires_in', 'N/A')}s"
        )
        return data

    # =====================================================================
    # Token Refresh — Auto-refresh before expiry
    # =====================================================================

    @with_circuit_breaker('meta_oauth')
    def refresh_token(
        self, channel_connection_id: str,
    ) -> Dict[str, Any]:
        """
        Refresh a single channel connection's token.

        Long-lived tokens can be refreshed to get a NEW 60-day token,
        as long as the current token hasn't expired yet.

        Args:
            channel_connection_id: UUID of the channel_connections row

        Returns:
            {"success": bool, "new_expires_at": datetime | None}
        """
        if not self._db:
            return {"success": False, "error": "No database connection"}

        # Get current connection
        result = self._db.table('channel_connections').select(
            'id, user_id, channel, access_token, token_expires_at, '
            'channel_account_id'
        ).eq('id', channel_connection_id).single().execute()

        if not result.data:
            return {"success": False, "error": "Connection not found"}

        conn = result.data
        old_token = conn.get('access_token')
        old_expires = conn.get('token_expires_at')

        if not old_token:
            return {"success": False, "error": "No token to refresh"}

        # Exchange current long-lived for new long-lived
        new_token_data = self._exchange_for_long_lived(old_token)

        if not new_token_data.get('access_token'):
            self._log_lifecycle_event(
                channel_connection_id,
                'refresh_failed',
                old_expires_at=old_expires,
                error=str(new_token_data.get('error', 'Unknown')),
            )
            return {
                "success": False,
                "error": new_token_data.get('error', 'Token refresh failed'),
            }

        # Calculate new expiry
        expires_in = new_token_data.get('expires_in', 5184000)  # 60 days
        new_expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        ).isoformat()

        # Update connection
        self._db.table('channel_connections').update({
            'access_token': new_token_data['access_token'],
            'token_expires_at': new_expires_at,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', channel_connection_id).execute()

        # Log lifecycle event
        self._log_lifecycle_event(
            channel_connection_id,
            'refreshed',
            old_expires_at=old_expires,
            new_expires_at=new_expires_at,
        )

        logger.info(
            f"token_refreshed connection={channel_connection_id[:15]} "
            f"new_expires_at={new_expires_at}"
        )

        return {
            "success": True,
            "new_expires_at": new_expires_at,
        }

    def refresh_expiring_tokens(self) -> Dict[str, int]:
        """
        Refresh ALL tokens expiring within TOKEN_REFRESH_DAYS_BEFORE days.

        Called by Celery Beat daily at 4 AM UTC.

        Returns:
            {"checked": N, "refreshed": N, "failed": N}
        """
        if not self._db:
            return {"checked": 0, "refreshed": 0, "failed": 0}

        stats = {"checked": 0, "refreshed": 0, "failed": 0}

        threshold = (
            datetime.now(timezone.utc) +
            timedelta(days=TOKEN_REFRESH_DAYS_BEFORE)
        ).isoformat()

        # Find connections expiring within threshold
        result = self._db.table('channel_connections').select(
            'id, channel, channel_account_id, token_expires_at'
        ).eq('is_active', True).lt(
            'token_expires_at', threshold
        ).execute()

        if not result.data:
            logger.info("token_refresh_check: no tokens expiring soon")
            return stats

        for conn in result.data:
            stats["checked"] += 1
            try:
                refresh_result = self.refresh_token(conn['id'])
                if refresh_result.get('success'):
                    stats["refreshed"] += 1
                else:
                    stats["failed"] += 1
                    logger.warning(
                        f"token_refresh_failed connection={conn['id'][:15]} "
                        f"error={refresh_result.get('error')}"
                    )
            except Exception as e:
                stats["failed"] += 1
                logger.error(
                    f"token_refresh_exception connection={conn['id'][:15]}: {e}"
                )

        logger.info(
            f"token_refresh_cycle "
            f"checked={stats['checked']} "
            f"refreshed={stats['refreshed']} "
            f"failed={stats['failed']}"
        )
        return stats

    # =====================================================================
    # Token Revocation — Disconnect
    # =====================================================================

    def revoke_token(
        self, channel_connection_id: str,
    ) -> Dict[str, Any]:
        """
        Revoke a token and mark the connection as disconnected.

        Called when a business disconnects their Instagram/WhatsApp account.
        """
        if not self._db:
            return {"success": False, "error": "No database connection"}

        result = self._db.table('channel_connections').select(
            'id, access_token'
        ).eq('id', channel_connection_id).single().execute()

        if not result.data:
            return {"success": False, "error": "Connection not found"}

        token = result.data.get('access_token')

        # Revoke on Meta's side
        if token:
            try:
                response = self._session.delete(
                    f"{META_GRAPH_URL}/me/permissions",
                    params={'access_token': token},
                    timeout=REQUEST_TIMEOUT,
                )
                logger.info(
                    f"token_revoked_meta status={response.status_code}"
                )
            except Exception as e:
                logger.warning(f"token_revoke_meta_failed: {e}")

        # Mark connection as disconnected
        now = datetime.now(timezone.utc).isoformat()
        self._db.table('channel_connections').update({
            'is_active': False,
            'disconnected_at': now,
            'access_token': '',  # Clear token
            'updated_at': now,
        }).eq('id', channel_connection_id).execute()

        self._log_lifecycle_event(channel_connection_id, 'revoked')

        return {"success": True}

    # =====================================================================
    # Instagram-Specific: Get Connected Account Info
    # =====================================================================

    def get_instagram_account(
        self, access_token: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get the Instagram Business Account connected to this token.

        Flow: Token → Facebook Pages → Instagram Business Account

        Returns:
            {
                "instagram_account_id": "17841400...",
                "username": "mybrand",
                "name": "My Brand",
                "profile_pic": "https://...",
                "page_id": "1234...",
                "page_name": "My Brand Page",
            }
        """
        try:
            # Get Facebook pages
            pages_resp = self._session.get(
                f"{META_GRAPH_URL}/me/accounts",
                params={
                    'access_token': access_token,
                    'fields': 'id,name,instagram_business_account'
                             '{id,username,name,profile_picture_url}',
                },
                timeout=REQUEST_TIMEOUT,
            )

            if pages_resp.status_code != 200:
                return None

            pages = pages_resp.json().get('data', [])

            for page in pages:
                ig_account = page.get('instagram_business_account')
                if ig_account:
                    return {
                        'instagram_account_id': ig_account.get('id'),
                        'username': ig_account.get('username'),
                        'name': ig_account.get('name'),
                        'profile_pic': ig_account.get('profile_picture_url'),
                        'page_id': page.get('id'),
                        'page_name': page.get('name'),
                    }

            logger.warning("token_no_ig_account — no IG business account linked")
            return None

        except Exception as e:
            logger.error(f"token_get_ig_account_error: {e}")
            return None

    # =====================================================================
    # Token Validation
    # =====================================================================

    def validate_token(self, access_token: str) -> Dict[str, Any]:
        """
        Debug/validate an access token via Facebook's debug endpoint.

        Returns token metadata: app_id, user_id, expires_at, scopes, etc.
        """
        try:
            response = self._session.get(
                f"{META_GRAPH_URL}/debug_token",
                params={
                    'input_token': access_token,
                    'access_token': f"{META_APP_ID}|{META_APP_SECRET}",
                },
                timeout=REQUEST_TIMEOUT,
            )
            return response.json().get('data', {})
        except Exception as e:
            logger.error(f"token_validate_error: {e}")
            return {}

    # =====================================================================
    # Lifecycle Audit Trail
    # =====================================================================

    def _log_lifecycle_event(
        self,
        channel_connection_id: str,
        event_type: str,
        old_expires_at: Optional[str] = None,
        new_expires_at: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """Log token lifecycle event to audit table."""
        if not self._db:
            return
        try:
            self._db.table('token_lifecycle_events').insert({
                'channel_connection_id': channel_connection_id,
                'event_type': event_type,
                'old_expires_at': old_expires_at,
                'new_expires_at': new_expires_at,
                'error': error,
            }).execute()
        except Exception as e:
            logger.warning(f"token_lifecycle_log_error: {e}")


class TokenError(Exception):
    """Token operation failed."""
    pass


# =========================================================================
# Singleton
# =========================================================================

_manager_instance: Optional[TokenManager] = None


def get_token_manager() -> TokenManager:
    """Get singleton TokenManager instance."""
    global _manager_instance
    if _manager_instance is None:
        db = None
        try:
            from supabase_client import get_supabase_client
            db = get_supabase_client()
        except Exception:
            pass
        _manager_instance = TokenManager(supabase_client=db)
        logger.info("🔑 TokenManager initialized")
    return _manager_instance
