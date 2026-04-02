"""
Business Loader Stage — FAANG-Grade Data Loading
==================================================

Loads business data and credentials for AI processing.

CRITICAL FIX: Pass credentials to get_business_data_from_supabase()
to include phone number for WhatsApp display.

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger('flowauxi.messaging.pipeline.business_loader')


@dataclass
class BusinessContext:
    """
    Business data and credentials for AI processing.
    
    Attributes:
        business_data: Full business profile for AI Brain
        credentials: Channel-specific credentials (access_token, phone, etc.)
    """
    business_data: Dict[str, Any]
    credentials: Optional[Dict[str, Any]] = None
    access_token: Optional[str] = None
    channel_account_id: Optional[str] = None


class BusinessLoaderStage:
    """
    Loads business data and credentials for message processing.
    
    Usage:
        loader = BusinessLoaderStage()
        
        context = loader.load(
            tenant=tenant_ctx,
            channel="instagram",
            channel_account_id="ig_17841400...",
            trace_id="abc123",
        )
        
        print(f"Business: {context.business_data.get('business_name')}")
    """
    
    def __init__(self, supabase_client=None):
        """
        Args:
            supabase_client: Optional Supabase client for testing.
        """
        self._db = supabase_client
    
    def _get_db(self):
        """Lazy-load Supabase client."""
        if self._db is None:
            from supabase_client import get_supabase_client
            self._db = get_supabase_client()
        return self._db
    
    def load(
        self,
        tenant,
        channel: str,
        channel_account_id: str,
        trace_id: str = '',
    ) -> Optional[BusinessContext]:
        """
        Load business data and credentials for a tenant.
        
        CRITICAL: Pass credentials to get_business_data_from_supabase()
        to include phone number for WhatsApp display.
        
        Args:
            tenant: TenantContext from TenantResolverStage
            channel: Channel name ('instagram', 'whatsapp')
            channel_account_id: Platform account ID
            trace_id: Distributed tracing ID
            
        Returns:
            BusinessContext with data and credentials, or None if loading fails
        """
        if not tenant or not tenant.firebase_uid:
            logger.warning(f"[{trace_id}] business_loader_no_tenant")
            return None
        
        db = self._get_db()
        if not db:
            logger.error(f"[{trace_id}] business_loader_no_db")
            return None
        
        # ── Load channel credentials ──
        credentials = self._load_credentials(
            db, channel, channel_account_id, trace_id
        )
        
        # ── Load business data with credentials (CRITICAL FIX) ──
        # CRITICAL: Pass credentials to include phone number in contact
        business_data = self._load_business_data(
            tenant.firebase_uid,
            credentials=credentials,  # FIX: Was passing None
            trace_id=trace_id,
        )
        
        if not business_data:
            logger.warning(
                f"[{trace_id}] business_loader_no_data "
                f"tenant={tenant.firebase_uid[:15]} "
                f"(using minimal fallback)"
            )
            # Minimal fallback so AI can still politely reply
            business_data = {
                'business_id': tenant.firebase_uid,
                'business_name': 'Our Business',
                'industry': 'other',
                'products_services': [],
                'contact': {},
            }
        
        # Extract access token for sending
        access_token = None
        if credentials:
            access_token = credentials.get('access_token')
        
        # Fallback to env vars if no DB token
        if not access_token:
            access_token = self._get_env_token(channel)
        
        return BusinessContext(
            business_data=business_data,
            credentials=credentials,
            access_token=access_token,
            channel_account_id=channel_account_id,
        )
    
    def _load_credentials(
        self,
        db,
        channel: str,
        channel_account_id: str,
        trace_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Load channel-specific credentials from database.
        
        Returns:
            Dict with access_token, display_phone_number, etc.
        """
        try:
            result = db.table('channel_connections').select(
                'access_token, credentials'
            ).eq(
                'channel_account_id', channel_account_id
            ).eq('is_active', True).limit(1).execute()
            
            if result.data:
                row = result.data[0]
                credentials = row.get('credentials', {})
                
                # Merge access_token at top level for convenience
                if row.get('access_token'):
                    credentials['access_token'] = row['access_token']
                
                logger.debug(
                    f"credentials_loaded trace={trace_id} "
                    f"channel={channel} "
                    f"has_token={bool(credentials.get('access_token'))}"
                )
                
                return credentials
            
        except Exception as e:
            logger.warning(
                f"credentials_load_error trace={trace_id}: {e}"
            )
        
        return None
    
    def _load_business_data(
        self,
        firebase_uid: str,
        credentials: Optional[Dict[str, Any]] = None,
        trace_id: str = '',
    ) -> Optional[Dict[str, Any]]:
        """
        Load business data from Supabase.
        
        CRITICAL FIX: Pass credentials to include phone number in contact.
        
        Args:
            firebase_uid: Firebase UID
            credentials: Channel credentials for phone display
            trace_id: Tracing ID
        """
        try:
            from supabase_client import get_business_data_from_supabase
            
            # CRITICAL FIX: Pass credentials to get_business_data_from_supabase
            # to include display_phone_number in contact
            business_data = get_business_data_from_supabase(
                firebase_uid,
                credentials=credentials,  # FIX: This was None causing phone to be empty
            )
            
            if business_data:
                logger.debug(
                    f"business_data_loaded trace={trace_id} "
                    f"tenant={firebase_uid[:15]} "
                    f"name={business_data.get('business_name', 'unknown')}"
                )
            
            return business_data
            
        except Exception as e:
            logger.warning(
                f"business_data_load_error trace={trace_id}: {e}"
            )
            return None
    
    def _get_env_token(self, channel: str) -> Optional[str]:
        """Fallback to environment variable tokens."""
        import os
        
        env_map = {
            'whatsapp': 'WHATSAPP_ACCESS_TOKEN',
            'instagram': 'INSTAGRAM_ACCESS_TOKEN',
        }
        
        return os.getenv(env_map.get(channel, ''))


# =============================================================================
# Singleton
# =============================================================================

_instance: Optional[BusinessLoaderStage] = None


def get_business_loader_stage() -> BusinessLoaderStage:
    """Get singleton BusinessLoaderStage instance."""
    global _instance
    if _instance is None:
        _instance = BusinessLoaderStage()
    return _instance
