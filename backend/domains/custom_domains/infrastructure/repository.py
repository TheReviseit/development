from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

try:
    from postgrest.exceptions import APIError
except Exception:  # pragma: no cover - defensive for dependency drift
    APIError = Exception


OPTIONAL_TENANT_DOMAIN_FIELDS = {
    "setup_mode",
    "nameserver_status",
    "managed_dns_status",
    "desired_nameservers",
    "managed_dns_records",
}


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
        result = self._execute_domain_insert(data)
        rows = result.data or []
        if not rows:
            raise RuntimeError("Failed to create tenant domain")
        return rows[0]

    def update_domain(self, domain_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        result = self._execute_domain_update(domain_id, fields)
        rows = result.data or []
        if not rows:
            raise RuntimeError("Failed to update tenant domain")
        return rows[0]

    def _execute_domain_insert(self, data: dict[str, Any]):
        try:
            return self.client.table("tenant_domains").insert(data).execute()
        except APIError as exc:
            if not self._is_optional_domain_schema_error(exc):
                raise
            compatible_data = self._without_optional_domain_fields(data)
            print(
                "[DomainRepository] tenant_domains optional columns are not available in "
                "PostgREST schema cache; retrying insert with compatibility payload. "
                "Apply 20260521002200_domain_setup_modes.sql and reload schema cache."
            )
            return self.client.table("tenant_domains").insert(compatible_data).execute()

    def _execute_domain_update(self, domain_id: str, fields: dict[str, Any]):
        try:
            return self.client.table("tenant_domains").update(fields).eq("id", domain_id).execute()
        except APIError as exc:
            if not self._is_optional_domain_schema_error(exc):
                raise
            compatible_fields = self._without_optional_domain_fields(fields)
            print(
                "[DomainRepository] tenant_domains optional columns are not available in "
                "PostgREST schema cache; retrying update with compatibility payload. "
                "Apply 20260521002200_domain_setup_modes.sql and reload schema cache."
            )
            if not compatible_fields:
                return self.client.table("tenant_domains").select("*").eq("id", domain_id).limit(1).execute()
            return self.client.table("tenant_domains").update(compatible_fields).eq("id", domain_id).execute()

    def _without_optional_domain_fields(self, data: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in data.items() if key not in OPTIONAL_TENANT_DOMAIN_FIELDS}

    def _is_optional_domain_schema_error(self, exc: Exception) -> bool:
        missing_column = self._missing_column_name(exc)
        if missing_column in OPTIONAL_TENANT_DOMAIN_FIELDS:
            return True

        text = str(exc).lower()
        return (
            "tenant_domains" in text
            and "schema cache" in text
            and any(field in text for field in OPTIONAL_TENANT_DOMAIN_FIELDS)
        )

    def _missing_column_name(self, exc: Exception) -> str | None:
        text = str(exc).lower()
        quoted_match = re.search(r"['\"]([a-z_]+)['\"] column", text)
        if quoted_match:
            return quoted_match.group(1)
        dotted_match = re.search(r"tenant_domains\.([a-z_]+)", text)
        if dotted_match:
            return dotted_match.group(1)
        return None

    def get_business_slug(self, user_id: str) -> str | None:
        slug = self._get_business_slug_by_owner_id(user_id)
        if slug:
            return slug

        resolved_user_id = self._get_internal_user_id(user_id)
        if resolved_user_id and resolved_user_id != user_id:
            return self._get_business_slug_by_owner_id(resolved_user_id)

        return None

    def _get_business_slug_by_owner_id(self, user_id: str) -> str | None:
        result = (
            self.client.table("businesses")
            .select("url_slug")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        slug = rows[0].get("url_slug") if rows else None
        return slug or None

    def _get_internal_user_id(self, firebase_uid: str) -> str | None:
        result = (
            self.client.table("users")
            .select("id")
            .eq("firebase_uid", firebase_uid)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("id") if rows else None

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
