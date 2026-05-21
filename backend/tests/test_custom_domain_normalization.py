import pytest

from domains.custom_domains.domain.errors import DomainEngineError, DomainErrorCode
from domains.custom_domains.domain.normalization import normalize_host


class TestCustomDomainNormalization:
    def test_strips_scheme_path_port_case_and_trailing_dot(self):
        host = normalize_host("HTTPS://WWW.Example.COM:443/path?q=1.")

        assert host.normalized_host == "www.example.com"
        assert host.domain_kind == "www"
        assert host.apex_host == "example.com"

    def test_rejects_platform_host(self):
        with pytest.raises(DomainEngineError) as exc:
            normalize_host("shop.flowauxi.com")

        assert exc.value.code == DomainErrorCode.PLATFORM_HOST_FORBIDDEN

    def test_rejects_wildcard_custom_host_in_phase_one(self):
        with pytest.raises(DomainEngineError) as exc:
            normalize_host("*.customer.com")

        assert exc.value.code == DomainErrorCode.WILDCARD_NOT_SUPPORTED

    def test_rejects_ip_literal(self):
        with pytest.raises(DomainEngineError) as exc:
            normalize_host("127.0.0.1")

        assert exc.value.code == DomainErrorCode.RESERVED_HOST

    def test_punycode_and_unicode_canonicalize_to_same_host(self):
        unicode_host = normalize_host("bücher.example")
        punycode_host = normalize_host("xn--bcher-kva.example")

        assert unicode_host.normalized_host == punycode_host.normalized_host
        assert unicode_host.ascii_host == "xn--bcher-kva.example"

    def test_rejects_mixed_script_homograph(self):
        # "раypal" starts with Cyrillic characters that visually resemble Latin.
        with pytest.raises(DomainEngineError) as exc:
            normalize_host("раypal.example")

        assert exc.value.code == DomainErrorCode.MIXED_SCRIPT_HOST

