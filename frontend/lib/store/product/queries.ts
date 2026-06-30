import { getStoreBySlug, type StoreProduct } from "@/lib/store";
import { productCache, productKey } from "@/lib/cache/store-cache";
import { getProductIdFromSlug } from "./urls";

export async function getProductBySlug(
  storeSlug: string,
  productSlug: string,
): Promise<{
  product: StoreProduct | null;
  storeSlug: string;
}> {
  const productIdPrefix = getProductIdFromSlug(productSlug);
  if (!productIdPrefix) return { product: null, storeSlug };

  const storeData = await getStoreBySlug(storeSlug);
  if (!storeData) return { product: null, storeSlug };

  const product =
    storeData.products.find((p) => p.id.startsWith(productIdPrefix)) || null;

  if (product) {
    productCache.set(productKey(product.id), product);
  }

  return { product, storeSlug };
}
