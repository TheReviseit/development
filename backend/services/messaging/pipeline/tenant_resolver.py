"""
Tenant Resolver Stage — FAANG-Grade Identity Resolution
=========================================================

Resolves tenant identity from channel_account_id with full traceability.

Resolution Chain:
    1. channel_connections(channel_account_id) → supabase_uuid
    2. users(id=supabase_uuid) → firebase_uid
    3. subscriptions(user_id=supabase_uuid) → plan

Fallback Chain:
    4. businesses(phone_number_id) → firebase_uid (direct)

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger('flowauxi.messaging.pipeline.tenant_resolver')


@dataclass(frozen=True)
class TenantContext:
    """
    Immutable tenant identity resolved once per inbound message.
    
    Design:
        - supabase_uuid:  Internal Supabase auth.users(id) — used for DB joins
        - firebase_uid:   Firebase Auth UID — used for AI Brain, ai_capabilities, businesses
        - channel_connection_id: The channel_connections row ID
        - plan:           Active subscription plan slug (starter/business/pro)
    
    Guarantees:
        - firebase_uid is ALWAYS populated (or resolution fails loudly)
        - plan defaults to 'starter' if subscription lookup fails
    """
    supabase_uuid: str
    firebase_uid: str
    channel_connection_id: Optional[str] = None
    plan: str = 'starter'


class TenantResolverStage:
    """
    Resolves tenant identity from channel_account_id.
    
    Usage:
        resolver = TenantResolverStage()
        
        tenant = resolver.resolve(
            channel_account_id="ig_17841400...",
            trace_id="abc123",
        )
        
        if tenant:
            print(f"Tenant: {tenant.firebase_uid}, Plan: {tenant.plan}")
    """
    
    def __init__(self, supabase_client=None):
        """
        Args:
            supabase_client: Optional Supabase client for testing.
                           If None, uses singleton.
        """
        self._db = supabase_client
    
    def _get_db(self):
        """Lazy-load Supabase client."""
        if self._db is None:
            from supabase_client import get_supabase_client
            self._db = get_supabase_client()
        return self._db
    
    def resolve(
        self,
        channel_account_id: str,
        trace_id: str = '',
    ) -> Optional[TenantContext]:
        """
        Resolve tenant identity from channel_account_id.
        
        Args:
            channel_account_id: Platform-specific account ID
            trace_id: Distributed tracing ID for log correlation
            
        Returns:
            TenantContext with full identity, or None if resolution fails
        """
        if not channel_account_id:
            logger.warning(f"[{trace_id}] tenant_resolve_no_account_id")
            return None
        
        db = self._get_db()
        if not db:
            logger.error(f"[{trace_id}] tenant_resolve_no_db")
            return None
        
        supabase_uuid = None
        firebase_uid = None
        connection_id = None
        
        # ── Method 1: channel_connections (primary) ──
        try:
            result = db.table('channel_connections').select(
                'id, user_id'
            ).eq(
                'channel_account_id', channel_account_id
            ).eq('is_active', True).limit(1).execute()
            
            if result.data:
                supabase_uuid = result.data[0]['user_id']
                connection_id = result.data[0].get('id')
                
                # Resolve Firebase UID from Supabase UUID
                uid_result = db.table('users').select(
                    'firebase_uid'
                ).eq('id', supabase_uuid).limit(1).execute()
                
                if uid_result.data and uid_result.data[0].get('firebase_uid'):
                    firebase_uid = uid_result.data[0]['firebase_uid']
                    logger.info(
                        f"tenant_uid_resolved trace={trace_id} "
                        f"supabase={supabase_uuid[:8]}... → "
                        f"firebase={firebase_uid[:12]}..."
                    )
                else:
                    logger.warning(
                        f"tenant_no_firebase_uid trace={trace_id} "
                        f"supabase_uuid={supabase_uuid[:8]}... "
                        f"(users table has no firebase_uid for this user)"
                    )
        except Exception as e:
            logger.warning(
                f"tenant_channel_conn_error trace={trace_id}: {e}"
            )
        
        # ── Method 2: businesses table fallback ──
        # businesses.user_id stores firebase_uid directly
        if not firebase_uid:
            try:
                result = db.table('businesses').select(
                    'user_id'
                ).eq(
                    'phone_number_id', channel_account_id
                ).limit(1).execute()
                
                if result.data:
                    firebase_uid = result.data[0]['user_id']
                    logger.info(
                        f"tenant_businesses_fallback trace={trace_id} "
                        f"firebase_uid={firebase_uid[:12]}..."
                    )
                    
                    # Also resolve supabase_uuid if we don't have it
                    if not supabase_uuid:
                        try:
                            uid_result = db.table('users').select(
                                'id'
                            ).eq(
                                'firebase_uid', firebase_uid
                            ).limit(1).execute()
                            if uid_result.data:
                                supabase_uuid = uid_result.data[0]['id']
                        except Exception:
                            supabase_uuid = firebase_uid  # Last resort
            except Exception as e:
                logger.warning(
                    f"tenant_businesses_fallback_error trace={trace_id}: {e}"
                )
        
        if not firebase_uid:
            logger.error(
                f"tenant_resolve_failed trace={trace_id} "
                f"account={channel_account_id} "
                f"(no firebase_uid found in any source)"
            )
            return None
        
        # Ensure supabase_uuid has a value
        if not supabase_uuid:
            supabase_uuid = firebase_uid
        
        # ── Resolve subscription plan ──
        plan = self._get_tenant_plan(db, supabase_uuid, trace_id)
        
        return TenantContext(
            supabase_uuid=supabase_uuid,
            firebase_uid=firebase_uid,
            channel_connection_id=connection_id,
            plan=plan,
        )
    
    def _get_tenant_plan(
        self,
        db,
        supabase_uuid: str,
        trace_id: str = '',
    ) -> str:
        """
        Resolve the active subscription plan for a tenant.
        
        Queries the subscriptions table. The subscriptions table 
        uses auth.users(id) as user_id (Supabase UUID).
        """
        try:
            result = db.table('subscriptions').select(
                'plan_name'
            ).eq(
                'user_id', supabase_uuid
            ).in_(
                'status', ['active', 'trialing']
            ).order(
                'created_at', desc=True
            ).limit(1).execute()
            
            if result.data:
                plan = result.data[0].get('plan_name', 'starter')
                return plan
        except Exception as e:
            # PGRST116 = no rows (expected for free users)
            if 'PGRST116' not in str(e):
                logger.debug(
                    f"plan_resolve_error trace={trace_id}: {e}"
                )
        
        return 'starter'


# =============================================================================
# Singleton
# =============================================================================

_instance: Optional[TenantResolverStage] = None


def get_tenant_resolver_stage() -> TenantResolverStage:
    """Get singleton TenantResolverStage instance."""
    global _instance
    if _instance is None:
        _instance = TenantResolverStage()
    return _instance
