"""
Platform Monitoring Service
===========================
Centralized observability layer for AI usage, email, and tenant metrics.

Aggregates data from:
- business_llm_usage (per-business token tracking)
- analytics_daily (daily message/AI metrics)
- subscriptions + pricing_plans (plan info)
- businesses + users (tenant/user counts)
- whatsapp_messages (message volumes)

Performance:
- Redis-cached aggregations (60s TTL)
- Efficient SQL with pre-aggregation
- Supports 100k+ tenants via pagination and streaming

Author: Flowauxi Engineering
"""

import os
import time
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass

logger = logging.getLogger('flowauxi.monitoring')

# Cost constants (Gemini 2.5 Flash pricing)
INPUT_COST_PER_1M_USD = 0.15
OUTPUT_COST_PER_1M_USD = 0.60
CACHED_COST_PER_1M_USD = 0.0375
USD_TO_INR = 89.58

# Cache TTLs
OVERVIEW_CACHE_TTL = 60       # 1 minute for global stats
TENANT_CACHE_TTL = 120        # 2 minutes for tenant list
TRENDS_CACHE_TTL = 300        # 5 minutes for daily trends

# Redis key prefix
CACHE_PREFIX = "monitor:"


def _get_redis():
    """Get Redis connection (lazy, tolerant of missing Redis)."""
    try:
        import redis
        redis_url = os.getenv('REDIS_URL')
        if redis_url:
            return redis.from_url(redis_url, decode_responses=True)
    except Exception:
        pass
    return None


def _cache_get(key: str) -> Optional[dict]:
    """Read from Redis cache."""
    r = _get_redis()
    if not r:
        return None
    try:
        data = r.get(f"{CACHE_PREFIX}{key}")
        if data:
            return json.loads(data)
    except Exception:
        pass
    return None


def _cache_set(key: str, data: dict, ttl: int):
    """Write to Redis cache."""
    r = _get_redis()
    if not r:
        return
    try:
        r.setex(f"{CACHE_PREFIX}{key}", ttl, json.dumps(data, default=str))
    except Exception:
        pass


class MonitoringService:
    """
    Platform-wide monitoring aggregation service.

    All methods return dicts suitable for JSON serialization.
    Uses Redis caching to avoid repeated DB hits.
    """

    def __init__(self, supabase_client=None):
        self.db = supabase_client

    def _get_db(self):
        """Lazy DB access."""
        if self.db:
            return self.db
        try:
            from supabase_client import get_supabase_client
            self.db = get_supabase_client()
            return self.db
        except Exception as e:
            logger.error(f"Cannot get Supabase client: {e}")
            return None

    # =========================================================================
    # 1. PLATFORM OVERVIEW
    # =========================================================================

    def get_platform_overview(self) -> Dict[str, Any]:
        """
        Global platform metrics: users, tenants, AI tokens, costs, emails.
        Cached for 60 seconds.
        """
        cached = _cache_get("overview")
        if cached:
            return cached

        db = self._get_db()
        if not db:
            return self._empty_overview()

        try:
            overview = {}

            # Total users
            users_result = db.table('users').select('id', count='exact').execute()
            overview['total_users'] = users_result.count or 0

            # Total tenants (businesses)
            biz_result = db.table('businesses').select('id', count='exact').execute()
            overview['total_tenants'] = biz_result.count or 0

            # AI usage aggregates from business_llm_usage
            ai_agg = self._aggregate_ai_usage(db)
            overview.update(ai_agg)

            # Email/message counts from analytics_daily (last 30 days)
            email_agg = self._aggregate_messages(db)
            overview.update(email_agg)

            # Cost estimates
            overview['monthly_cost_estimate_usd'] = round(
                overview.get('total_ai_cost_usd', 0) * 1.1, 2  # 10% buffer
            )
            overview['daily_cost_estimate_usd'] = round(
                overview.get('total_ai_cost_usd', 0) / max(1, 30), 2
            )

            overview['generated_at'] = datetime.utcnow().isoformat()

            _cache_set("overview", overview, OVERVIEW_CACHE_TTL)
            return overview

        except Exception as e:
            logger.error(f"Error fetching platform overview: {e}", exc_info=True)
            return self._empty_overview()

    def _aggregate_ai_usage(self, db) -> Dict[str, Any]:
        """Aggregate AI token usage across all businesses."""
        try:
            # Fetch all business_llm_usage rows (paginated for scale)
            result = db.table('business_llm_usage').select(
                'monthly_tokens_used, input_tokens, output_tokens, '
                'cached_tokens, cost_usd, cost_inr, monthly_llm_replies, model_name'
            ).execute()

            total_tokens = 0
            total_input = 0
            total_output = 0
            total_cached = 0
            total_cost_usd = 0.0
            total_cost_inr = 0.0
            total_replies = 0
            model_breakdown = {}

            for row in (result.data or []):
                tokens = row.get('monthly_tokens_used', 0) or 0
                inp = row.get('input_tokens', 0) or 0
                out = row.get('output_tokens', 0) or 0
                cached = row.get('cached_tokens', 0) or 0
                cost_usd = float(row.get('cost_usd', 0) or 0)
                cost_inr = float(row.get('cost_inr', 0) or 0)
                replies = row.get('monthly_llm_replies', 0) or 0
                model = row.get('model_name', 'gemini-2.5-flash') or 'gemini-2.5-flash'

                total_tokens += tokens
                total_input += inp
                total_output += out
                total_cached += cached
                total_cost_usd += cost_usd
                total_cost_inr += cost_inr
                total_replies += replies

                if model not in model_breakdown:
                    model_breakdown[model] = {'tokens': 0, 'cost_usd': 0.0, 'replies': 0}
                model_breakdown[model]['tokens'] += tokens
                model_breakdown[model]['cost_usd'] += cost_usd
                model_breakdown[model]['replies'] += replies

            # Round model costs
            for m in model_breakdown:
                model_breakdown[m]['cost_usd'] = round(model_breakdown[m]['cost_usd'], 4)

            return {
                'total_ai_tokens': total_tokens,
                'total_input_tokens': total_input,
                'total_output_tokens': total_output,
                'total_cached_tokens': total_cached,
                'total_ai_cost_usd': round(total_cost_usd, 4),
                'total_ai_cost_inr': round(total_cost_inr, 2),
                'total_ai_replies': total_replies,
                'cost_per_model': model_breakdown,
            }
        except Exception as e:
            logger.error(f"Error aggregating AI usage: {e}")
            return {
                'total_ai_tokens': 0, 'total_input_tokens': 0,
                'total_output_tokens': 0, 'total_cached_tokens': 0,
                'total_ai_cost_usd': 0.0, 'total_ai_cost_inr': 0.0,
                'total_ai_replies': 0, 'cost_per_model': {},
            }

    def _aggregate_messages(self, db) -> Dict[str, Any]:
        """Aggregate message/email counts from analytics_daily (last 30 days)."""
        try:
            start_date = (datetime.utcnow() - timedelta(days=30)).date().isoformat()
            result = db.table('analytics_daily').select(
                'messages_sent, messages_received, ai_replies_generated'
            ).gte('date', start_date).execute()

            total_sent = 0
            total_received = 0
            total_ai = 0
            for row in (result.data or []):
                total_sent += row.get('messages_sent', 0) or 0
                total_received += row.get('messages_received', 0) or 0
                total_ai += row.get('ai_replies_generated', 0) or 0

            return {
                'total_messages_sent': total_sent,
                'total_messages_received': total_received,
                'total_ai_replies_30d': total_ai,
            }
        except Exception as e:
            logger.error(f"Error aggregating messages: {e}")
            return {
                'total_messages_sent': 0,
                'total_messages_received': 0,
                'total_ai_replies_30d': 0,
            }

    def _empty_overview(self) -> Dict[str, Any]:
        return {
            'total_users': 0, 'total_tenants': 0,
            'total_ai_tokens': 0, 'total_ai_cost_usd': 0.0,
            'total_ai_cost_inr': 0.0, 'total_ai_replies': 0,
            'total_messages_sent': 0, 'total_messages_received': 0,
            'cost_per_model': {},
            'monthly_cost_estimate_usd': 0.0, 'daily_cost_estimate_usd': 0.0,
            'generated_at': datetime.utcnow().isoformat(),
        }

    # =========================================================================
    # 2. PER-TENANT BREAKDOWN
    # =========================================================================

    def get_tenant_usage(
        self,
        page: int = 1,
        per_page: int = 50,
        sort_by: str = 'ai_cost',
        order: str = 'desc'
    ) -> Dict[str, Any]:
        """
        Per-tenant usage breakdown with pagination.
        Joins businesses + subscriptions + business_llm_usage.
        """
        cache_key = f"tenants:{page}:{per_page}:{sort_by}:{order}"
        cached = _cache_get(cache_key)
        if cached:
            return cached

        db = self._get_db()
        if not db:
            return {'tenants': [], 'total': 0, 'page': page, 'per_page': per_page}

        try:
            # Get businesses with user info
            offset = (page - 1) * per_page
            biz_result = db.table('businesses').select(
                'id, user_id, business_name, industry, created_at'
            ).range(offset, offset + per_page - 1).execute()

            businesses = biz_result.data or []
            if not businesses:
                return {'tenants': [], 'total': 0, 'page': page, 'per_page': per_page}

            # Collect firebase UIDs to look up Supabase UUIDs
            firebase_uids = [b['user_id'] for b in businesses if b.get('user_id')]

            # Batch lookup: firebase_uid -> supabase UUID
            uid_map = {}
            if firebase_uids:
                uid_result = db.table('users').select(
                    'id, firebase_uid, email'
                ).in_('firebase_uid', firebase_uids).execute()
                for u in (uid_result.data or []):
                    uid_map[u['firebase_uid']] = {
                        'uuid': u['id'],
                        'email': u.get('email', '')
                    }

            # Get subscriptions for these users
            supabase_uuids = [v['uuid'] for v in uid_map.values()]
            sub_map = {}
            if supabase_uuids:
                sub_result = db.table('subscriptions').select(
                    'user_id, plan_id, status, pricing_plan_id'
                ).in_('user_id', supabase_uuids).in_(
                    'status', ['active', 'completed', 'processing']
                ).execute()
                for s in (sub_result.data or []):
                    sub_map[s['user_id']] = s

            # Get business managers for these users to link to LLM usage
            manager_map = {} # Maps user_id -> business_manager_id
            if supabase_uuids:
                manager_result = db.table('connected_business_managers').select(
                    'id, user_id'
                ).in_('user_id', supabase_uuids).eq('is_active', True).execute()
                for m in (manager_result.data or []):
                    manager_map[m['user_id']] = m['id']

            # Get LLM usage for these businesses (keyed by business_id = connected_business_managers.id)
            usage_map = {}
            business_manager_ids = list(manager_map.values())
            if business_manager_ids:
                usage_result = db.table('business_llm_usage').select(
                    'business_id, monthly_tokens_used, monthly_llm_replies, '
                    'input_tokens, output_tokens, cost_usd, cost_inr, model_name'
                ).in_('business_id', business_manager_ids).execute()
                for u in (usage_result.data or []):
                    usage_map[u['business_id']] = u

            # Get plan names
            plan_ids = list(set(
                s.get('pricing_plan_id') for s in sub_map.values()
                if s.get('pricing_plan_id')
            ))
            plan_map = {}
            if plan_ids:
                plan_result = db.table('pricing_plans').select(
                    'id, plan_slug, display_name'
                ).in_('id', plan_ids).execute()
                for p in (plan_result.data or []):
                    plan_map[p['id']] = p

            # Build tenant list
            tenants = []
            for biz in businesses:
                fuid = biz.get('user_id', '')
                user_info = uid_map.get(fuid, {})
                supabase_uuid = user_info.get('uuid', '')

                sub = sub_map.get(supabase_uuid, {})
                plan_id = sub.get('pricing_plan_id', '')
                plan = plan_map.get(plan_id, {})
                
                # Fetch usage using the business manager ID, not the user ID
                manager_id = manager_map.get(supabase_uuid, '')
                usage = usage_map.get(manager_id, {})

                tenants.append({
                    'business_name': biz.get('business_name', 'Unknown'),
                    'industry': biz.get('industry', ''),
                    'email': user_info.get('email', ''),
                    'plan': plan.get('display_name') or plan.get('plan_slug', 'starter'),
                    'subscription_status': sub.get('status', 'none'),
                    'ai_tokens': usage.get('monthly_tokens_used', 0) or 0,
                    'ai_replies': usage.get('monthly_llm_replies', 0) or 0,
                    'ai_cost_usd': round(float(usage.get('cost_usd', 0) or 0), 4),
                    'ai_cost_inr': round(float(usage.get('cost_inr', 0) or 0), 2),
                    'input_tokens': usage.get('input_tokens', 0) or 0,
                    'output_tokens': usage.get('output_tokens', 0) or 0,
                    'model': usage.get('model_name', ''),
                    'created_at': biz.get('created_at', ''),
                })

            # Sort
            reverse = order == 'desc'
            sort_key_map = {
                'ai_cost': 'ai_cost_usd',
                'tokens': 'ai_tokens',
                'replies': 'ai_replies',
                'name': 'business_name',
            }
            sk = sort_key_map.get(sort_by, 'ai_cost_usd')
            tenants.sort(key=lambda t: t.get(sk, 0) or 0, reverse=reverse)

            # Total count
            total_result = db.table('businesses').select('id', count='exact').execute()
            total = total_result.count or len(tenants)

            result_data = {
                'tenants': tenants,
                'total': total,
                'page': page,
                'per_page': per_page,
            }

            _cache_set(cache_key, result_data, TENANT_CACHE_TTL)
            return result_data

        except Exception as e:
            logger.error(f"Error fetching tenant usage: {e}", exc_info=True)
            return {'tenants': [], 'total': 0, 'page': page, 'per_page': per_page}

    # =========================================================================
    # 3. DAILY TRENDS
    # =========================================================================

    def get_daily_trends(self, days: int = 30) -> Dict[str, Any]:
        """
        Daily AI token usage and message trends.
        Sourced from analytics_daily table.
        """
        cache_key = f"trends:{days}"
        cached = _cache_get(cache_key)
        if cached:
            return cached

        db = self._get_db()
        if not db:
            return {'daily': [], 'period_days': days}

        try:
            start_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()

            result = db.table('analytics_daily').select(
                'date, messages_sent, messages_received, '
                'ai_replies_generated, ai_tokens_used'
            ).gte('date', start_date).order('date').execute()

            # Aggregate by date (multiple users per day)
            daily_map = {}
            for row in (result.data or []):
                d = row.get('date', '')[:10]  # YYYY-MM-DD
                if d not in daily_map:
                    daily_map[d] = {
                        'date': d,
                        'messages_sent': 0,
                        'messages_received': 0,
                        'ai_replies': 0,
                        'ai_tokens': 0,
                        'ai_cost_usd': 0.0,
                    }
                daily_map[d]['messages_sent'] += row.get('messages_sent', 0) or 0
                daily_map[d]['messages_received'] += row.get('messages_received', 0) or 0
                daily_map[d]['ai_replies'] += row.get('ai_replies_generated', 0) or 0

                tokens = row.get('ai_tokens_used', 0) or 0
                daily_map[d]['ai_tokens'] += tokens
                # Estimate cost (assume 60% input, 40% output)
                input_est = int(tokens * 0.6)
                output_est = tokens - input_est
                cost = (input_est / 1_000_000 * INPUT_COST_PER_1M_USD +
                        output_est / 1_000_000 * OUTPUT_COST_PER_1M_USD)
                daily_map[d]['ai_cost_usd'] += round(cost, 4)

            daily = sorted(daily_map.values(), key=lambda x: x['date'])

            # Round costs
            for d in daily:
                d['ai_cost_usd'] = round(d['ai_cost_usd'], 4)

            result_data = {'daily': daily, 'period_days': days}
            _cache_set(cache_key, result_data, TRENDS_CACHE_TTL)
            return result_data

        except Exception as e:
            logger.error(f"Error fetching daily trends: {e}", exc_info=True)
            return {'daily': [], 'period_days': days}

    # =========================================================================
    # 4. MODEL COST BREAKDOWN
    # =========================================================================

    def get_model_breakdown(self) -> Dict[str, Any]:
        """Cost and usage breakdown by AI model."""
        db = self._get_db()
        if not db:
            return {'models': []}

        cached = _cache_get("model_breakdown")
        if cached:
            return cached

        try:
            result = db.table('business_llm_usage').select(
                'model_name, monthly_tokens_used, cost_usd, monthly_llm_replies'
            ).execute()

            model_map = {}
            for row in (result.data or []):
                model = row.get('model_name', 'gemini-2.5-flash') or 'gemini-2.5-flash'
                if model not in model_map:
                    model_map[model] = {
                        'model': model,
                        'total_tokens': 0,
                        'total_cost_usd': 0.0,
                        'total_replies': 0,
                        'tenant_count': 0,
                    }
                model_map[model]['total_tokens'] += row.get('monthly_tokens_used', 0) or 0
                model_map[model]['total_cost_usd'] += float(row.get('cost_usd', 0) or 0)
                model_map[model]['total_replies'] += row.get('monthly_llm_replies', 0) or 0
                model_map[model]['tenant_count'] += 1

            models = sorted(model_map.values(), key=lambda m: m['total_cost_usd'], reverse=True)
            for m in models:
                m['total_cost_usd'] = round(m['total_cost_usd'], 4)
                m['avg_cost_per_reply'] = round(
                    m['total_cost_usd'] / max(1, m['total_replies']), 6
                )

            data = {'models': models}
            _cache_set("model_breakdown", data, OVERVIEW_CACHE_TTL)
            return data

        except Exception as e:
            logger.error(f"Error fetching model breakdown: {e}")
            return {'models': []}

    # =========================================================================
    # 5. TOP CONSUMERS
    # =========================================================================

    def get_top_consumers(self, limit: int = 10, metric: str = 'cost') -> Dict[str, Any]:
        """Top N tenants by AI cost or token usage."""
        db = self._get_db()
        if not db:
            return {'top_consumers': []}

        try:
            order_col = 'cost_usd' if metric == 'cost' else 'monthly_tokens_used'
            result = db.table('business_llm_usage').select(
                'business_id, monthly_tokens_used, cost_usd, cost_inr, '
                'monthly_llm_replies, model_name'
            ).order(order_col, desc=True).limit(limit).execute()

            consumers = []
            for row in (result.data or []):
                bid = row.get('business_id', '')
                # Look up business name
                name = 'Unknown'
                try:
                    biz = db.table('users').select('email').eq('id', bid).limit(1).execute()
                    if biz.data:
                        name = biz.data[0].get('email', 'Unknown')
                except Exception:
                    pass

                consumers.append({
                    'business_id': bid,
                    'identifier': name,
                    'tokens': row.get('monthly_tokens_used', 0) or 0,
                    'cost_usd': round(float(row.get('cost_usd', 0) or 0), 4),
                    'cost_inr': round(float(row.get('cost_inr', 0) or 0), 2),
                    'replies': row.get('monthly_llm_replies', 0) or 0,
                    'model': row.get('model_name', ''),
                })

            return {'top_consumers': consumers}

        except Exception as e:
            logger.error(f"Error fetching top consumers: {e}")
            return {'top_consumers': []}


# Singleton
_service: Optional[MonitoringService] = None


def get_monitoring_service(supabase_client=None) -> MonitoringService:
    """Get or create singleton MonitoringService."""
    global _service
    if _service is None:
        _service = MonitoringService(supabase_client)
    return _service
