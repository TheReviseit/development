/**
 * Plan slug normalization and tier helpers for UI badges.
 */

const PRO_SLUGS = new Set(["pro", "professional"]);

export function normalizePlanSlug(
  slug: string | null | undefined,
  domain?: string,
): string {
  if (!slug) return "";
  let s = slug.toLowerCase().trim();
  if (domain) {
    const prefix = `${domain.toLowerCase()}_`;
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
    }
  }
  // Strip any product prefix (shop_pro → pro)
  s = s.replace(/^(shop|marketing|showcase|dashboard|booking|api|files)_/, "");
  return s;
}

/** True when the user is on the Pro tier (not Business/Starter). */
export function isProPlan(
  planSlug: string | null | undefined,
  domain?: string,
): boolean {
  if (!planSlug) return false;
  const raw = planSlug.toLowerCase().trim();
  if (raw === "pro" || raw.endsWith("_pro")) return true;
  const short = normalizePlanSlug(planSlug, domain);
  return PRO_SLUGS.has(short);
}

export function planTierFromSlug(
  planSlug: string | null | undefined,
  domain?: string,
): number {
  const short = normalizePlanSlug(planSlug, domain);
  if (PRO_SLUGS.has(short)) return 2;
  if (short === "business" || short === "growth") return 1;
  if (short === "starter" || short === "free") return 0;
  return 0;
}
