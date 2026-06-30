import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getStoreBySlug } from "@/lib/store";
import { getProductBySlug, getProductUrl } from "@/lib/store/product";
import { generateProductMetadata } from "@/lib/seo/store-metadata";
import { generateProductSchema, generateProductBreadcrumbs } from "@/lib/seo/product-schema";
import ProductDetailClient from "./client-page";

const getStoreBySlugCached = cache(getStoreBySlug);

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ username: string; productSlug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { username, productSlug } = await params;

  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";

  const [storeData] = await Promise.all([
    getStoreBySlugCached(username),
  ]);

  if (!storeData) {
    return {
      title: "Product Not Found",
      description: "This product does not exist.",
      robots: { index: false, follow: false },
    };
  }

  const { product } = await getProductBySlug(username, productSlug);
  if (!product) {
    return {
      title: "Product Not Found",
      robots: { index: false, follow: false },
    };
  }

  const slug = storeData.canonicalSlug || username;

  return generateProductMetadata({
    store: storeData,
    product,
    slug,
    host,
    protocol: protocol as "http" | "https",
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { username, productSlug } = await params;

  if (!username || !productSlug) notFound();

  const storeData = await getStoreBySlugCached(username);
  if (!storeData) notFound();

  const { product } = await getProductBySlug(username, productSlug);
  if (!product) notFound();

  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const storeUrl = `${baseUrl}/store/${storeData.canonicalSlug || username}`;
  const slug = storeData.canonicalSlug || username;
  const ctx = { store: storeData, storeUrl, baseUrl, slug };

  const schemas = [
    generateProductSchema(product, ctx),
    generateProductBreadcrumbs(product, ctx),
  ];

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`product-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <ProductDetailClient
        username={username}
        product={product}
        storeData={storeData}
      />
    </>
  );
}
