from __future__ import annotations

import ipaddress
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlsplit

from .errors import DomainEngineError, DomainErrorCode


PLATFORM_HOSTS = {
    "flowauxi.com",
    "www.flowauxi.com",
    "shop.flowauxi.com",
    "pages.flowauxi.com",
    "marketing.flowauxi.com",
    "api.flowauxi.com",
    "booking.flowauxi.com",
    "tools.flowauxi.com",
    "files.flowauxi.com",
}
PLATFORM_SUFFIXES = (".flowauxi.com", ".vercel.app", ".vercel.sh", ".onrender.com")
LOCAL_HOSTS = {"localhost", "localhost.localdomain", "127.0.0.1", "::1", "0.0.0.0"}
SECOND_LEVEL_PUBLIC_SUFFIXES = {"co", "com", "net", "org", "gov", "ac", "edu"}

CONFUSABLE_MAP = str.maketrans({
    "а": "a", "Α": "a", "А": "a",
    "е": "e", "Ε": "e", "Е": "e",
    "о": "o", "Ο": "o", "О": "o",
    "р": "p", "Ρ": "p", "Р": "p",
    "с": "c", "Ϲ": "c", "С": "c",
    "у": "y", "Υ": "y", "У": "y",
    "х": "x", "Χ": "x", "Х": "x",
    "і": "i", "Ι": "i", "І": "i",
    "ӏ": "l", "ⅼ": "l",
})


@dataclass(frozen=True)
class NormalizedHost:
    display_host: str
    normalized_host: str
    ascii_host: str
    unicode_host: str
    unicode_skeleton: str
    apex_host: str
    domain_kind: str


def normalize_host(raw_host: str, *, allow_platform: bool = False) -> NormalizedHost:
    host = _extract_host(raw_host)
    if not host:
        raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain is required.")

    if host.startswith("*."):
        raise DomainEngineError(
            DomainErrorCode.WILDCARD_NOT_SUPPORTED,
            "Wildcard custom domains are not supported in Phase 1.",
        )

    host = host.strip().strip(".").lower()
    if not host:
        raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain is empty after normalization.")

    if host in LOCAL_HOSTS:
        raise DomainEngineError(DomainErrorCode.RESERVED_HOST, "Local or internal hosts cannot be used.")

    try:
        ipaddress.ip_address(host.strip("[]"))
        raise DomainEngineError(DomainErrorCode.RESERVED_HOST, "IP addresses cannot be used as custom domains.")
    except ValueError:
        pass

    unicode_host = _decode_idna(host)
    _validate_labels(unicode_host)
    _reject_mixed_script(unicode_host)

    ascii_host = unicode_host.encode("idna").decode("ascii").lower()
    normalized = ascii_host.strip(".")
    if not allow_platform and _is_platform_host(normalized):
        raise DomainEngineError(
            DomainErrorCode.PLATFORM_HOST_FORBIDDEN,
            "Flowauxi platform, preview, and infrastructure hosts cannot be claimed.",
        )

    skeleton = _confusable_skeleton(unicode_host)
    apex = _apex_host(normalized)
    kind = "www" if normalized.startswith("www.") else ("apex" if normalized == apex else "subdomain")

    return NormalizedHost(
        display_host=unicode_host,
        normalized_host=normalized,
        ascii_host=ascii_host,
        unicode_host=unicode_host,
        unicode_skeleton=skeleton,
        apex_host=apex,
        domain_kind=kind,
    )


def _extract_host(raw_host: str) -> str:
    value = (raw_host or "").strip()
    if not value:
        return ""
    if "://" in value:
        parsed = urlsplit(value)
        value = parsed.netloc
    else:
        value = re.split(r"[/?#]", value, maxsplit=1)[0]
    if "@" in value:
        value = value.rsplit("@", 1)[1]
    if value.startswith("["):
        return value
    if ":" in value and value.count(":") == 1:
        name, maybe_port = value.rsplit(":", 1)
        if maybe_port.isdigit():
            value = name
    return value


def _decode_idna(host: str) -> str:
    try:
        if host.isascii():
            return host.encode("ascii").decode("idna").lower()
        return host.encode("idna").decode("ascii").encode("ascii").decode("idna").lower()
    except UnicodeError as exc:
        raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain is not valid IDNA.") from exc


def _validate_labels(host: str) -> None:
    if len(host.encode("idna")) > 253:
        raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain is too long.")
    labels = host.split(".")
    if len(labels) < 2:
        raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain must include a registrable suffix.")
    for label in labels:
        if not label:
            raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain contains an empty label.")
        if label.startswith("-") or label.endswith("-"):
            raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain labels cannot start or end with hyphen.")
        if len(label.encode("idna")) > 63:
            raise DomainEngineError(DomainErrorCode.INVALID_HOST, "Domain label is too long.")


def _script_for(ch: str) -> str | None:
    if not ch.isalpha():
        return None
    name = unicodedata.name(ch, "")
    if "LATIN" in name:
        return "LATIN"
    for script in ("CYRILLIC", "GREEK", "ARABIC", "HEBREW", "DEVANAGARI", "HIRAGANA", "KATAKANA", "HANGUL", "CJK"):
        if script in name:
            return script
    return "OTHER"


def _reject_mixed_script(host: str) -> None:
    scripts = {script for ch in host for script in [_script_for(ch)] if script}
    if len(scripts) > 1:
        raise DomainEngineError(
            DomainErrorCode.MIXED_SCRIPT_HOST,
            "Mixed-script Unicode domains are blocked to prevent homograph attacks.",
        )


def _confusable_skeleton(host: str) -> str:
    normalized = unicodedata.normalize("NFKC", host).lower()
    return normalized.translate(CONFUSABLE_MAP)


def _is_platform_host(host: str) -> bool:
    return host in PLATFORM_HOSTS or any(host.endswith(suffix) for suffix in PLATFORM_SUFFIXES)


def _apex_host(host: str) -> str:
    labels = host.split(".")
    if len(labels) <= 2:
        return host
    if len(labels[-1]) == 2 and labels[-2] in SECOND_LEVEL_PUBLIC_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])

