from __future__ import annotations

import hashlib
import hmac
import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from domains.custom_domains.domain.errors import DomainEngineError, DomainErrorCode
from domains.custom_domains.domain.normalization import normalize_host, NormalizedHost
from domains.custom_domains.infrastructure.dns_verifier import DnsVerifier, VERCEL_APEX_A_RECORD, VERCEL_CNAME_TARGET
from domains.custom_domains.infrastructure.provider import DomainProvider, ProviderDnsRecord, get_default_domain_provider
from domains.custom_domains.infrastructure.repository import DomainRepository
from domains.custom_domains.infrastructure.routing_cache import DomainRoutingCache, get_domain_routing_cache


SUPPORTED_PRODUCTS = {"shop"}
DEFAULT_QUARANTINE_DAYS = 30
DNS_CUSTOM_DOMAIN_FEATURE = "custom_dns_domain"
DOMAIN_SETUP_MODES = {"manual_dns", "nameserver"}


@dataclass(frozen=True)
class ServiceResult:
    body: dict[str, Any]
    status_code: int = 200
    replayed: bool = False


class CustomDomainService:
    def __init__(
        self,
        repository: DomainRepository | None = None,
        provider: DomainProvider | None = None,
        dns_verifier: DnsVerifier | None = None,
        routing_cache: DomainRoutingCache | None = None,
    ):
        self.repo = repository or DomainRepository()
        self.provider = provider or get_default_domain_provider()
        self.dns = dns_verifier or DnsVerifier()
        self.routing_cache = routing_cache or get_domain_routing_cache()

    def list_domains(self, user_id: str, product_domain: str | None = None) -> ServiceResult:
        rows = self.repo.list_for_user(user_id, product_domain)
        return ServiceResult({"success": True, "domains": [self._public_domain(row) for row in rows]})

    def get_domain(self, user_id: str, domain_id: str) -> ServiceResult:
        row = self._require_domain(user_id, domain_id)
        return ServiceResult({"success": True, "domain": self._public_domain(row, include_records=True)})

    def add_domain(
        self,
        user_id: str,
        raw_host: str,
        idempotency_key: str,
        product_domain: str = "shop",
        setup_mode: str = "nameserver",
    ) -> ServiceResult:
        if not idempotency_key:
            raise DomainEngineError(
                DomainErrorCode.MISSING_IDEMPOTENCY_KEY,
                "X-Idempotency-Key is required for domain creation.",
                status_code=428,
            )

        self._ensure_product_supported(product_domain)
        self._ensure_entitlement_before_conflict_lookup(user_id, product_domain)
        self._ensure_quota_before_conflict_lookup(user_id, product_domain)

        host = normalize_host(raw_host)
        setup_mode = self._normalize_setup_mode(setup_mode)
        payload_hash = self._payload_hash({
            "host": host.normalized_host,
            "product_domain": product_domain,
            "setup_mode": setup_mode,
        })
        namespace = f"{user_id}:{product_domain}:POST:/api/domains:{host.normalized_host}:{idempotency_key}"
        existing_idempotency = self.repo.get_idempotency(namespace)
        if existing_idempotency:
            if existing_idempotency["payload_hash"] != payload_hash:
                raise DomainEngineError(
                    DomainErrorCode.IDEMPOTENCY_KEY_REUSED,
                    "Idempotency key was reused with a different payload.",
                    status_code=409,
                )
            if existing_idempotency["state"] in {"completed", "failed_transient"} and existing_idempotency.get("response_body"):
                return ServiceResult(existing_idempotency["response_body"], existing_idempotency["status_code"], replayed=True)
            raise DomainEngineError(
                DomainErrorCode.IDEMPOTENCY_IN_PROGRESS,
                "An identical domain request is already in progress.",
                status_code=409,
                retryable=True,
            )

        self._store_idempotency(namespace, payload_hash, "in_progress", expires_hours=2)
        try:
            result = self._add_domain_after_idempotency(user_id, product_domain, host, setup_mode)
            self._store_idempotency(
                namespace,
                payload_hash,
                "completed",
                response_body=result.body,
                status_code=result.status_code,
                expires_hours=24,
            )
            return result
        except DomainEngineError as exc:
            self._store_idempotency(
                namespace,
                payload_hash,
                "failed_transient" if exc.retryable else "completed",
                response_body=exc.to_dict(),
                status_code=exc.status_code,
                expires_hours=2 if exc.retryable else 24,
            )
            raise
        except Exception as exc:
            self._store_idempotency(
                namespace,
                payload_hash,
                "failed_transient",
                response_body={
                    "success": False,
                    "code": DomainErrorCode.INTERNAL_ERROR.value,
                    "message": "Domain creation failed unexpectedly.",
                    "retryable": True,
                    "nextRetryAt": None,
                },
                status_code=500,
                expires_hours=2,
            )
            raise

    def verify_domain(self, user_id: str, domain_id: str) -> ServiceResult:
        row = self._require_domain(user_id, domain_id)
        if row.get("deleted_at"):
            raise DomainEngineError(DomainErrorCode.DOMAIN_DELETED, "Domain has been deleted.", status_code=410)

        host = normalize_host(row["normalized_host"])
        token = self._ownership_token(row["tenant_id"], host.normalized_host)
        setup_mode = self._domain_setup_mode(row)
        if setup_mode == "nameserver":
            return self._verify_nameserver_domain(row, host, token)

        expected_records = [record.to_dict() for record in self.dns.expected_records(host, token)]
        dns_result = self.dns.verify(host, token)
        self.repo.record_attempt({
            "domain_id": row["id"],
            "attempt_type": "dns",
            "result": "success" if dns_result.verified else "pending",
            "observed_records": dns_result.observed_records,
            "error_code": dns_result.error_code.value if dns_result.error_code else None,
            "error_message": dns_result.message,
            "duration_ms": dns_result.duration_ms,
        })

        if not dns_result.verified:
            updated = self.repo.update_domain(row["id"], {
                "expected_records": {"records": expected_records},
                "observed_records": dns_result.observed_records,
                "ownership_status": "failed" if dns_result.error_code == DomainErrorCode.OWNERSHIP_TXT_MISMATCH else "pending",
                "dns_status": "propagation_pending" if dns_result.error_code == DomainErrorCode.DNS_PROPAGATION_PENDING else "failed",
                "status": "pending_dns",
                "last_checked_at": self._now(),
                "next_check_at": self._future(minutes=10),
                "retry_count": int(row.get("retry_count") or 0) + 1,
                "last_error_code": dns_result.error_code.value if dns_result.error_code else None,
                "last_error_message": dns_result.message,
            })
            return ServiceResult({"success": True, "domain": self._public_domain(updated, include_records=True)}, 200)

        provider_result = self.provider.verify_domain(host)
        active = provider_result.verified
        binding = self._optional_shop_store_binding(row)
        routing_enabled = active and binding is not None
        new_version = int(row.get("routing_version") or 1) + (1 if routing_enabled != bool(row.get("routing_enabled")) else 0)
        updated = self.repo.update_domain(row["id"], {
            "expected_records": {"records": expected_records},
            "observed_records": dns_result.observed_records,
            "ownership_status": "verified",
            "dns_status": "verified",
            "provider_status": "verified" if provider_result.verified else "assigned",
            "ssl_status": "active" if provider_result.certificate_active or provider_result.verified else "pending",
            "status": "active" if active else "verified",
            "routing_enabled": routing_enabled,
            "routing_version": new_version,
            **self._store_binding_fields(binding),
            "verified_at": self._now(),
            "ssl_active_at": self._now() if provider_result.certificate_active or provider_result.verified else None,
            "last_checked_at": self._now(),
            "last_error_code": None if routing_enabled or not active else DomainErrorCode.STORE_NOT_CONFIGURED.value,
            "last_error_message": None if routing_enabled or not active else "Domain verified, but Shop storefront setup is required before routing can turn on.",
            "provider_last_response": provider_result.raw,
        })
        if routing_enabled:
            self.routing_cache.invalidate(host.normalized_host)
        self._event(updated, "domain_verified", {"routing_enabled": routing_enabled})
        return ServiceResult({"success": True, "domain": self._public_domain(updated, include_records=True)}, 200)

    def delete_domain(self, user_id: str, domain_id: str) -> ServiceResult:
        row = self._require_domain(user_id, domain_id)
        host = normalize_host(row["normalized_host"])
        quarantine_until = datetime.now(timezone.utc) + timedelta(days=DEFAULT_QUARANTINE_DAYS)
        local_removed = self.repo.update_domain(row["id"], {
            "routing_enabled": False,
            "routing_version": int(row.get("routing_version") or 1) + 1,
            "status": "removed",
            "deleted_at": self._now(),
            "quarantined_until": quarantine_until.isoformat(),
            "last_error_code": None,
            "last_error_message": None,
        })
        self.routing_cache.invalidate(host.normalized_host)
        try:
            provider_result = self.provider.remove_domain(host)
            updated = self.repo.update_domain(row["id"], {
                "provider_status": "removed",
                "provider_last_response": provider_result.raw,
            })
            self._event(updated, "domain_removed", {})
            return ServiceResult({"success": True, "domain": self._public_domain(updated)}, 200)
        except DomainEngineError as exc:
            pending = self.repo.update_domain(row["id"], {
                "status": "provider_removal_pending",
                "provider_status": "failed",
                "last_error_code": DomainErrorCode.PROVIDER_REMOVAL_FAILED.value,
                "last_error_message": exc.message,
                "next_check_at": self._future(hours=1),
            })
            self.repo.record_attempt({
                "domain_id": row["id"],
                "attempt_type": "remove",
                "result": "failed",
                "error_code": DomainErrorCode.PROVIDER_REMOVAL_FAILED.value,
                "error_message": exc.message,
            })
            self._event(pending, "provider_removal_failed", {"error": exc.message})
            return ServiceResult({"success": True, "domain": self._public_domain(pending)}, 202)

    def update_domain(self, user_id: str, domain_id: str, payload: dict[str, Any]) -> ServiceResult:
        row = self._require_domain(user_id, domain_id)
        if row.get("deleted_at"):
            raise DomainEngineError(DomainErrorCode.DOMAIN_DELETED, "Domain has been deleted.", status_code=410)

        fields: dict[str, Any] = {}
        if "isPrimary" in payload or "is_primary" in payload:
            fields["is_primary"] = bool(payload.get("isPrimary", payload.get("is_primary")))
            if fields["is_primary"]:
                fields["redirect_policy"] = "primary"

        redirect_policy = payload.get("redirectPolicy", payload.get("redirect_policy"))
        if redirect_policy is not None:
            if redirect_policy not in {"none", "redirect_to_primary", "primary"}:
                raise DomainEngineError(DomainErrorCode.INVALID_REDIRECT_TARGET, "Invalid redirect policy.", 400)
            fields["redirect_policy"] = redirect_policy

        redirect_target = payload.get("redirectTargetHost", payload.get("redirect_target_host"))
        if redirect_target:
            target_host = normalize_host(str(redirect_target))
            target_row = self.repo.find_claimed_host(target_host.normalized_host)
            if not target_row or target_row.get("user_id") != user_id:
                raise DomainEngineError(DomainErrorCode.INVALID_REDIRECT_TARGET, "Redirect target must belong to the same tenant.", 400)
            if target_row.get("redirect_target_host") == row["normalized_host"]:
                raise DomainEngineError(DomainErrorCode.INVALID_REDIRECT_TARGET, "Redirect policy would create a loop.", 400)
            fields["redirect_target_host"] = target_host.normalized_host

        if not fields:
            return ServiceResult({"success": True, "domain": self._public_domain(row)}, 200)

        fields["routing_version"] = int(row.get("routing_version") or 1) + 1
        updated = self.repo.update_domain(row["id"], fields)
        self.routing_cache.invalidate(row["normalized_host"])
        self._event(updated, "domain_updated", {"fields": sorted(fields.keys())})
        return ServiceResult({"success": True, "domain": self._public_domain(updated)}, 200)

    def reconcile_shop_store_bindings_for_user(self, user_id: str) -> ServiceResult:
        """
        Reconcile custom-domain routing after a Shop profile save.

        This is intentionally provider-free: profile saves should not call Vercel
        or DNS providers. They only attach a real businesses row to already-known
        domain rows and enable routing when the domain is already verified.
        """
        rows = self.repo.list_for_user(user_id, "shop")
        reconciled = 0
        enabled = 0
        disabled = 0
        skipped: list[dict[str, Any]] = []

        for row in rows:
            if row.get("deleted_at") or row.get("status") in {"removed", "provider_removal_pending"}:
                skipped.append({"id": row.get("id"), "reason": "removed"})
                continue

            try:
                binding = self._optional_shop_store_binding(row)
            except DomainEngineError as exc:
                if exc.code != DomainErrorCode.STORE_BINDING_AMBIGUOUS:
                    raise
                updated = self._disable_domain_for_store_issue(
                    row,
                    DomainErrorCode.STORE_BINDING_AMBIGUOUS,
                    "Multiple Shop storefronts matched this tenant. Resolve the store binding before routing can turn on.",
                )
                disabled += 1 if updated else 0
                skipped.append({"id": row.get("id"), "reason": exc.code.value})
                continue

            if not binding:
                updated = self._disable_domain_for_store_issue(
                    row,
                    DomainErrorCode.STORE_NOT_CONFIGURED,
                    "Domain verified, but Shop storefront setup is required before routing can turn on.",
                )
                disabled += 1 if updated else 0
                skipped.append({"id": row.get("id"), "reason": DomainErrorCode.STORE_NOT_CONFIGURED.value})
                continue

            can_route = self._domain_is_verified_for_routing(row)
            fields = self._store_binding_fields(binding)
            binding_changed = (
                row.get("resource_type") != fields["resource_type"]
                or row.get("resource_id") != fields["resource_id"]
                or row.get("canonical_store_slug") != fields["canonical_store_slug"]
            )
            should_enable = can_route and not bool(row.get("routing_enabled"))

            if not binding_changed and not should_enable and row.get("last_error_code") not in {
                DomainErrorCode.STORE_NOT_CONFIGURED.value,
                DomainErrorCode.STORE_BINDING_AMBIGUOUS.value,
                DomainErrorCode.STORE_RESOURCE_MISMATCH.value,
            }:
                skipped.append({"id": row.get("id"), "reason": "unchanged"})
                continue

            update_fields: dict[str, Any] = {
                **fields,
                "last_error_code": None if can_route else row.get("last_error_code"),
                "last_error_message": None if can_route else row.get("last_error_message"),
            }
            if should_enable:
                update_fields["routing_enabled"] = True
                update_fields["routing_version"] = int(row.get("routing_version") or 1) + 1
                enabled += 1
            elif binding_changed:
                update_fields["routing_version"] = int(row.get("routing_version") or 1) + 1

            updated = self.repo.update_domain(row["id"], update_fields)
            self._invalidate_routing_hosts(updated)
            self._event(updated, "store_binding_reconciled", {
                "routing_enabled": bool(updated.get("routing_enabled")),
                "resource_id": fields["resource_id"],
                "canonical_store_slug": fields["canonical_store_slug"],
            })
            reconciled += 1

        return ServiceResult({
            "success": True,
            "reconciled": reconciled,
            "enabled": enabled,
            "disabled": disabled,
            "skipped": skipped,
        }, 200)

    def resolve_host(self, raw_host: str) -> ServiceResult:
        host = normalize_host(raw_host)
        cached = self.routing_cache.get(host.normalized_host)
        if cached:
            cached_row = self.repo.find_routing_host(cached.normalized_host)
            try:
                if cached_row and int(cached_row.get("routing_version") or 1) == cached.routing_version:
                    binding = self._require_shop_store_binding(cached_row, persist=False)
                    if binding["url_slug"] == cached.store_slug:
                        return ServiceResult({"success": True, "routing": asdict(cached), "cache": "hit"}, 200)
            except DomainEngineError:
                self.routing_cache.invalidate(host.normalized_host)
                raise
            self.routing_cache.invalidate(host.normalized_host)

        row = self.repo.find_routing_host(host.normalized_host)
        alias_host = None
        if not row and host.domain_kind == "www" and host.apex_host != host.normalized_host:
            row = self.repo.find_routing_host(host.apex_host)
            alias_host = host.normalized_host if row else None

        if not row:
            row = self.repo.find_claimed_host(host.normalized_host)
            if not row and host.domain_kind == "www" and host.apex_host != host.normalized_host:
                row = self.repo.find_claimed_host(host.apex_host)
                alias_host = host.normalized_host if row else None

        if not row:
            raise DomainEngineError(DomainErrorCode.DOMAIN_NOT_CONFIGURED, "Domain is not configured.", status_code=404)
        if row.get("deleted_at") or row.get("status") != "active":
            raise DomainEngineError(DomainErrorCode.DOMAIN_NOT_ACTIVE, "Domain is not active.", status_code=404)
        if not row.get("routing_enabled"):
            if row.get("last_error_code") in {
                DomainErrorCode.STORE_NOT_CONFIGURED.value,
                DomainErrorCode.STORE_BINDING_AMBIGUOUS.value,
                DomainErrorCode.STORE_RESOURCE_MISMATCH.value,
            }:
                raise DomainEngineError(
                    DomainErrorCode(row["last_error_code"]),
                    row.get("last_error_message") or "Shop storefront setup is required before routing can turn on.",
                    status_code=404,
                )
            raise DomainEngineError(DomainErrorCode.DOMAIN_NOT_ACTIVE, "Domain is not active.", status_code=404)

        binding = self._require_shop_store_binding(row, persist=False)

        entry = self.routing_cache.set(host.normalized_host, {
            "domain_id": row["id"],
            "tenant_id": row["tenant_id"],
            "user_id": row["user_id"],
            "product_domain": row["product_domain"],
            "normalized_host": row["normalized_host"],
            "routing_version": int(row.get("routing_version") or 1),
            "routing_enabled": bool(row.get("routing_enabled")),
            "status": row["status"],
            "store_slug": binding["url_slug"],
            "alias_host": alias_host,
        })
        return ServiceResult({"success": True, "routing": asdict(entry), "cache": "miss"}, 200)

    def _add_domain_after_idempotency(
        self,
        user_id: str,
        product_domain: str,
        host: NormalizedHost,
        setup_mode: str,
    ) -> ServiceResult:
        existing = self.repo.find_claimed_host(host.normalized_host)
        if existing:
            if existing.get("user_id") == user_id:
                if existing.get("status") == "failed" and existing.get("provider_status") == "failed" and not existing.get("routing_enabled"):
                    return self._retry_failed_provider_assignment(existing, host, setup_mode)
                raise DomainEngineError(DomainErrorCode.DOMAIN_ALREADY_ATTACHED, "Domain is already attached to this tenant.", 409)
            raise DomainEngineError(DomainErrorCode.DOMAIN_CONFLICT, "Domain is already claimed.", 409)

        tenant_id = user_id
        token = self._ownership_token(tenant_id, host.normalized_host)
        expected_records = self._expected_setup_records(host, token, setup_mode)
        desired_nameservers = self.provider.get_managed_nameservers() if setup_mode == "nameserver" else []
        managed_records = self._managed_dns_records(host, token) if setup_mode == "nameserver" else []
        store_binding = self._resolve_shop_store_binding(user_id)
        row = self.repo.create_domain({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "product_domain": product_domain,
            "display_host": host.display_host,
            "normalized_host": host.normalized_host,
            "ascii_host": host.ascii_host,
            "unicode_skeleton": host.unicode_skeleton,
            "apex_host": host.apex_host,
            "domain_kind": host.domain_kind,
            "verification_token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
            "expected_records": self._expected_records_payload(
                expected_records,
                setup_mode,
                desired_nameservers=desired_nameservers,
                managed_records=managed_records,
                nameserver_status="pending" if setup_mode == "nameserver" else "not_applicable",
                managed_dns_status="pending" if setup_mode == "nameserver" else "not_applicable",
            ),
            "setup_mode": setup_mode,
            "nameserver_status": "pending" if setup_mode == "nameserver" else "not_applicable",
            "managed_dns_status": "pending" if setup_mode == "nameserver" else "not_applicable",
            "desired_nameservers": desired_nameservers,
            "managed_dns_records": {"records": [record.to_dict() for record in managed_records]},
            **self._store_binding_fields(store_binding),
            "status": "pending_dns",
            "dns_status": "pending",
            "ssl_status": "pending",
            "provider_status": "pending",
            "ownership_status": "pending",
        })

        try:
            provider_result = self.provider.add_domain(host)
            row = self.repo.update_domain(row["id"], {
                "provider_status": "verified" if provider_result.verified else "assigned",
                "provider_domain_id": provider_result.provider_domain_id,
                "provider_last_response": provider_result.raw,
            })
            self._event(row, "domain_created", {"provider": "vercel", "setup_mode": setup_mode})
        except DomainEngineError as exc:
            row = self.repo.update_domain(row["id"], {
                "provider_status": "failed",
                "status": "failed",
                "last_error_code": exc.code.value,
                "last_error_message": exc.message,
                "next_check_at": self._future(minutes=15),
            })
            self._event(row, "provider_failed", {"error": exc.code.value})
            raise

        return ServiceResult({
            "success": True,
            "domain": self._public_domain(row, include_records=True),
            "verificationToken": token,
        }, 201)

    def _retry_failed_provider_assignment(self, row: dict[str, Any], host: NormalizedHost, setup_mode: str) -> ServiceResult:
        token = self._ownership_token(row["tenant_id"], host.normalized_host)
        setup_mode = self._domain_setup_mode(row, fallback=setup_mode)
        expected_records = self._expected_setup_records(host, token, setup_mode)
        desired_nameservers = self.provider.get_managed_nameservers() if setup_mode == "nameserver" else []
        managed_records = self._managed_dns_records(host, token) if setup_mode == "nameserver" else []
        try:
            provider_result = self.provider.add_domain(host)
        except DomainEngineError as exc:
            updated = self.repo.update_domain(row["id"], {
                "last_error_code": exc.code.value,
                "last_error_message": exc.message,
                "next_check_at": self._future(minutes=15),
                "provider_status": "failed",
                "status": "failed",
            })
            self._event(updated, "provider_retry_failed", {"error": exc.code.value})
            raise

        updated = self.repo.update_domain(row["id"], {
            "expected_records": self._expected_records_payload(
                expected_records,
                setup_mode,
                desired_nameservers=desired_nameservers,
                managed_records=managed_records,
                nameserver_status="pending" if setup_mode == "nameserver" else "not_applicable",
                managed_dns_status="pending" if setup_mode == "nameserver" else "not_applicable",
            ),
            "setup_mode": setup_mode,
            "nameserver_status": "pending" if setup_mode == "nameserver" else "not_applicable",
            "managed_dns_status": "pending" if setup_mode == "nameserver" else "not_applicable",
            "desired_nameservers": desired_nameservers,
            "managed_dns_records": {"records": [record.to_dict() for record in managed_records]},
            "provider_status": "verified" if provider_result.verified else "assigned",
            "provider_domain_id": provider_result.provider_domain_id,
            "provider_last_response": provider_result.raw,
            "status": "pending_dns",
            "dns_status": "pending",
            "ssl_status": "pending",
            "ownership_status": "pending",
            "last_error_code": None,
            "last_error_message": None,
            "next_check_at": None,
        })
        self._event(updated, "provider_retry_succeeded", {"provider": provider_result.raw.get("provider", "vercel")})
        return ServiceResult({
            "success": True,
            "domain": self._public_domain(updated, include_records=True),
            "verificationToken": token,
        }, 200)

    def _verify_nameserver_domain(self, row: dict[str, Any], host: NormalizedHost, token: str) -> ServiceResult:
        desired_nameservers = self.provider.get_managed_nameservers()
        expected_records = [record.to_dict() for record in self.dns.expected_nameserver_records(host, desired_nameservers)]
        dns_result = self.dns.verify_nameservers(host, desired_nameservers)
        self.repo.record_attempt({
            "domain_id": row["id"],
            "attempt_type": "dns",
            "result": "success" if dns_result.verified else "pending",
            "observed_records": dns_result.observed_records,
            "error_code": dns_result.error_code.value if dns_result.error_code else None,
            "error_message": dns_result.message,
            "duration_ms": dns_result.duration_ms,
        })

        if not dns_result.verified:
            updated = self.repo.update_domain(row["id"], {
                "expected_records": self._expected_records_payload(
                    expected_records,
                    "nameserver",
                    desired_nameservers=desired_nameservers,
                    nameserver_status="failed" if dns_result.error_code == DomainErrorCode.NAMESERVER_MISMATCH else "pending",
                    managed_dns_status="pending",
                ),
                "observed_records": dns_result.observed_records,
                "desired_nameservers": desired_nameservers,
                "ownership_status": "pending",
                "nameserver_status": "failed" if dns_result.error_code == DomainErrorCode.NAMESERVER_MISMATCH else "pending",
                "dns_status": "propagation_pending" if dns_result.error_code == DomainErrorCode.DNS_PROPAGATION_PENDING else "failed",
                "status": "pending_dns",
                "last_checked_at": self._now(),
                "next_check_at": self._future(minutes=10),
                "retry_count": int(row.get("retry_count") or 0) + 1,
                "last_error_code": dns_result.error_code.value if dns_result.error_code else None,
                "last_error_message": dns_result.message,
            })
            return ServiceResult({"success": True, "domain": self._public_domain(updated, include_records=True)}, 200)

        managed_records = self._managed_dns_records(host, token)
        try:
            managed_dns_result = self.provider.ensure_dns_records(host.apex_host, managed_records)
            managed_dns_status = "synced"
            managed_dns_error: DomainEngineError | None = None
        except DomainEngineError as exc:
            managed_dns_result = {"error": exc.to_dict()}
            managed_dns_status = "failed"
            managed_dns_error = exc

        if managed_dns_error:
            updated = self.repo.update_domain(row["id"], {
                "expected_records": self._expected_records_payload(
                    expected_records,
                    "nameserver",
                    desired_nameservers=desired_nameservers,
                    managed_records=managed_records,
                    nameserver_status="verified",
                    managed_dns_status=managed_dns_status,
                ),
                "observed_records": dns_result.observed_records,
                "desired_nameservers": desired_nameservers,
                "managed_dns_records": {
                    "records": [record.to_dict() for record in managed_records],
                    "lastResponse": managed_dns_result,
                },
                "ownership_status": "verified",
                "nameserver_status": "verified",
                "managed_dns_status": managed_dns_status,
                "dns_status": "verified",
                "status": "verified",
                "last_checked_at": self._now(),
                "next_check_at": self._future(minutes=15),
                "last_error_code": DomainErrorCode.MANAGED_DNS_FAILED.value,
                "last_error_message": managed_dns_error.message,
            })
            self._event(updated, "managed_dns_failed", {"error": managed_dns_error.code.value})
            return ServiceResult({"success": True, "domain": self._public_domain(updated, include_records=True)}, 200)

        provider_result = self.provider.verify_domain(host)
        active = provider_result.verified
        binding = self._optional_shop_store_binding(row)
        routing_enabled = active and binding is not None
        new_version = int(row.get("routing_version") or 1) + (1 if routing_enabled != bool(row.get("routing_enabled")) else 0)
        updated = self.repo.update_domain(row["id"], {
            "expected_records": self._expected_records_payload(
                expected_records,
                "nameserver",
                desired_nameservers=desired_nameservers,
                managed_records=managed_records,
                nameserver_status="verified",
                managed_dns_status=managed_dns_status,
            ),
            "observed_records": dns_result.observed_records,
            "desired_nameservers": desired_nameservers,
            "managed_dns_records": {
                "records": [record.to_dict() for record in managed_records],
                "lastResponse": managed_dns_result,
            },
            "ownership_status": "verified",
            "nameserver_status": "verified",
            "managed_dns_status": managed_dns_status,
            "dns_status": "verified",
            "provider_status": "verified" if provider_result.verified else "assigned",
            "ssl_status": "active" if provider_result.certificate_active or provider_result.verified else "pending",
            "status": "active" if active else "verified",
            "routing_enabled": routing_enabled,
            "routing_version": new_version,
            **self._store_binding_fields(binding),
            "verified_at": self._now(),
            "ssl_active_at": self._now() if provider_result.certificate_active or provider_result.verified else None,
            "last_checked_at": self._now(),
            "last_error_code": None if routing_enabled or not active else DomainErrorCode.STORE_NOT_CONFIGURED.value,
            "last_error_message": None if routing_enabled or not active else "Domain verified, but Shop storefront setup is required before routing can turn on.",
            "provider_last_response": provider_result.raw,
        })
        if routing_enabled:
            self.routing_cache.invalidate(host.normalized_host)
        self._event(updated, "domain_verified", {"routing_enabled": routing_enabled, "setup_mode": "nameserver"})
        return ServiceResult({"success": True, "domain": self._public_domain(updated, include_records=True)}, 200)

    def _expected_setup_records(self, host: NormalizedHost, token: str, setup_mode: str) -> list[dict[str, Any]]:
        if setup_mode == "nameserver":
            return [
                record.to_dict()
                for record in self.dns.expected_nameserver_records(host, self.provider.get_managed_nameservers())
            ]
        return [record.to_dict() for record in self.dns.expected_records(host, token)]

    def _expected_records_payload(
        self,
        records: list[dict[str, Any]],
        setup_mode: str,
        *,
        desired_nameservers: list[str] | None = None,
        managed_records: list[ProviderDnsRecord] | None = None,
        nameserver_status: str | None = None,
        managed_dns_status: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "records": records,
            "setupMode": setup_mode,
        }
        if desired_nameservers is not None:
            payload["desiredNameservers"] = desired_nameservers
        if managed_records is not None:
            payload["managedRecords"] = [record.to_dict() for record in managed_records]
        if nameserver_status is not None:
            payload["nameserverStatus"] = nameserver_status
        if managed_dns_status is not None:
            payload["managedDnsStatus"] = managed_dns_status
        return payload

    def _domain_setup_mode(self, row: dict[str, Any], fallback: str = "manual_dns") -> str:
        stored = row.get("setup_mode")
        if stored:
            return self._normalize_setup_mode(stored)

        expected_records = row.get("expected_records") or {}
        metadata_mode = expected_records.get("setupMode") or expected_records.get("setup_mode")
        if metadata_mode:
            return self._normalize_setup_mode(str(metadata_mode))

        return self._normalize_setup_mode(fallback)

    def _managed_dns_records(self, host: NormalizedHost, token: str) -> list[ProviderDnsRecord]:
        records = [ProviderDnsRecord("TXT", "_flowauxi", token)]
        if host.domain_kind == "apex":
            records.append(ProviderDnsRecord("A", "", VERCEL_APEX_A_RECORD))
        else:
            relative_name = self._relative_record_name(host.normalized_host, host.apex_host)
            records.append(ProviderDnsRecord("CNAME", relative_name, VERCEL_CNAME_TARGET))
        return records

    def _relative_record_name(self, normalized_host: str, apex_host: str) -> str:
        if normalized_host == apex_host:
            return ""
        suffix = f".{apex_host}"
        if normalized_host.endswith(suffix):
            return normalized_host[: -len(suffix)]
        return normalized_host

    def _normalize_setup_mode(self, setup_mode: str | None) -> str:
        normalized = (setup_mode or "nameserver").strip().lower().replace("-", "_")
        if normalized not in DOMAIN_SETUP_MODES:
            raise DomainEngineError(DomainErrorCode.INVALID_SETUP_MODE, "Invalid domain setup mode.", 400)
        return normalized

    def _ensure_product_supported(self, product_domain: str) -> None:
        if product_domain not in SUPPORTED_PRODUCTS:
            raise DomainEngineError(DomainErrorCode.PRODUCT_NOT_SUPPORTED, "Only Shop custom domains are supported in Phase 1.", 400)

    def _ensure_entitlement_before_conflict_lookup(self, user_id: str, product_domain: str) -> None:
        try:
            from services.feature_gate_engine import get_feature_gate_engine
            decision = get_feature_gate_engine().check_feature_access(user_id, product_domain, DNS_CUSTOM_DOMAIN_FEATURE)
            if not decision.allowed:
                raise DomainEngineError(
                    DomainErrorCode.ENTITLEMENT_REQUIRED,
                    "Custom DNS domains require the Pro plan.",
                    status_code=403,
                )
        except DomainEngineError:
            raise
        except Exception as exc:
            raise DomainEngineError(
                DomainErrorCode.ENTITLEMENT_REQUIRED,
                "Unable to verify custom domain entitlement.",
                status_code=503,
                retryable=True,
            ) from exc

    def _ensure_quota_before_conflict_lookup(self, user_id: str, product_domain: str) -> None:
        limit = int(os.getenv("DOMAIN_MAX_PER_TENANT", "1"))
        if self.repo.count_active_for_user(user_id, product_domain) >= limit:
            raise DomainEngineError(DomainErrorCode.ENTITLEMENT_EXCEEDED, "Custom domain quota exceeded.", 403)

    def _resolve_shop_store_binding(self, user_id: str) -> dict[str, Any] | None:
        candidates = self.repo.list_shop_store_candidates(user_id)
        if not candidates:
            return None
        if len(candidates) > 1:
            raise DomainEngineError(
                DomainErrorCode.STORE_BINDING_AMBIGUOUS,
                "Multiple Shop storefronts matched this tenant. Resolve the store binding before enabling routing.",
                status_code=409,
            )
        return candidates[0]

    def _optional_shop_store_binding(self, row: dict[str, Any]) -> dict[str, Any] | None:
        if row.get("resource_type") and row.get("resource_type") != "shop_store":
            raise DomainEngineError(
                DomainErrorCode.STORE_RESOURCE_MISMATCH,
                "Domain is not bound to a Shop storefront.",
                status_code=409,
            )

        if row.get("resource_id"):
            store = self.repo.get_shop_store_by_id(str(row["resource_id"]), row["user_id"])
            if not store:
                return None
            return store

        return self._resolve_shop_store_binding(row["user_id"])

    def _domain_is_verified_for_routing(self, row: dict[str, Any]) -> bool:
        return (
            row.get("status") == "active"
            and row.get("dns_status") == "verified"
            and row.get("provider_status") == "verified"
            and row.get("ownership_status") == "verified"
            and row.get("ssl_status") == "active"
        )

    def _require_shop_store_binding(self, row: dict[str, Any], *, persist: bool) -> dict[str, Any]:
        binding = self._optional_shop_store_binding(row)
        if not binding:
            if row.get("routing_enabled"):
                self._disable_domain_for_store_issue(
                    row,
                    DomainErrorCode.STORE_NOT_CONFIGURED,
                    "Domain verified, but Shop storefront setup is required before routing can turn on.",
                )
            raise DomainEngineError(
                DomainErrorCode.STORE_NOT_CONFIGURED,
                "The custom domain is active, but the Shop storefront is not configured for this tenant.",
                status_code=404,
            )

        if persist and (
            row.get("resource_type") != "shop_store"
            or row.get("resource_id") != binding["id"]
            or row.get("canonical_store_slug") != binding["url_slug"]
        ):
            self.repo.update_domain(row["id"], self._store_binding_fields(binding))
        return binding

    def _store_binding_fields(self, binding: dict[str, Any] | None) -> dict[str, Any]:
        if not binding:
            return {
                "resource_type": None,
                "resource_id": None,
                "canonical_store_slug": None,
            }
        return {
            "resource_type": "shop_store",
            "resource_id": binding["id"],
            "canonical_store_slug": binding["url_slug"],
        }

    def _disable_domain_for_store_issue(
        self,
        row: dict[str, Any],
        code: DomainErrorCode,
        message: str,
    ) -> dict[str, Any] | None:
        fields = {
            "last_error_code": code.value,
            "last_error_message": message,
        }
        if row.get("routing_enabled"):
            fields["routing_enabled"] = False
            fields["routing_version"] = int(row.get("routing_version") or 1) + 1
        elif row.get("last_error_code") == code.value and row.get("last_error_message") == message:
            return None

        updated = self.repo.update_domain(row["id"], fields)
        self._invalidate_routing_hosts(updated)
        self._event(updated, "routing_disabled_store_missing", {"reason": code.value})
        return updated

    def _invalidate_routing_hosts(self, row: dict[str, Any]) -> None:
        normalized_host = row.get("normalized_host")
        apex_host = row.get("apex_host")
        if normalized_host:
            self.routing_cache.invalidate(normalized_host)
        if apex_host and normalized_host == apex_host:
            self.routing_cache.invalidate(f"www.{apex_host}")
        elif apex_host:
            self.routing_cache.invalidate(apex_host)

    def _require_domain(self, user_id: str, domain_id: str) -> dict[str, Any]:
        row = self.repo.get_for_user(domain_id, user_id)
        if not row:
            raise DomainEngineError(DomainErrorCode.DOMAIN_NOT_CONFIGURED, "Domain was not found.", 404)
        return row

    def _public_domain(self, row: dict[str, Any], *, include_records: bool = False) -> dict[str, Any]:
        expected_metadata = row.get("expected_records") or {}
        setup_mode = self._domain_setup_mode(row)
        nameserver_status = row.get("nameserver_status") or expected_metadata.get("nameserverStatus")
        if not nameserver_status:
            nameserver_status = "pending" if setup_mode == "nameserver" else "not_applicable"
        managed_dns_status = row.get("managed_dns_status") or expected_metadata.get("managedDnsStatus")
        if not managed_dns_status:
            managed_dns_status = "pending" if setup_mode == "nameserver" else "not_applicable"

        body = {
            "id": row["id"],
            "host": row["display_host"],
            "normalizedHost": row["normalized_host"],
            "apexHost": row.get("apex_host"),
            "setupMode": setup_mode,
            "productDomain": row["product_domain"],
            "status": row["status"],
            "dnsStatus": row["dns_status"],
            "sslStatus": row["ssl_status"],
            "providerStatus": row["provider_status"],
            "ownershipStatus": row["ownership_status"],
            "nameserverStatus": nameserver_status,
            "managedDnsStatus": managed_dns_status,
            "desiredNameservers": row.get("desired_nameservers") or expected_metadata.get("desiredNameservers") or [],
            "resourceType": row.get("resource_type"),
            "resourceId": row.get("resource_id"),
            "canonicalStoreSlug": row.get("canonical_store_slug"),
            "routingEnabled": row["routing_enabled"],
            "routingVersion": row["routing_version"],
            "isPrimary": row["is_primary"],
            "redirectPolicy": row["redirect_policy"],
            "lastErrorCode": row.get("last_error_code"),
            "lastErrorMessage": row.get("last_error_message"),
            "nextCheckAt": row.get("next_check_at"),
            "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"),
        }
        if include_records:
            body["expectedRecords"] = expected_metadata.get("records", [])
            body["observedRecords"] = row.get("observed_records") or {}
            managed_records = row.get("managed_dns_records") or {}
            body["managedRecords"] = managed_records.get("records") or expected_metadata.get("managedRecords") or []
        return body

    def _ownership_token(self, tenant_id: str, normalized_host: str) -> str:
        secret = os.getenv("DOMAIN_OWNERSHIP_SECRET") or os.getenv("CONTEXT_SIGNING_SECRET")
        if not secret:
            if os.getenv("FLASK_ENV") == "production":
                raise DomainEngineError(DomainErrorCode.INTERNAL_ERROR, "Domain ownership secret is not configured.", 500)
            secret = "dev-domain-ownership-secret"
        digest = hmac.new(secret.encode("utf-8"), f"{tenant_id}:{normalized_host}".encode("utf-8"), hashlib.sha256).hexdigest()
        return f"flowauxi-domain-verification={digest}"

    def _payload_hash(self, payload: dict[str, Any]) -> str:
        stable = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(stable.encode("utf-8")).hexdigest()

    def _store_idempotency(
        self,
        namespace: str,
        payload_hash: str,
        state: str,
        *,
        response_body: dict[str, Any] | None = None,
        status_code: int | None = None,
        expires_hours: int,
    ) -> None:
        self.repo.store_idempotency({
            "namespace": namespace,
            "payload_hash": payload_hash,
            "state": state,
            "response_body": response_body,
            "status_code": status_code,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=expires_hours)).isoformat(),
        })

    def _event(self, row: dict[str, Any], event_type: str, metadata: dict[str, Any]) -> None:
        self.repo.record_event({
            "domain_id": row["id"],
            "tenant_id": row["tenant_id"],
            "user_id": row["user_id"],
            "event_type": event_type,
            "actor_id": row["user_id"],
            "metadata": metadata,
        })

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _future(self, *, minutes: int = 0, hours: int = 0) -> str:
        return (datetime.now(timezone.utc) + timedelta(minutes=minutes, hours=hours)).isoformat()


_service: CustomDomainService | None = None


def get_custom_domain_service() -> CustomDomainService:
    global _service
    if _service is None:
        _service = CustomDomainService()
    return _service
