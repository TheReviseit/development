"""Stable cache keys for tenant-safe translation reuse."""

from __future__ import annotations

import hashlib
import re


def normalize_translation_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def translation_cache_key(
    *,
    text: str,
    source_locale: str,
    target_locale: str,
    provider: str,
    model_version: str,
    glossary_version: str,
    tenant_scope: str,
) -> str:
    normalized_hash = hashlib.sha256(normalize_translation_text(text).encode("utf-8")).hexdigest()
    return (
        "translation:"
        f"{tenant_scope}:"
        f"{source_locale}:{target_locale}:"
        f"{provider}:{model_version}:{glossary_version}:"
        f"{normalized_hash}"
    )
