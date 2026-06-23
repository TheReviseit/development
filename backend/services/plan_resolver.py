"""
Unified plan slug resolution — bridges short slugs (pro) and DB slugs (shop_pro).
"""

from typing import Any, Dict, Optional


def normalize_slug_for_display(plan_slug: str, domain: str) -> str:
    """Strip domain prefix for display comparisons."""
    if not plan_slug:
        return plan_slug
    prefix = f"{domain}_"
    if plan_slug.startswith(prefix):
        return plan_slug[len(prefix):]
    return plan_slug


def resolve_pricing_plan(
    supabase,
    domain: str,
    slug: str,
    billing_cycle: str = "monthly",
) -> Optional[Dict[str, Any]]:
    """
    Resolve pricing_plans row by slug with domain prefix fallback.

    Tries: exact slug → {domain}_{slug} → short form if slug is prefixed.
    """
    if not domain or not slug:
        return None

    slug = slug.lower().strip()
    candidates = [slug]
    if not slug.startswith(f"{domain}_"):
        candidates.append(f"{domain}_{slug}")
    else:
        candidates.append(normalize_slug_for_display(slug, domain))

    seen = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        try:
            result = (
                supabase.table("pricing_plans")
                .select("*")
                .match(
                    {
                        "product_domain": domain,
                        "plan_slug": candidate,
                        "billing_cycle": billing_cycle,
                        "is_active": True,
                    }
                )
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0]
        except Exception:
            continue
    return None


def tier_from_slug(plan_slug: str, domain: str) -> int:
    """Infer tier level from slug with domain prefix stripped."""
    from services.upgrade_engine import UpgradeEngine

    short = normalize_slug_for_display(plan_slug or "", domain)
    return UpgradeEngine._SLUG_TIER_MAP.get(short, 0)
