from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import requests

from domains.custom_domains.domain.errors import DomainEngineError, DomainErrorCode
from domains.custom_domains.domain.normalization import NormalizedHost


@dataclass(frozen=True)
class ProviderDomainResult:
    host: str
    provider_domain_id: str | None = None
    verified: bool = False
    certificate_active: bool = False
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderDnsRecord:
    type: str
    name: str
    value: str
    ttl: int = 300

    def to_provider_payload(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "value": self.value,
            "ttl": self.ttl,
            "comment": "Managed by Flowauxi custom domain engine",
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "value": self.value,
            "ttl": self.ttl,
        }


class DomainProvider(ABC):
    @abstractmethod
    def add_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        raise NotImplementedError

    @abstractmethod
    def get_domain(self, host: NormalizedHost) -> ProviderDomainResult | None:
        raise NotImplementedError

    @abstractmethod
    def verify_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        raise NotImplementedError

    @abstractmethod
    def remove_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        raise NotImplementedError

    @abstractmethod
    def get_certificate_status(self, host: NormalizedHost) -> str:
        raise NotImplementedError

    @abstractmethod
    def get_managed_nameservers(self) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def ensure_dns_records(self, apex_host: str, records: list[ProviderDnsRecord]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def normalize_provider_error(self, response: requests.Response | None, error: Exception | None = None) -> DomainEngineError:
        raise NotImplementedError


class DevelopmentDomainProvider(DomainProvider):
    """No-op provider for local visual testing.

    It never proves DNS or TLS ownership; it only lets the dashboard create,
    list, and remove local domain rows without requiring real Vercel tokens.
    """

    def __init__(self):
        self._domains: dict[str, ProviderDomainResult] = {}

    def add_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        existing = self._domains.get(host.normalized_host)
        if existing:
            return existing
        result = ProviderDomainResult(
            host=host.normalized_host,
            provider_domain_id=f"dev:{host.normalized_host}",
            verified=False,
            certificate_active=False,
            raw={
                "provider": "development",
                "message": "Local development provider. DNS and SSL remain pending until real provider verification is configured.",
            },
        )
        self._domains[host.normalized_host] = result
        return result

    def get_domain(self, host: NormalizedHost) -> ProviderDomainResult | None:
        return self._domains.get(host.normalized_host)

    def verify_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        return self.add_domain(host)

    def remove_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        self._domains.pop(host.normalized_host, None)
        return ProviderDomainResult(
            host=host.normalized_host,
            verified=False,
            certificate_active=False,
            raw={"provider": "development", "removed": True},
        )

    def get_certificate_status(self, host: NormalizedHost) -> str:
        return "pending"

    def get_managed_nameservers(self) -> list[str]:
        return get_configured_nameservers()

    def ensure_dns_records(self, apex_host: str, records: list[ProviderDnsRecord]) -> dict[str, Any]:
        return {
            "provider": "development",
            "apexHost": apex_host,
            "records": [record.to_dict() for record in records],
            "managed": False,
        }

    def normalize_provider_error(self, response: requests.Response | None, error: Exception | None = None) -> DomainEngineError:
        return DomainEngineError(
            DomainErrorCode.PROVIDER_UNAVAILABLE,
            "Development domain provider does not expose provider errors.",
            status_code=503,
            retryable=True,
        )


class VercelDomainProvider(DomainProvider):
    def __init__(
        self,
        token: str | None = None,
        project_id_or_name: str | None = None,
        team_id: str | None = None,
        api_base: str | None = None,
    ):
        self.token = token or os.getenv("VERCEL_API_TOKEN")
        self.project_id_or_name = project_id_or_name or os.getenv("VERCEL_PROJECT_ID") or os.getenv("VERCEL_PROJECT_NAME")
        self.team_id = team_id or os.getenv("VERCEL_TEAM_ID")
        self.api_base = (api_base or os.getenv("VERCEL_API_BASE") or "https://api.vercel.com").rstrip("/")

    def add_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        response = self._request("POST", self._project_domain_url(), json={"name": host.normalized_host})
        if response.status_code in (400, 409):
            existing = self._get_existing_project_domain(host)
            if existing:
                return existing
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        return self._map_result(host, response.json())

    def get_domain(self, host: NormalizedHost) -> ProviderDomainResult | None:
        response = self._request("GET", f"{self._project_domain_url()}/{host.normalized_host}")
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        return self._map_result(host, response.json())

    def _get_existing_project_domain(self, host: NormalizedHost) -> ProviderDomainResult | None:
        try:
            return self.get_domain(host)
        except DomainEngineError:
            return None

    def verify_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        response = self._request("POST", f"{self._project_domain_url()}/{host.normalized_host}/verify")
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        return self._map_result(host, response.json())

    def remove_domain(self, host: NormalizedHost) -> ProviderDomainResult:
        response = self._request("DELETE", f"{self._project_domain_url()}/{host.normalized_host}")
        if response.status_code in (404, 204):
            return ProviderDomainResult(host=host.normalized_host, verified=False, certificate_active=False, raw={})
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        raw = response.json() if response.content else {}
        return ProviderDomainResult(host=host.normalized_host, verified=False, certificate_active=False, raw=raw)

    def get_certificate_status(self, host: NormalizedHost) -> str:
        domain = self.get_domain(host)
        if not domain:
            return "pending"
        return "active" if domain.certificate_active or domain.verified else "pending"

    def get_managed_nameservers(self) -> list[str]:
        return get_configured_nameservers()

    def ensure_dns_records(self, apex_host: str, records: list[ProviderDnsRecord]) -> dict[str, Any]:
        self._require_provider_config()
        existing_records = self._list_dns_records(apex_host)
        changes: list[dict[str, Any]] = []
        for record in records:
            existing = self._find_dns_record(existing_records, record)
            if existing:
                current_value = str(existing.get("value") or "").rstrip(".").lower()
                wanted_value = record.value.rstrip(".").lower()
                current_ttl = int(existing.get("ttl") or record.ttl)
                if current_value == wanted_value and current_ttl == record.ttl:
                    changes.append({"action": "unchanged", "record": record.to_dict(), "providerRecord": existing})
                    continue
                updated = self._update_dns_record(str(existing.get("id") or existing.get("uid")), record)
                changes.append({"action": "updated", "record": record.to_dict(), "providerRecord": updated})
                continue
            created = self._create_dns_record(apex_host, record)
            changes.append({"action": "created", "record": record.to_dict(), "providerRecord": created})
        return {"provider": "vercel", "apexHost": apex_host, "changes": changes}

    def normalize_provider_error(self, response: requests.Response | None, error: Exception | None = None) -> DomainEngineError:
        if error is not None:
            return DomainEngineError(
                DomainErrorCode.PROVIDER_UNAVAILABLE,
                "Domain provider is unavailable.",
                status_code=503,
                retryable=True,
            )
        if response is None:
            return DomainEngineError(DomainErrorCode.PROVIDER_UNAVAILABLE, "Domain provider returned no response.", 503, True)
        if response.status_code == 409:
            return DomainEngineError(DomainErrorCode.DOMAIN_PROVIDER_CONFLICT, "Domain is already assigned at provider.", 409)
        if response.status_code == 429:
            return DomainEngineError(DomainErrorCode.PROVIDER_RATE_LIMITED, "Domain provider rate limit exceeded.", 429, True)
        if response.status_code >= 500:
            return DomainEngineError(DomainErrorCode.PROVIDER_UNAVAILABLE, "Domain provider failed.", 503, True)
        return DomainEngineError(DomainErrorCode.PROVIDER_VERIFICATION_REQUIRED, "Domain provider rejected the request.", 400)

    def _project_domain_url(self) -> str:
        self._require_provider_config()
        return f"{self.api_base}/v10/projects/{self.project_id_or_name}/domains"

    def _require_provider_config(self) -> None:
        if not self.token or not self.project_id_or_name:
            raise DomainEngineError(
                DomainErrorCode.PROVIDER_UNAVAILABLE,
                "Vercel domain provider is not configured.",
                status_code=503,
                retryable=True,
            )

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        params = kwargs.pop("params", {}) or {}
        if self.team_id:
            params["teamId"] = self.team_id
        try:
            return requests.request(
                method,
                url,
                params=params,
                timeout=8,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
                **kwargs,
            )
        except requests.RequestException as exc:
            raise self.normalize_provider_error(None, exc) from exc

    def _dns_url(self, apex_host: str) -> str:
        return f"{self.api_base}/v2/domains/{apex_host}/records"

    def _list_dns_records(self, apex_host: str) -> list[dict[str, Any]]:
        response = self._request("GET", f"{self.api_base}/v4/domains/{apex_host}/records", params={"limit": "100"})
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        raw = response.json()
        if isinstance(raw, dict):
            return raw.get("records") or raw.get("data") or raw.get("result") or []
        if isinstance(raw, list):
            return raw
        return []

    def _find_dns_record(self, records: list[dict[str, Any]], wanted: ProviderDnsRecord) -> dict[str, Any] | None:
        wanted_name = self._normalize_record_name(wanted.name)
        wanted_type = wanted.type.upper()
        for record in records:
            record_type = str(record.get("type") or record.get("recordType") or "").upper()
            record_name = self._normalize_record_name(str(record.get("name") or ""))
            if record_type == wanted_type and record_name == wanted_name:
                return record
        return None

    def _create_dns_record(self, apex_host: str, record: ProviderDnsRecord) -> dict[str, Any]:
        response = self._request("POST", self._dns_url(apex_host), json=record.to_provider_payload())
        if response.status_code == 409:
            return {"conflict": True, "record": record.to_dict()}
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        return response.json() if response.content else {}

    def _update_dns_record(self, record_id: str, record: ProviderDnsRecord) -> dict[str, Any]:
        if not record_id:
            return {"skipped": True, "reason": "missing_record_id", "record": record.to_dict()}
        response = self._request(
            "PATCH",
            f"{self.api_base}/v1/domains/records/{record_id}",
            json=record.to_provider_payload(),
        )
        if response.status_code >= 400:
            raise self.normalize_provider_error(response)
        return response.json() if response.content else {}

    def _normalize_record_name(self, name: str) -> str:
        return "" if name in {"@", "."} else name.rstrip(".").lower()

    def _map_result(self, host: NormalizedHost, raw: dict[str, Any]) -> ProviderDomainResult:
        verified = bool(raw.get("verified") or raw.get("configuredBy"))
        cert_active = bool(raw.get("certificate") or raw.get("cert") or raw.get("verified"))
        provider_id = raw.get("id") or raw.get("name") or host.normalized_host
        return ProviderDomainResult(
            host=host.normalized_host,
            provider_domain_id=provider_id,
            verified=verified,
            certificate_active=cert_active,
            raw=raw,
        )


def get_default_domain_provider() -> DomainProvider:
    mode = (os.getenv("DOMAIN_PROVIDER_MODE") or "").strip().lower()
    environment = (os.getenv("FLASK_ENV") or os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
    has_vercel_config = bool(
        os.getenv("VERCEL_API_TOKEN")
        and (os.getenv("VERCEL_PROJECT_ID") or os.getenv("VERCEL_PROJECT_NAME"))
    )

    if mode in {"development", "dev", "mock", "noop"}:
        if environment == "production":
            raise DomainEngineError(
                DomainErrorCode.PROVIDER_UNAVAILABLE,
                "Development domain provider cannot be used in production.",
                status_code=503,
                retryable=False,
            )
        return DevelopmentDomainProvider()

    if mode in {"vercel", "production"} or has_vercel_config or environment == "production":
        return VercelDomainProvider()

    return DevelopmentDomainProvider()


def get_configured_nameservers() -> list[str]:
    raw_nameservers = os.getenv("VERCEL_MANAGED_NAMESERVERS") or "ns1.vercel-dns.com,ns2.vercel-dns.com"
    return [nameserver.strip().rstrip(".").lower() for nameserver in raw_nameservers.split(",") if nameserver.strip()]
