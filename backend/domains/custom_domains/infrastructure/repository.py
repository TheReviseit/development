from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


class DomainRepository:
    def __init__(self, client=None):
        if client is None:
            from supabase_client import get_supabase_client
            client = get_supabase_client()
        if client is None:
            raise RuntimeError("Supabase client is not configured")
        self.client = client

    def list_for_user(self, user_id: str, product_domain: str | None = None) -> list[dict[str, Any]]:
        query = self.client.table("tenant_domains").select("*").eq("user_id", user_id).is_("deleted_at", "null")
        if product_domain:
            query = query.eq("product_domain", product_domain)
        result = query.order("created_at", desc=True).execute()
        return result.data or []

    def count_active_for_user(self, user_id: str, product_domain: str) -> int:
        result = (
            self.client.table("tenant_domains")
            .select("id")
            .eq("user_id", user_id)
            .eq("product_domain", product_domain)
            .is_("deleted_at", "null")
            .neq("status", "removed")
            .execute()
        )
        return len(result.data or [])

    def get_for_user(self, domain_id: str, user_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("tenant_domains")
            .select("*")
            .eq("id", domain_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def find_claimed_host(self, normalized_host: str) -> dict[str, Any] | None:
        result = (
            self.client.table("tenant_domains")
            .select("*")
            .eq("normalized_host", normalized_host)
            .is_("deleted_at", "null")
            .neq("status", "removed")
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def find_routing_host(self, normalized_host: str) -> dict[str, Any] | None:
        result = (
            self.client.table("tenant_domains")
            .select("*")
            .eq("normalized_host", normalized_host)
            .eq("routing_enabled", True)
            .eq("status", "active")
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def create_domain(self, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("tenant_domains").insert(data).execute()
        rows = result.data or []
        if not rows:
            raise RuntimeError("Failed to create tenant domain")
        return rows[0]

    def update_domain(self, domain_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("tenant_domains").update(fields).eq("id", domain_id).execute()
        rows = result.data or []
        if not rows:
            raise RuntimeError("Failed to update tenant domain")
        return rows[0]

    def get_business_slug(self, user_id: str) -> str:
        result = (
            self.client.table("businesses")
            .select("url_slug")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        slug = rows[0].get("url_slug") if rows else None
        return slug or user_id[:8].lower()

    def record_attempt(self, data: dict[str, Any]) -> None:
        self.client.table("domain_verification_attempts").insert(data).execute()

    def record_event(self, data: dict[str, Any]) -> None:
        self.client.table("domain_events").insert(data).execute()

    def get_idempotency(self, namespace: str) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        result = (
            self.client.table("domain_idempotency_keys")
            .select("*")
            .eq("namespace", namespace)
            .gt("expires_at", now)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def store_idempotency(self, data: dict[str, Any]) -> None:
        self.client.table("domain_idempotency_keys").upsert(data, on_conflict="namespace").execute()

