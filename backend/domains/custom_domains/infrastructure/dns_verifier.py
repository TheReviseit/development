from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

from domains.custom_domains.domain.errors import DomainEngineError, DomainErrorCode
from domains.custom_domains.domain.normalization import NormalizedHost

VERCEL_APEX_A_RECORD = "76.76.21.21"
VERCEL_CNAME_TARGET = "cname.vercel-dns.com"


@dataclass(frozen=True)
class ExpectedDnsRecord:
    type: str
    name: str
    value: str
    ttl: int = 300
    required: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "value": self.value,
            "ttl": self.ttl,
            "required": self.required,
        }


@dataclass(frozen=True)
class DnsCheckResult:
    verified: bool
    observed_records: dict[str, list[str]]
    error_code: DomainErrorCode | None = None
    message: str | None = None
    duration_ms: int = 0


class DnsVerifier:
    def expected_records(self, host: NormalizedHost, ownership_token: str) -> list[ExpectedDnsRecord]:
        records = [
            ExpectedDnsRecord("TXT", f"_flowauxi.{host.normalized_host}", ownership_token),
        ]
        if host.domain_kind == "apex":
            records.append(ExpectedDnsRecord("A", host.normalized_host, VERCEL_APEX_A_RECORD))
        else:
            records.append(ExpectedDnsRecord("CNAME", host.normalized_host, VERCEL_CNAME_TARGET))
        return records

    def expected_nameserver_records(self, host: NormalizedHost, nameservers: list[str]) -> list[ExpectedDnsRecord]:
        return [
            ExpectedDnsRecord("NS", host.apex_host, nameserver.rstrip(".").lower())
            for nameserver in nameservers
        ]

    def verify(self, host: NormalizedHost, ownership_token: str) -> DnsCheckResult:
        started = time.monotonic()
        expected = self.expected_records(host, ownership_token)
        observed: dict[str, list[str]] = {}

        try:
            txt_values = self._query("TXT", f"_flowauxi.{host.normalized_host}")
            observed["TXT"] = txt_values
            if not txt_values:
                return self._result(False, observed, DomainErrorCode.OWNERSHIP_TXT_MISSING, started)
            if ownership_token not in txt_values:
                return self._result(False, observed, DomainErrorCode.OWNERSHIP_TXT_MISMATCH, started)

            route_record = expected[1]
            route_values = self._query(route_record.type, route_record.name)
            observed[route_record.type] = route_values
            if not route_values:
                return self._result(False, observed, DomainErrorCode.DNS_PROPAGATION_PENDING, started, retryable=True)

            normalized_values = {value.rstrip(".").lower() for value in route_values}
            expected_value = route_record.value.rstrip(".").lower()
            if expected_value not in normalized_values:
                return self._result(False, observed, DomainErrorCode.DNS_RECORD_MISMATCH, started)

            return self._result(True, observed, None, started)
        except DomainEngineError as exc:
            return self._result(False, observed, exc.code, started, message=exc.message)

    def verify_nameservers(self, host: NormalizedHost, expected_nameservers: list[str]) -> DnsCheckResult:
        started = time.monotonic()
        observed: dict[str, list[str]] = {}
        try:
            ns_values = self._query("NS", host.apex_host)
            observed["NS"] = ns_values
            normalized_observed = {value.rstrip(".").lower() for value in ns_values}
            normalized_expected = {value.rstrip(".").lower() for value in expected_nameservers}
            if not normalized_observed:
                return self._result(False, observed, DomainErrorCode.DNS_PROPAGATION_PENDING, started, retryable=True)
            if not normalized_expected.issubset(normalized_observed):
                return self._result(False, observed, DomainErrorCode.NAMESERVER_MISMATCH, started)
            return self._result(True, observed, None, started)
        except DomainEngineError as exc:
            return self._result(False, observed, exc.code, started, message=exc.message)

    def _query(self, record_type: str, name: str) -> list[str]:
        try:
            import dns.resolver
            import dns.exception
        except ImportError as exc:
            raise DomainEngineError(
                DomainErrorCode.DNS_PROVIDER_ERROR,
            "dnspython is not installed; DNS verification is unavailable.",
                retryable=True,
            ) from exc

        resolver_ips = [
            ip.strip()
            for ip in os.getenv("DNS_RESOLVERS", "8.8.8.8,1.1.1.1").split(",")
            if ip.strip()
        ]
        last_timeout: dns.exception.Timeout | None = None
        last_error: Exception | None = None

        for resolver_ip in resolver_ips:
            resolver = dns.resolver.Resolver(configure=False)
            resolver.nameservers = [resolver_ip]
            resolver.lifetime = 2.0
            resolver.timeout = 1.0
            try:
                answers = resolver.resolve(name, record_type)
                values: list[str] = []
                for answer in answers:
                    if record_type == "TXT":
                        values.append("".join(part.decode("utf-8") for part in answer.strings))
                    else:
                        values.append(str(answer).rstrip("."))
                if values:
                    return values
            except dns.resolver.NXDOMAIN:
                continue
            except dns.resolver.NoAnswer:
                continue
            except dns.exception.Timeout as exc:
                last_timeout = exc
                continue
            except Exception as exc:
                last_error = exc
                continue

        if last_timeout:
            raise DomainEngineError(
                DomainErrorCode.DNS_LOOKUP_TIMEOUT,
                "DNS lookup timed out.",
                retryable=True,
            ) from last_timeout

        if last_error:
            raise DomainEngineError(
                DomainErrorCode.DNS_PROVIDER_ERROR,
                "DNS resolver failed.",
                retryable=True,
            ) from last_error

        return []

    def _result(
        self,
        verified: bool,
        observed: dict[str, list[str]],
        code: DomainErrorCode | None,
        started: float,
        *,
        message: str | None = None,
        retryable: bool = False,
    ) -> DnsCheckResult:
        default_message = code.value if code else None
        return DnsCheckResult(
            verified=verified,
            observed_records=observed,
            error_code=code,
            message=message or default_message,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
