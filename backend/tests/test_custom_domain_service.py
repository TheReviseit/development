import pytest

from domains.custom_domains.application.service import CustomDomainService, DNS_CUSTOM_DOMAIN_FEATURE
from domains.custom_domains.domain.errors import DomainEngineError, DomainErrorCode
from domains.custom_domains.infrastructure.provider import DevelopmentDomainProvider, VercelDomainProvider, get_default_domain_provider
from domains.custom_domains.infrastructure.routing_cache import RoutingCacheEntry


class FakeRepo:
    def __init__(self):
        self.rows = {}
        self.idempotency = {}
        self.events = []
        self.attempts = []
        self.business_slug = "demo-store"

    def list_for_user(self, user_id, product_domain=None):
        return list(self.rows.values())

    def count_active_for_user(self, user_id, product_domain):
        return 0

    def get_for_user(self, domain_id, user_id):
        row = self.rows.get(domain_id)
        return row if row and row["user_id"] == user_id else None

    def find_claimed_host(self, normalized_host):
        return next((row for row in self.rows.values() if row["normalized_host"] == normalized_host and not row.get("deleted_at")), None)

    def find_routing_host(self, normalized_host):
        return next(
            (
                row for row in self.rows.values()
                if row["normalized_host"] == normalized_host and row["routing_enabled"] and row["status"] == "active"
            ),
            None,
        )

    def create_domain(self, data):
        row = {
            "id": f"dom_{len(self.rows) + 1}",
            "is_primary": False,
            "redirect_policy": "none",
            "routing_enabled": False,
            "routing_version": 1,
            "created_at": "2026-05-21T00:00:00Z",
            "updated_at": "2026-05-21T00:00:00Z",
            "last_error_code": None,
            "last_error_message": None,
            "next_check_at": None,
            **data,
        }
        self.rows[row["id"]] = row
        return row

    def update_domain(self, domain_id, fields):
        self.rows[domain_id].update(fields)
        return self.rows[domain_id]

    def get_business_slug(self, user_id):
        return self.business_slug

    def record_attempt(self, data):
        self.attempts.append(data)

    def record_event(self, data):
        self.events.append(data)

    def get_idempotency(self, namespace):
        return self.idempotency.get(namespace)

    def store_idempotency(self, data):
        self.idempotency[data["namespace"]] = data


class FakeLegacyDomainRepo(FakeRepo):
    optional_fields = {
        "setup_mode",
        "nameserver_status",
        "managed_dns_status",
        "desired_nameservers",
        "managed_dns_records",
    }

    def create_domain(self, data):
        return super().create_domain({
            key: value for key, value in data.items() if key not in self.optional_fields
        })

    def update_domain(self, domain_id, fields):
        return super().update_domain(domain_id, {
            key: value for key, value in fields.items() if key not in self.optional_fields
        })


class FakeProvider:
    def __init__(self, fail_remove=False, fail_add=False):
        self.fail_remove = fail_remove
        self.fail_add = fail_add

    def add_domain(self, host):
        if self.fail_add:
            raise DomainEngineError(DomainErrorCode.PROVIDER_UNAVAILABLE, "provider missing", 503, True)
        return type("ProviderResult", (), {
            "provider_domain_id": host.normalized_host,
            "verified": False,
            "certificate_active": False,
            "raw": {"name": host.normalized_host},
        })()

    def verify_domain(self, host):
        return type("ProviderResult", (), {
            "provider_domain_id": host.normalized_host,
            "verified": True,
            "certificate_active": True,
            "raw": {"verified": True},
        })()

    def remove_domain(self, host):
        if self.fail_remove:
            raise DomainEngineError(DomainErrorCode.PROVIDER_UNAVAILABLE, "provider down", 503, True)
        return type("ProviderResult", (), {"raw": {"removed": True}})()

    def get_domain(self, host):
        return None

    def get_certificate_status(self, host):
        return "pending"

    def get_managed_nameservers(self):
        return ["ns1.vercel-dns.com", "ns2.vercel-dns.com"]

    def ensure_dns_records(self, apex_host, records):
        return {"apexHost": apex_host, "records": [record.to_dict() for record in records]}

    def normalize_provider_error(self, response, error=None):
        raise AssertionError("not used")


class FakeDns:
    def expected_records(self, host, token):
        return [type("Record", (), {"to_dict": lambda self: {"type": "TXT", "name": host.normalized_host, "value": token}})()]

    def expected_nameserver_records(self, host, nameservers):
        return [
            type(
                "Record",
                (),
                {
                    "to_dict": lambda self, nameserver=nameserver: {
                        "type": "NS",
                        "name": host.apex_host,
                        "value": nameserver,
                    }
                },
            )()
            for nameserver in nameservers
        ]

    def verify_nameservers(self, host, nameservers):
        return type("DnsResult", (), {
            "verified": True,
            "observed_records": {"NS": nameservers},
            "error_code": None,
            "message": None,
            "duration_ms": 1,
        })()


class FakeCache:
    def __init__(self):
        self.invalidated = []
        self.values = {}

    def get(self, host):
        return self.values.get(host)

    def set(self, host, value):
        entry = RoutingCacheEntry(**value, cached_at=1, expires_at=9999999999)
        self.values[host] = entry
        return entry

    def invalidate(self, host):
        self.invalidated.append(host)
        self.values.pop(host, None)


def service(repo=None, provider=None, cache=None):
    svc = CustomDomainService(
        repository=repo or FakeRepo(),
        provider=provider or FakeProvider(),
        dns_verifier=FakeDns(),
        routing_cache=cache or FakeCache(),
    )
    svc._ensure_entitlement_before_conflict_lookup = lambda user_id, product_domain: None
    svc._ensure_quota_before_conflict_lookup = lambda user_id, product_domain: None
    return svc


def test_add_domain_idempotency_replays_exact_response(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    svc = service(repo=repo)

    first = svc.add_domain("user_1", "Customer.com", "idem-1")
    replay = svc.add_domain("user_1", "customer.com", "idem-1")

    assert first.status_code == 201
    assert replay.replayed is True
    assert replay.body == first.body


def test_add_domain_idempotency_rejects_payload_change(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    svc = service(repo=repo)

    svc.add_domain("user_1", "customer.com", "idem-1")
    namespace = next(iter(repo.idempotency))
    repo.idempotency[namespace]["payload_hash"] = "different-payload-hash"

    with pytest.raises(DomainEngineError) as exc:
        svc.add_domain("user_1", "customer.com", "idem-1")

    assert exc.value.code == DomainErrorCode.IDEMPOTENCY_KEY_REUSED


def test_delete_domain_provider_failure_keeps_local_routing_disabled(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    cache = FakeCache()
    svc = service(repo=repo, provider=FakeProvider(fail_remove=True), cache=cache)
    created = svc.add_domain("user_1", "customer.com", "idem-1").body["domain"]
    repo.update_domain(created["id"], {"routing_enabled": True, "status": "active"})

    result = svc.delete_domain("user_1", created["id"])

    assert result.status_code == 202
    row = repo.rows[created["id"]]
    assert row["routing_enabled"] is False
    assert row["status"] == "provider_removal_pending"
    assert row["last_error_code"] == DomainErrorCode.PROVIDER_REMOVAL_FAILED.value
    assert "customer.com" in cache.invalidated


def test_resolve_host_returns_active_shop_routing(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    svc = service(repo=repo)
    created = svc.add_domain("user_1", "customer.com", "idem-1").body["domain"]
    repo.update_domain(created["id"], {
        "routing_enabled": True,
        "status": "active",
        "provider_status": "verified",
        "dns_status": "verified",
        "ssl_status": "active",
        "ownership_status": "verified",
    })

    result = svc.resolve_host("customer.com")

    assert result.body["routing"]["product_domain"] == "shop"
    assert result.body["routing"]["store_slug"] == "demo-store"


def test_dns_domain_entitlement_uses_pro_only_feature_key():
    assert DNS_CUSTOM_DOMAIN_FEATURE == "custom_dns_domain"


def test_add_domain_defaults_to_nameserver_setup(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    svc = service(repo=repo)

    result = svc.add_domain("user_1", "customer.com", "idem-1")

    domain = result.body["domain"]
    assert domain["setupMode"] == "nameserver"
    assert domain["nameserverStatus"] == "pending"
    assert domain["managedDnsStatus"] == "pending"
    assert domain["desiredNameservers"] == ["ns1.vercel-dns.com", "ns2.vercel-dns.com"]


def test_nameserver_setup_survives_legacy_schema_compatibility(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeLegacyDomainRepo()
    svc = service(repo=repo)

    created = svc.add_domain("user_1", "customer.com", "idem-1").body["domain"]
    stored_row = repo.rows[created["id"]]

    assert "setup_mode" not in stored_row
    assert "desired_nameservers" not in stored_row
    assert created["setupMode"] == "nameserver"
    assert created["desiredNameservers"] == ["ns1.vercel-dns.com", "ns2.vercel-dns.com"]

    verified = svc.verify_domain("user_1", created["id"]).body["domain"]

    assert verified["setupMode"] == "nameserver"
    assert verified["nameserverStatus"] == "verified"
    assert verified["managedDnsStatus"] == "synced"
    assert verified["managedRecords"][0]["type"] == "TXT"


def test_verify_nameserver_domain_syncs_managed_dns(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    svc = service(repo=repo)
    created = svc.add_domain("user_1", "customer.com", "idem-1").body["domain"]

    result = svc.verify_domain("user_1", created["id"])

    domain = result.body["domain"]
    assert domain["ownershipStatus"] == "verified"
    assert domain["dnsStatus"] == "verified"
    assert domain["nameserverStatus"] == "verified"
    assert domain["managedDnsStatus"] == "synced"
    assert domain["managedRecords"][0]["type"] == "TXT"


def test_default_provider_uses_development_provider_without_vercel_config(monkeypatch):
    monkeypatch.delenv("VERCEL_API_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL_PROJECT_ID", raising=False)
    monkeypatch.delenv("VERCEL_PROJECT_NAME", raising=False)
    monkeypatch.delenv("DOMAIN_PROVIDER_MODE", raising=False)
    monkeypatch.setenv("FLASK_ENV", "development")

    assert isinstance(get_default_domain_provider(), DevelopmentDomainProvider)


def test_default_provider_keeps_vercel_provider_in_production(monkeypatch):
    monkeypatch.delenv("VERCEL_API_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL_PROJECT_ID", raising=False)
    monkeypatch.delenv("VERCEL_PROJECT_NAME", raising=False)
    monkeypatch.delenv("DOMAIN_PROVIDER_MODE", raising=False)
    monkeypatch.setenv("FLASK_ENV", "production")

    assert isinstance(get_default_domain_provider(), VercelDomainProvider)


def test_same_tenant_failed_provider_assignment_can_be_retried(monkeypatch):
    monkeypatch.setenv("DOMAIN_OWNERSHIP_SECRET", "test-secret")
    repo = FakeRepo()
    svc = service(repo=repo, provider=FakeProvider(fail_add=True))

    with pytest.raises(DomainEngineError) as exc:
        svc.add_domain("user_1", "customer.com", "idem-1")

    assert exc.value.code == DomainErrorCode.PROVIDER_UNAVAILABLE
    failed_row = next(iter(repo.rows.values()))
    assert failed_row["status"] == "failed"

    svc.provider = FakeProvider()
    result = svc.add_domain("user_1", "customer.com", "idem-2")

    assert result.status_code == 200
    assert result.body["domain"]["status"] == "pending_dns"
    assert repo.rows[failed_row["id"]]["provider_status"] == "assigned"
