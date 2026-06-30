export function getProductSlug(
  product: { id: string; name: string },
): string {
  const nameSlug = product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const idPrefix = product.id.slice(0, 8);
  return `${nameSlug}-${idPrefix}`;
}

export function getProductUrl(
  storeSlug: string,
  product: { id: string; name: string },
): string {
  return `/store/${storeSlug}/product/${getProductSlug(product)}`;
}

export function getProductIdFromSlug(productSlug: string): string | null {
  const parts = productSlug.split("-");
  const idSuffix = parts[parts.length - 1];
  if (!idSuffix || idSuffix.length !== 8) return null;

  const namePart = parts.slice(0, -1).join("-");
  if (!namePart) return null;

  return idSuffix;
}
