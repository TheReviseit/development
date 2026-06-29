"""Single source of truth for plan-aware store slug resolution."""

from __future__ import annotations


def resolve_effective_store_slug(
    firebase_uid: str,
    url_slug: str | None,
    custom_domain_allowed: bool,
) -> str:
    """
    Starter / no custom_domain → firebase_uid[:8] (forced).
    Business/Pro + custom_domain → url_slug if set, else uid[:8] fallback.
    """
    fallback = (firebase_uid or "")[:8].lower()
    if not custom_domain_allowed:
        return fallback
    if url_slug and str(url_slug).strip():
        return str(url_slug).strip()
    return fallback


def is_ai_settings_configured(business_name: str | None) -> bool:
    return bool(business_name and str(business_name).strip())
