# PRODUCT PAGE MIGRATION MASTER PLAN

> **Current:** Product Modal Architecture  
> **Target:** Dedicated Product Detail Page (PDP) Architecture  
> **Standard:** FAANG-Level (Amazon, Shopify, Apple, Nike, Flipkart, Etsy)  
> **Framework:** Next.js 16 App Router (React 19, Server Components, Streaming)

---

## 1. CURRENT ARCHITECTURE ANALYSIS

### 1.1 Existing Flow

```
Browser: /store/[slug]
                    │
                    ▼
          page.tsx (SERVER COMPONENT)
           │  generateMetadata() ← getStoreBySlugCached() ← cache()
           │  JSON-LD structured data injection
           │  <StoreClientPage username initialData />
           │
           ▼
          client-page.tsx ("use client")
           │  useState: selectedProduct, isProductModalOpen
           │  Smart polling via /api/store/[slug]/version
           │  Real-time Supabase subscriptions
           │  Preloads Razorpay script
           │  Groups products by category
           │
           ├── StoreHeader (search, cart badge)
           ├── CarouselBanner (hero images)
           ├── NewArrivalsSection (horizontal scroll)
           ├── CategorySection × N
           │     └── ProductCardStore × N  ← onClick → setSelectedProduct(p)
           ├── StoreFooter
           ├── CartDrawer (slide-out, always mounted)
           ├── ProductDetailModal  ← isOpen, product, onClose
           └── SearchOverlay (full-screen modal)
```

### 1.2 Component Dependency Graph

```
app/store/[username]/
│
├── layout.tsx (server)
│   └── ClientProviders.tsx (client)
│       └── CartProvider (context/CartContext.tsx)
│           ├── localStorage persistence (per-username key)
│           ├── addToCart(product, qty, options, flags, colors, sizes, pricingInfo)
│           ├── removeFromCart, updateQuantity, clearCart
│           ├── updateItemOptions (price recalculation)
│           └── useCart() hook
│
├── page.tsx (server) — ISR: revalidate=60
│   ├── getStoreBySlugCached ← lib/store.ts (LRU cache, stale-while-revalidate)
│   │   ├── resolveSlug → lib/resolve-slug.ts (3-step fallback, 5min cache)
│   │   ├── Supabase: businesses query
│   │   ├── Supabase: products + variants JOIN
│   │   └── Supabase: subscriptions + plan resolution
│   ├── generateAllStoreSchemas → lib/seo/product-schema.ts
│   │   ├── generateStoreOrganizationSchema
│   │   ├── generateStoreWebsiteSchema
│   │   ├── generateStoreBreadcrumbs
│   │   ├── generateProductSchema × N  (URL: `${storeUrl}#product-${id}`)
│   │   └── generateProductListSchema
│   └── └── StoreClientPage
│
├── client-page.tsx (client)
│   ├── StoreHeader — store branding, search trigger, cart button with count
│   ├── CarouselBanner — image slider with auto-play, touch swipe, progress bar
│   ├── NewArrivalsSection — horizontal scroll wrapper
│   │   └── ProductCardStore × 4
│   ├── CategorySection × N
│   │   └── ProductCardStore × M
│   │       ├── Stock status calculation (variant-sizeStocks, product-sizeStocks, stock_quantity)
│   │       ├── Pricing logic (size pricing, variant pricing, ranges)
│   │       ├── Color/size selection logic
│   │       ├── Add to Cart / Buy Now / Wishlist
│   │       └── Skeleton loading
│   ├── StoreFooter — contact, social, tracking link
│   ├── CartDrawer — slide-out panel with option dropdowns
│   ├── ProductDetailModal — product detail modal ← THE TARGET FOR REPLACEMENT
│   │   ├── Image display (variant-aware)
│   │   ├── Price calculation (variant+size, size-only, base)
│   │   ├── Color swatches with hex mapping
│   │   ├── Size selection with stock awareness
│   │   ├── Quantity selector (disabled when OOS)
│   │   ├── Add to Cart → closes modal → opens cart drawer
│   │   ├── Framer Motion slide-up animation
│   │   └── Body scroll lock, Escape key close
│   └── SearchOverlay — full-screen search with recommendations
│       └── ProductCardStore × filtered
│
├── checkout/page.tsx (client) — full checkout form, Razorpay, COD, WhatsApp
├── track-order/page.tsx (client) — order status lookup
│
├── components/index.ts — barrel exports
├── store.module.css — 4261 lines of styles (entire store design system)
├── context/CartContext.tsx — cart state + localStorage + pricing recalculation
│
└── [API Routes]
    ├── api/store/[username]/route.ts — GET full store data (CDN cached: s-maxage=10)
    ├── api/store/[username]/products/route.ts — filtered paginated products
    ├── api/store/[username]/version/route.ts — light version timestamp
    ├── api/store/[username]/payment-settings/route.ts — payment config + invoice quota
    ├── api/store/[username]/orders/route.ts — POST create order (routes to Flask backend)
    ├── api/store/[username]/create-payment/route.ts — Razorpay order creation
    └── api/store/[username]/validate-stock/route.ts — stock validation endpoint
```

### 1.3 Data Flow (Current)

```
PAGE LOAD:
  Server (page.tsx) ──getStoreBySlugCached──▶ Supabase (3 parallel queries)
       │
       │  Returns: PublicStore { products, banners, contact, location,
       │  │                     socialMedia, paymentSettings, categories }
       │
       ▼
  Client (client-page.tsx) ── stores in useState ──▶ products[] derived
       │
       ▼
  ProductCardStore × N ── displays price, stock, rating ──▶ onClick

PRODUCT CLICK:
  ProductCardStore.onClick()
       │
       ▼
  client-page: setSelectedProduct(p) + setIsProductModalOpen(true)
       │
       ▼
  ProductDetailModal renders ── fetches image/variant from product object
       │                        (no additional API call)
       │
  User selects color → variant image updates, price recalculates
  User selects size → stock check, price recalculates
  User clicks Add to Cart →
       │
       ▼
  CartContext.addToCart() → localStorage set + state update
       │
       ▼
  Modal closes → CartDrawer opens (after 200ms timeout)

CART CHECKOUT:
  CartDrawer → Buy Now → /store/[slug]/checkout
       │
       ▼
  Checkout Page ── load payment settings ──▶ API
       │               + load Razorpay script
       │
  User fills form, selects payment method
       │
       ▼
  POST /api/store/[slug]/orders ──▶ Flask backend ──▶ order created + stock deducted
```

### 1.4 State Flow (Current)

```
Client State:
  client-page.tsx:  selectedProduct, isProductModalOpen, isSearchOpen
                    storeData, realtimeStatus, currentVersionRef
                    
  CartContext:       cartItems[], isCartOpen, isHydrated
                    (persisted to localStorage per-username)
                    
  ProductCardStore:  isImageLoaded, isLoading, isBuyNowLoading, isWishlisted
                    
  ProductDetailModal: selectedSize, selectedColor, quantity
                     (RESET every time product changes via useEffect)
                     
  SearchOverlay:     query, filteredProducts (useMemo)
```

### 1.5 Performance Analysis

| Metric | Current | Notes |
|--------|---------|-------|
| Store page TTFB | ~80-150ms | ISR + LRU cache + parallel DB queries |
| Store page hydration | Heavy | ~342KB JS for entire store + modal + cart |
| Product detail cost | ~738 lines modal | All JS shipped even if never opened |
| Navigation to product | 0ms (no navigation) | Already in client memory — but no URL |
| Back button behavior | Broken | Modal open/close doesn't affect history |
| Share product | Impossible | No URL, no deep link |
| Scroll restoration | Broken | Modal leaves scroll position |
| Memory | Growing | Modal + cart drawer always mounted |

---

## 2. EXISTING PROBLEMS (Modal Architecture)

### 2.1 URL & Deep Linking
- **No product URL:** `#product-${id}` fragment is used in JSON-LD but browsers don't navigate to fragments
- **No shareable links:** Users cannot copy/paste a direct product URL
- **No browser navigation:** Back/forward buttons don't work for product views
- **Broken History API:** Modal open/close doesn't push/replace history state

### 2.2 SEO
- **Zero product indexability:** Google cannot index individual product pages
- **Fragment URLs (#product-xxx):** Not indexed, not crawlable
- **Product JSON-LD references nonexistent URLs:** `${storeUrl}#product-${id}` is not a real URL
- **Rich Results blocked:** Product rich snippets require crawlable product URLs
- **Breadcrumb schema uses fragment:** `generateProductBreadcrumbs` references `#product-${id}`
- **No canonical per product:** Products can't have independent canonical URLs
- **No sitemap entries for products:** Products don't appear in sitemap

### 2.3 Analytics
- **No page_view for products:** `view_item` event can fire but without a proper page URL
- **Funnel tracking broken:** Can't track product→cart→checkout as navigation path
- **No scroll depth tracking on product details**
- **No time-on-product measurement**
- **Attribution lost:** Landing on product and referencing it in analytics is impossible

### 2.4 Accessibility
- **Modal focus trap:** Works but creates poor UX for assistive technology
- **No skip-to-content for product variants**
- **Screen reader context lost on modal open/close**
- **Color swatches lack proper ARIA labels for selected state**
- **Keyboard navigation inside modal is constrained**

### 2.5 Performance
- **Modal JS always loaded:** ProductDetailModal (738 lines) + CartDrawer (443 lines) are always in bundle
- **No code splitting for product detail:** All variant/stock/pricing logic loaded upfront
- **No streaming:** The entire page is one monolithic client component
- **No Suspense boundaries:** The page waits for everything
- **All store data shipped to client:** Even if user just wants to browse
- **Staggered animation adds latency:** `600 + index * 80ms` skeleton delay for cards
- **No image optimization:** Uses `<img>` tags instead of `next/image`
- **No lazy loading for sections below fold:** Everything renders at once
- **Framer Motion bundle impact:** Animation library adds significant JS cost
- **Smart polling creates regular HTTP wake-ups:** Version check every 30s adds ongoing cost

### 2.6 State Management Issues
- **State explosion in client-page.tsx:** 6+ useState hooks in one component
- **Duplicate pricing logic:** ProductCardStore has its own pricing/stock calculation; ProductDetailModal has a slightly different version; CartContext has yet another version
- **useEffect chains:** Color change → size reset → stock check → price recalc creates cascading re-renders
- **selectedProduct state sync:** When store data refreshes, the modal's selected product must be updated manually
- **Cart state in localStorage:** No server-side cart, no persistence across devices
- **No state normalization:** Product data shape varies between StoreProduct, Product, CartItem interfaces

### 2.7 Rendering Cost
- **Entire store is client-rendered:** Only page.tsx is a server component; everything inside is "use client"
- **ISR at page level only:** Products data is fetched client-side via API route for store refresh
- **No progressive rendering:** Mobile users wait for the same JS bundle as desktop
- **Hydration cost is high:** CartProvider wraps entire store tree

---

## 3. NEW ARCHITECTURE (Target)

### 3.1 High-Level Design

```
SERVER-FIRST, STREAMING, SUSPENSE-BASED

/store/[slug]                          /store/[slug]/product/[productSlug]
     │                                          │
     ▼                                          ▼
  Store Page (RSC)                          Product Page (RSC)
  ├── Streams: Hero Banner                   ├── generateMetadata()
  ├── Streams: New Arrivals                  ├── generateStaticParams() (ISR)
  ├── Streams: Category × N                  ├── JSON-LD (Product, Breadcrumb)
  └── Streams: Footer                        ├── Streaming Gallery
                                             ├── Streaming Product Info
                                             ├── Streaming Reviews
                                             ├── Streaming Recommendations
                                             └── Client Island: AddToCart
```

### 3.2 Server-First Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│ app/store/[slug]/layout.tsx (SERVER)                     │
│   └── CartProvider (in ClientProviders)                   │
│       └── {children}                                      │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ app/store/[slug]/page.tsx (SERVER — ISR)             │   │
│  │  ├── <Suspense fallback={<StoreSkeleton />}>        │   │
│  │  │   └── <CarouselBannerAsync />                    │   │
│  │  ├── <Suspense fallback={<ProductGridSkeleton />}>  │   │
│  │  │   └── <ProductGridStream />                      │   │
│  │  └── <StoreFooter />                                │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ app/store/[slug]/product/[productSlug]/page.tsx      │   │
│  │  (SERVER — ISR)                                      │   │
│  │  ├── generateMetadata() → Product metadata + OG      │   │
│  │  ├── JSON-LD Product Schema                          │   │
│  │  ├── JSON-LD Breadcrumb Schema                       │   │
│  │  ├── <BreadcrumbNav /> (server)                      │   │
│  │  ├── <Suspense fallback={<GallerySkeleton />}>      │   │
│  │  │   └── <ProductGallery /> (server → client island) │   │
│  │  ├── <Suspense fallback={<InfoSkeleton />}>         │   │
│  │  │   └── <ProductInfo /> (server)                    │   │
│  │  │       ├── Name, Price, Description                │   │
│  │  │       ├── <VariantSelector /> (client island)     │   │
│  │  │       ├── <SizeSelector /> (client island)        │   │
│  │  │       ├── <QuantitySelector /> (client island)    │   │
│  │  │       └── <AddToCartButton /> (client island)     │   │
│  │  ├── <Suspense fallback={<ReviewsSkeleton />}>      │   │
│  │  │   └── <ProductReviews /> (server)                 │   │
│  │  └── <Suspense fallback={<RecsSkeleton />}>         │   │
│  │      └── <RelatedProducts /> (server)                │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow (Target)

```
STORE PAGE (server):
  getStoreBySlugCached(slug)
    → Stream initial products + banners
    → Client takes over for real-time updates (existing polling stays)

PRODUCT PAGE (server, ISR):
  getStoreBySlugCached(storeSlug)
  getProductBySlug(storeSlug, productSlug)
    → All data fetched server-side
    → Full HTML rendered + streamed
    → Minimal JS hydration (only interactive islands)

ADD TO CART (server action):
  Server Action: addToCartAction(formData)
    → Validates stock on server
    → Returns updated cart state
    → Client updates UI optimistically

TRANSITIONS:
  /store/a → /store/a/product/b
    → Router instantly shows previous page's layout
    → Product page data streams in (instant navigation)
    → <Link> has prefetch="true" for instant next-page data
```

---

## 4. NEW ROUTING ARCHITECTURE

### 4.1 Route Structure

```
/app
  /store
    /[slug]/
      layout.tsx          ← Nested layout (server)
      page.tsx            ← Store page (ISR, streaming)
      loading.tsx         ← Store skeleton
      error.tsx           ← Store error boundary
      not-found.tsx       ← Store not found
      
      /product/
        /[productSlug]/
          page.tsx        ← PDP (ISR, streaming)
          loading.tsx     ← Product skeleton
          error.tsx       ← Product error boundary
          
      /checkout/
        page.tsx          ← Checkout page (client as-is, refactored)
        
      /track-order/
        page.tsx          ← Track order (client as-is)

  /api
    /store
      /[slug]
        route.ts          ← Store data API (keep for polling)
        /version
          route.ts        ← Version check (keep)
        /products
          route.ts        ← Paginated products (keep)
        /product
          /[productSlug]
            route.ts      ← NEW: Single product API endpoint
        /payment-settings
          route.ts        ← Keep
        /orders
          route.ts        ← Keep
        /create-payment
          route.ts        ← Keep
        /validate-stock
          route.ts        ← Keep
```

### 4.2 Dynamic Segments

```
/store/[slug]/product/[productSlug]

  [slug]        → store slug (canonicalSlug from businesses.url_slug_lower)
  [productSlug] → product slug (derived from product.id OR product name slug)
```

### 4.3 URL Generation Strategy

```typescript
// lib/product/urls.ts (NEW)
function getProductUrl(storeSlug: string, product: StoreProduct): string {
  const productSlug = product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + product.id.slice(0, 8);
  
  return `/store/${storeSlug}/product/${productSlug}`;
}
```

This follows Amazon/Flipkart pattern: `name-slug-SKU123` with the ID suffix for uniqueness.

### 4.4 Nested Layouts

```
store/[slug]/layout.tsx
  └── CartProvider wraps entire store subtree
  
store/[slug]/product/[productSlug]/layout.tsx (optional)
  └── Product-specific layout (breadcrumbs, back navigation)
```

### 4.5 Metadata & Canonical URLs

```typescript
// In product page generateMetadata()
export async function generateMetadata({ params }) {
  const { slug, productSlug } = await params;
  const store = await getStoreBySlugCached(slug);
  const product = await getProductBySlugCached(slug, productSlug);
  
  return generateProductMetadata({ store, product, slug, host, protocol });
}
```

Each product gets its own:
- `<title>` — "Product Name — Buy at Store Name"
- `<meta name="description">` — unique description
- `<link rel="canonical">` — points to this exact product URL
- `<meta property="og:url">` — the product URL
- `<meta name="robots">` — index,follow

### 4.6 Breadcrumbs

```
Home → Stores → Store Name → Category → Product Name
```

Breadcrumb JSON-LD uses the real product URL, not a fragment.

### 4.7 Navigation Behavior

| Action | Behavior |
|--------|----------|
| Click product card | `router.push(/store/a/product/b)` — full navigation |
| Back button | Returns to store page, scroll restored |
| Forward button | Returns to product page, instant from client cache |
| Share product | Copy URL from address bar |
| Refresh product page | Full SSR with ISR cache |
| Direct URL visit | Server render + stream |

### 4.8 Parallel Routes (if useful)

A modal-style overlay can coexist using parallel routes and intercepting routes:

```
/(store)/
  @modal/                     ← Parallel route for modal
    (..)product/[productSlug] ← Intercept from store
  
  /[slug]/
    page.tsx
  /[slug]/product/
    [productSlug]/
      page.tsx                 ← Actual PDP
```

This enables:
- Click from store → product opens as modal overlay (intercepting route)
- Direct URL visit → full PDP (no intercept)
- Browser refresh on modal → shows PDP (no 404)

**RECOMMENDATION:** Defer parallel + intercepting routes to Phase 4. Start with full navigation in Phase 2.

### 4.9 Loading, Error, Not-Found

```
store/[slug]/loading.tsx     → Store page skeleton with shimmer cards
store/[slug]/error.tsx       → Error boundary with retry button
store/[slug]/not-found.tsx   → "Store not found" message

store/[slug]/product/[productSlug]/
  loading.tsx                → Product skeleton (gallery + info shimmer)
  error.tsx                  → Product error (maybe product deleted)
```

---

## 5. PERFORMANCE PLAN

### 5.1 Targets

| Metric | Current | Target |
|--------|---------|--------|
| Navigation to product | Instant (in-memory) | <100ms (prefetch + instant navigation) |
| Product page TTFB | N/A | <200ms (ISR cache hit) |
| Product page LCP | N/A | <1.5s (streamed hero image) |
| JS per product page | N/A | <50KB (minimal client islands) |
| Total store JS | ~342KB | <150KB (code-split modal → page) |
| Lighthouse Performance | ~60-70 | >90 |
| Core Web Vitals | Fails on modal UX | Pass all thresholds |

### 5.2 Strategy

**Server Components First**
- Product page is 100% server-rendered by default
- Only interactive elements use "use client" (variant selector, add to cart, gallery)
- Server components stream HTML directly, zero JS cost

**Streaming & Suspense**
```tsx
// Product page with streaming sections
export default async function ProductPage({ params }) {
  return (
    <>
      <BreadcrumbNav store={store} product={product} /> {/* server */}
      
      <Suspense fallback={<GallerySkeleton />}>
        <ProductGallery productId={product.id} /> {/* streams */}
      </Suspense>
      
      <Suspense fallback={<InfoSkeleton />}>
        <ProductInfoSection product={product} /> {/* server */}
      </Suspense>
      
      {/* Client islands with minimal boundary */}
      <ClientCartBoundary>
        <AddToCartSection product={product} /> 
      </ClientCartBoundary>
      
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviewsSection productId={product.id} />
      </Suspense>
      
      <Suspense fallback={<RecsSkeleton />}>
        <RelatedProductsSection productId={product.id} category={product.category} />
      </Suspense>
    </>
  );
}
```

**Prefetching**
- Product cards in store page use `<Link prefetch={true}>`
- Next.js automatically prefetches the product page data on hover/visibility
- Navigation is instant — data is already in router cache

**Image Optimization**
- Replace all `<img>` with `next/image`
- Use `priority` for hero/product images above fold
- Lazy load below-fold images with `loading="lazy"`
- Serve AVIF/WebP with automatic format negotiation
- Use Cloudinary transformation URLs for resizing

**Caching Strategy**
```
Product Page (ISR)       → revalidate: 60 (matches store page)
Product Data API         → s-maxage=10, stale-while-revalidate=30
Product Images (CDN)     → max-age=31536000, immutable (Cloudinary)
React cache()            → deduplicates within request
LRU Cache (lib/cache)   → 30s fresh, 120s stale for store data
Product LRU Cache        → NEW: specific product cache (60s TTL)
Router Cache (Next.js)   → automatic for prefetched pages
```

**Code Splitting**
- `ProductDetailModal.tsx` → becomes `app/store/[slug]/product/[productSlug]/page.tsx`
- This is automatically code-split by Next.js App Router
- Framer Motion only loaded on product page, not store page
- Cart drawer stays as client component but lazy-loaded

**Bundle Optimization**
- Remove Framer Motion from product card grid (use CSS animations)
- Lazy-load CartDrawer with `next/dynamic` and `ssr: false`
- Extract shared pricing/stock logic into a pure utility module
- Use `dynamic(() => import('./HeavyComponent'), { ssr: false })` for image gallery

**Memory Optimization**
- Remove always-mounted ProductDetailModal
- CartDrawer: lazy mount only when opened
- SearchOverlay: lazy mount only when opened
- Remove 30-second polling when page is not visible (already done)
- Clear interval on unmount

**React cache & Request Deduplication**
```typescript
const getStoreBySlugCached = cache(getStoreBySlug); // Already done
const getProductBySlugCached = cache(getProductBySlug); // NEW
```

---

## 6. SEO PLAN

### 6.1 What Changes

| Feature | Current | Target |
|---------|---------|--------|
| Product URL | None (hash fragment) | `/store/[slug]/product/[productSlug]` |
| Product Metadata | Store-level only | Per-product title, desc, OG |
| Product Canonical | N/A | Per-product canonical URL |
| Product JSON-LD | References `#product-${id}` fragment | References real URL |
| Breadcrumb JSON-LD | References fragments | References real URLs |
| Rich Results | Blocked (no real URL) | Product rich snippets eligible |
| Sitemap | Store-level only | Product entries in sitemap |
| Indexing | 0 product pages indexed | All products indexed |
| Social Sharing | Cannot share product | Full OG cards for every product |

### 6.2 Metadata API

```typescript
// lib/seo/product-metadata.ts (REFACTOR generateProductMetadata)
export function generateProductMetadata({ store, product, slug, host, protocol }) {
  const productSlug = generateProductSlug(product);
  const productUrl = `/store/${slug}/product/${productSlug}`;
  const fullUrl = `${protocol}://${host}${productUrl}`;
  
  return {
    title: `${product.name} — Buy at ${store.businessName}`,
    description: generateProductDescription(product),
    alternates: { canonical: fullUrl },
    openGraph: {
      title: product.name,
      description: product.description,
      url: fullUrl,
      images: [{ url: product.imageUrl, width: 800, height: 800 }],
    },
    twitter: { card: "summary_large_image", title: product.name },
    robots: { index: true, follow: true },
    // other: product-specific metadata
  };
}
```

### 6.3 Structured Data

```typescript
// Refactor generateProductSchema to use real URL
export function generateProductSchema(product, ctx) {
  const productUrl = `${ctx.baseUrl}/store/${ctx.slug}/product/${generateProductSlug(product)}`;
  
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": productUrl,
    name: product.name,
    image: product.imageUrl,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "INR",
      url: productUrl,        // ← Was: `${storeUrl}#product-${id}`
      availability: product.available 
        ? "https://schema.org/InStock" 
        : "https://schema.org/OutOfStock",
    },
    url: productUrl,           // ← Was: `${storeUrl}#product-${id}`
  };
}
```

### 6.4 Breadcrumb JSON-LD

```typescript
export function generateProductBreadcrumbs(product, ctx) {
  const productUrl = `${ctx.baseUrl}/store/${ctx.slug}/product/${generateProductSlug(product)}`;
  
  const items = [
    { name: "Home", url: ctx.baseUrl },
    { name: "Stores", url: `${ctx.baseUrl}/store` },
    { name: ctx.store.businessName, url: ctx.storeUrl },
  ];
  
  if (product.category) {
    items.push({
      name: product.category,
      url: `${ctx.storeUrl}?category=${encodeURIComponent(product.category)}`,
    });
  }
  
  items.push({
    name: product.name,
    url: productUrl,           // ← Was: `${storeUrl}#product-${id}`
  });
  
  return generateBreadcrumbSchema(items);
}
```

### 6.5 Sitemap & Indexing

- Update `sitemap.ts` to include product entries
- Each product gets: `<url><loc>/store/[slug]/product/[productSlug]</loc></url>`
- Use `lastmod` from product's `updated_at`
- Submit via IndexNow protocol (already exists in `lib/seo/indexnow.ts`)

---

## 7. UX PLAN

### 7.1 Desktop

```
┌──────────────────────────────────────────────────┐
│  ← Back to Store   Breadcrumb: Home > Store > P  │
├──────────────────────┬───────────────────────────┤
│                      │  Product Name              │
│   ┌──────────────┐   │  ★★★★☆ (24 reviews)       │
│   │              │   │                            │
│   │   Gallery    │   │  ₹1,299   ₹999   [23% OFF] │
│   │   (Zoom)     │   │                            │
│   │              │   │  Colors: ● ● ● ● ●        │
│   │              │   │                            │
│   │              │   │  Size: [S] [M] [L] [XL]   │
│   │              │   │                            │
│   │  [1] [2] [3] │   │  Quantity: [-] 1 [+]       │
│   └──────────────┘   │                            │
│                      │  [ Add to Cart — ₹999 ]    │
│                      │  [     Buy Now     ]       │
│                      │                            │
│                      │  ✓ Free Shipping           │
│                      │  ✓ Cash on Delivery        │
│                      │  ✓ Easy Returns             │
│                      │                            │
│                      │  Description:              │
│                      │  Handwoven pure silk...    │
│                      │                            │
│                      │  Share: [📱] [🔗] [🐦]    │
├──────────────────────┴───────────────────────────┤
│  You May Also Like                                │
│  [Product] [Product] [Product] [Product]          │
├──────────────────────────────────────────────────┤
│  Customer Reviews                                 │
│  ★★★★☆ "Great quality" — User 1                 │
│  ★★★★★ "Perfect fit" — User 2                   │
└──────────────────────────────────────────────────┘
```

### 7.2 Tablet (768px-1024px)

- Same layout as desktop but reduced padding
- Gallery switches to horizontal swipe
- Right column stacks below gallery at lower breakpoint
- Same sticky Add to Cart on scroll

### 7.3 Mobile (<768px)

```
┌──────────────────────┐
│ ← Back    Share [🔗] │
├──────────────────────┤
│                      │
│   Gallery (swipe)    │
│                      │
│  ● ● ○ ○ ○           │
├──────────────────────┤
│ Product Name          │
│ ★★★★☆ (24 reviews)   │
│ ₹999   [23% OFF]     │
├──────────────────────┤
│ Colors: ● ● ● ● ●   │
├──────────────────────┤
│ Size: [S] [M] [L]    │
├──────────────────────┤
│ Qty: [-] 1 [+]       │
├──────────────────────┤
│ Description           │
│ Free Shipping ✓      │
│ COD Available ✓      │
├──────────────────────┤
│ You May Also Like     │
│ [card] [card]        │
├──────────────────────┤
│ Reviews              │
├──────────────────────┤
│ Footer               │
└──────────────────────┘

┌──────────────────────┐ ← STICKY BOTTOM
│ [ Add to Cart — ₹999 ] │
│ [     Buy Now     ]    │
└──────────────────────┘
```

### 7.4 Key UX Decisions

1. **Sticky CTA on mobile:** Fixed bottom bar with Add to Cart + Buy Now
2. **Gallery zoom:** Pinch-to-zoom on mobile, click-to-zoom on desktop
3. **Color variant image switching:** Instant swap without page navigation
4. **Size availability:** Greyed-out + strikethrough for OOS sizes
5. **Optimistic cart:** Add to Cart instantly updates UI, syncs in background
6. **Recently viewed:** Track via localStorage, show at bottom of product page
7. **Skeleton loading:** Shimmer placeholders for each section as it streams in
8. **Scroll to reviews:** Anchor link / button in product info section

---

## 8. ANALYTICS PLAN

### 8.1 Events to Track (Existing + New)

| Event | Current | Target | Implementation |
|-------|---------|--------|----------------|
| `view_item` | Fires in modal | Fires on PDP navigation | Server-side or client page view |
| `view_item_list` | Not tracked | Fires when product grid renders | Intersection Observer on grid |
| `select_item` | Not tracked | Fires on product card click | ProductCardStore onClick |
| `add_to_cart` | Fires in modal | Fires on PDP Add to Cart | Cart action |
| `remove_from_cart` | Not tracked | Fires on cart removal | CartDrawer |
| `begin_checkout` | Not tracked | Fires on checkout navigation | checkout/page.tsx mount |
| `purchase` | Not tracked | Fires on successful order | Post-order creation |
| `view_item_list` (recs) | Not tracked | Fires when recommendations shown | Intersection Observer |
| `scroll_depth` | Not tracked | Tracks scroll % on PDP | Client component |
| `variant_selected` | Not tracked | Tracks color/size selection | Variant selector onChange |

### 8.2 GA4 Ecommerce Funnel

```
Homepage/Store → Product Card Click (select_item)
       │
       ▼
  PDP Page (view_item + page_view)
       │
   ├── Variant Select (view_item with updated variant)
   │
   ├── Add to Cart (add_to_cart)
   │
   ├── Begin Checkout (begin_checkout)
   │
   └── Purchase (purchase + transaction)
```

### 8.3 Implementation

```typescript
// Product page client component
function useProductAnalytics(product: Product) {
  useEffect(() => {
    trackEvent('view_item', {
      currency: 'INR',
      items: [{
        item_id: product.id,
        item_name: product.name,
        item_category: product.category,
        price: product.price,
      }]
    });
  }, [product.id]);
}
```

---

## 9. MIGRATION PLAN

### 9.1 Phase 1: Foundation (Week 1)

**Goal:** Prep the codebase without breaking anything

- [ ] Create `lib/product/urls.ts` — URL generation utilities
- [ ] Create `lib/product/getProductBySlug.ts` — new server function to fetch single product
- [ ] Create `lib/product/queries.ts` — shared product query utilities
- [ ] Refactor pricing logic from `ProductDetailModal` + `ProductCardStore` + `CartContext` into `lib/product/pricing.ts`
- [ ] Refactor stock logic from `ProductDetailModal` + `ProductCardStore` into `lib/product/stock.ts`
- [ ] Add `ProductPageData` type to `lib/store.ts` (subset of StoreProduct with full detail)
- [ ] Create `app/api/store/[slug]/product/[productSlug]/route.ts` — single product API
- [ ] Deploy foundation — zero user-facing change

### 9.2 Phase 2: Product Page (Week 2)

**Goal:** Create the new `/store/[slug]/product/[productSlug]` page, behind feature flag

- [ ] Create `app/store/[slug]/product/[productSlug]/page.tsx` — server component
  - [ ] `generateMetadata()` with per-product SEO
  - [ ] JSON-LD structured data (Product + Breadcrumb using real URLs)
  - [ ] Server components for static sections
  - [ ] Client islands for interactive sections
- [ ] Create `app/store/[slug]/product/[productSlug]/loading.tsx` — skeleton UI
- [ ] Create `app/store/[slug]/product/[productSlug]/error.tsx` — error boundary
- [ ] Build `components/product/ProductGallery.tsx` — server + client image gallery
- [ ] Build `components/product/ProductInfo.tsx` — server component for product details
- [ ] Build `components/product/VariantSelector.tsx` — client island for variants
- [ ] Build `components/product/AddToCartSection.tsx` — client island for cart
- [ ] Build `components/product/ProductReviews.tsx` — server component
- [ ] Build `components/product/RelatedProducts.tsx` — server component
- [ ] Add feature flag: `process.env.FEATURE_PRODUCT_PAGE`
- [ ] Wire `ProductCardStore.onClick` → `router.push()` when flag is on
- [ ] Keep `ProductDetailModal` as fallback when flag is off

### 9.3 Phase 3: Integration (Week 3)

**Goal:** Full integration, remove modal, enable by default

- [ ] Add product sitemap entries to `sitemap.ts`
- [ ] Update `generateProductSchema` to use real product URLs
- [ ] Update `generateProductBreadcrumbs` to use real product URLs
- [ ] Remove `#product-${id}` fragment references from product schema
- [ ] Wire analytics events to PDP (view_item, select_item, etc.)
- [ ] Add recently viewed tracking (localStorage + display)
- [ ] Update `CartContext.addToCart` to accept product page data
- [ ] Remove `ProductDetailModal` component
- [ ] Remove `ProductDetailModal` import from `client-page.tsx`
- [ ] Remove modal-related state from `client-page.tsx`
- [ ] Update components/index.ts — remove modal export
- [ ] Enable feature flag for all users
- [ ] Monitor errors, rollback if needed

### 9.4 Phase 4: Polish (Week 4)

**Goal:** Performance optimization + optional advanced patterns

- [ ] Add parallel route + intercepting route for modal-style overlay (optional)
  - `app/store/[slug]/@modal/(..)product/[productSlug]/page.tsx`
- [ ] Implement ISR with `revalidate` for product pages
- [ ] Add `generateStaticParams` for top products
- [ ] Performance audit: Lighthouse, Web Vitals
- [ ] Bundle analysis: compare before/after
- [ ] Image optimization audit
- [ ] SEO audit: Google Search Console, Rich Results Test
- [ ] Accessibility audit
- [ ] Remove feature flag code
- [ ] Delete `ProductDetailModal.tsx`
- [ ] Clean up unused CSS from `store.module.css`

### 9.5 Rollback Plan

```
Feature Flag: process.env.FEATURE_PRODUCT_PAGE
  - ON:  ProductCardStore navigates to /store/[slug]/product/[productSlug]
  - OFF: ProductCardStore opens ProductDetailModal (existing behavior)

Rollback Procedure:
  1. Set FEATURE_PRODUCT_PAGE=false
  2. Redeploy
  3. All users immediately go back to modal behavior
  4. No data loss — all URLs work (old store page unaffected)

Data Safety:
  - Cart state is in localStorage (unaffected by routing change)
  - Store data is unchanged
  - All API routes remain intact
  - SEO: Product pages will simply return 404 if rollback needed
```

---

## 10. FILE-BY-FILE MIGRATION CHECKLIST

### Core Store Files

| File | Purpose | Current Responsibility | Future Responsibility | Refactor? | Delete? | Split? | Server? | Client? | Cache? | Tests? |
|------|---------|----------------------|----------------------|-----------|---------|--------|---------|---------|--------|--------|
| `app/store/[slug]/page.tsx` | Store SSR | ISR, metadata, schemas, render client page | Same + product page links | Yes | No | No | Yes | No | Yes (cache()) | Yes |
| `app/store/[slug]/layout.tsx` | Store layout | Server wrapper → ClientProviders | Same | No | No | No | Yes | No | No | No |
| `app/store/[slug]/client-page.tsx` | Store client | State, polling, modals, cart | State, polling, nav to PDP (remove modal state) | Yes | No | Yes | No | Yes | No | Yes |
| `app/store/[slug]/ClientProviders.tsx` | Cart wrapper | CartProvider | CartProvider | No | No | No | No | Yes | No | No |
| `app/store/[slug]/components/index.ts` | Barrel exports | Export all components | Remove ProductDetailModal export | Yes | No | No | N/A | N/A | No | No |

### Components

| File | Purpose | Current Responsibility | Future Responsibility | Refactor? | Delete? | Split? | Server? | Client? | Cache? | Tests? |
|------|---------|----------------------|----------------------|-----------|---------|--------|---------|---------|--------|--------|
| `ProductDetailModal.tsx` | Product modal | Display product, variants, cart | DELETE — replaced by PDP | No | **Yes** | N/A | No | Yes | No | No |
| `ProductCardStore.tsx` | Product card | Display card, stock/pricing logic, click → modal | Display card, click → router.push to PDP | Yes | No | **Yes** | No | Yes | No | Yes |
| `CartDrawer.tsx` | Cart drawer | Slide-out cart | Same (unaffected) | No | No | No | No | Yes | No | Yes |
| `SearchOverlay.tsx` | Search modal | Full-screen search | Same (unaffected) | No | No | No | No | Yes | No | No |
| `StoreHeader.tsx` | Store header | Branding, search, cart | Same | No | No | No | No | Yes | No | No |
| `StoreFooter.tsx` | Store footer | Contact, links | Same | No | No | No | Yes | Yes | No | No |
| `CarouselBanner.tsx` | Hero carousel | Slideshow | Same (unaffected) | No | No | No | No | Yes | No | No |
| `NewArrivalsSection.tsx` | New arrivals | Horizontal scroll | Same | No | No | No | No | Yes | No | No |
| `CategorySection.tsx` | Category grid | Grid of product cards | Same | No | No | No | Yes | Yes | No | No |
| `CategoryNav.tsx` | Category filter | Pill nav | Same | No | No | No | No | Yes | No | No |
| `RecommendedProducts.tsx` | Recommendations | First 4 products | Same | No | No | No | No | Yes | No | No |

### NEW Product Page Components

| File | Purpose | Server? | Client? | Cache? | Tests? |
|------|---------|---------|---------|--------|--------|
| `app/store/[slug]/product/[productSlug]/page.tsx` | Product SSR + streaming | Yes | No | Yes | Yes |
| `app/store/[slug]/product/[productSlug]/loading.tsx` | Product skeleton | Yes | No | No | No |
| `app/store/[slug]/product/[productSlug]/error.tsx` | Product error | Yes | No | No | No |
| `components/product/ProductGallery.tsx` | Image gallery | No | Yes | Yes | Yes |
| `components/product/ProductInfo.tsx` | Product details | Yes | No | No | Yes |
| `components/product/VariantSelector.tsx` | Color/size picker | No | Yes | No | Yes |
| `components/product/AddToCartSection.tsx` | Cart action | No | Yes | No | Yes |
| `components/product/ProductReviews.tsx` | Reviews list | Yes | No | No | Yes |
| `components/product/RelatedProducts.tsx` | Related items | Yes | No | Yes | Yes |
| `components/product/RecentlyViewed.tsx` | Recently viewed | No | Yes | Yes | No |

### Context

| File | Purpose | Current | Future | Refactor? | Delete? | Split? | Tests? |
|------|---------|---------|--------|-----------|---------|--------|--------|
| `context/CartContext.tsx` | Cart state | Add/remove/update, pricing, localStorage | Same (extract pricing to lib/) | Yes | No | Yes | Yes |

### Library (lib/)

| File | Purpose | Change? |
|------|---------|---------|
| `lib/store.ts` | Store data engine | Add `getProductBySlug()`, add `ProductPageData` type |
| `lib/cache/store-cache.ts` | LRU cache | Add product cache instance |
| `lib/resolve-slug.ts` | Slug resolution | No change |
| `lib/seo/store-metadata.ts` | Store + product metadata | Refactor `generateProductMetadata` to use real URLs |
| `lib/seo/product-schema.ts` | Product JSON-LD | Refactor to use real product URLs |
| `lib/seo/structured-data.ts` | Platform schemas | No change |
| `lib/product/pricing.ts` | **NEW** | Extract pricing logic from all components |
| `lib/product/stock.ts` | **NEW** | Extract stock logic from all components |
| `lib/product/urls.ts` | **NEW** | URL generation utilities |
| `lib/product/queries.ts` | **NEW** | Shared product query functions |
| `lib/analytics/events.ts` | Event schemas | Ensure `view_item` exists (already does) |

### API Routes

| Route | Change? |
|-------|---------|
| `api/store/[slug]/route.ts` | No change (keep for polling) |
| `api/store/[slug]/products/route.ts` | No change (keep for pagination) |
| `api/store/[slug]/version/route.ts` | No change (keep for polling) |
| `api/store/[slug]/product/[productSlug]/route.ts` | **NEW** — single product endpoint |
| `api/store/[slug]/payment-settings/route.ts` | No change |
| `api/store/[slug]/orders/route.ts` | No change |
| `api/store/[slug]/create-payment/route.ts` | No change |
| `api/store/[slug]/validate-stock/route.ts` | No change |

### CSS

| File | Change? |
|------|---------|
| `app/store/[slug]/store.module.css` | Remove modal-specific styles (4261 lines → ~3500) |
| NEW: `app/store/[slug]/product/[productSlug]/product.module.css` | NEW: Product page styles |

### Checkout & Track Order

| File | Change? |
|------|---------|
| `checkout/page.tsx` | No change (unaffected by architecture change) |
| `track-order/page.tsx` | No change |
| `checkout/checkout.module.css` | No change |
| `track-order/track-order.module.css` | No change |

---

## 11. RISKS

### 11.1 Performance Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product page slower than modal | User perceives slowdown | Streaming + suspense + prefetch makes it feel instant |
| Extra API call for single product | Increased server load | ISR + LRU cache + React cache() deduplication |
| Bundle size increase from new components | Larger initial load | Code splitting via App Router, lazy load gallery |
| CLS from streaming components | Layout shift | Fixed-size skeleton placeholders |

### 11.2 SEO Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 404s during rollout | Google sees errors | Feature flag, redirect old fragment URLs |
| Duplicate product URLs | Diluted ranking | Strict canonical URLs |
| Indexed products disappear on rollback | 404s in index | Keep modal fallback, 301 rollback URLs if needed |
| Product JSON-LD references wrong URL | Rich results fail | Validate all schema URLs with Rich Results Test |

### 11.3 Cart Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| AddToCart breaks in new page | Revenue loss | Shared CartContext remains unchanged |
| Variant selection differs from modal | Wrong price charged | Extract pricing to shared lib — single source of truth |
| Cart state lost between pages | User frustration | localStorage cart persists correctly (per-username key) |

### 11.4 Routing Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Back button from product goes to wrong page | Bad UX | router.back() works naturally with browser history |
| Direct URL access to product fails | 404 | Test all URL patterns, ISR handles cold starts |
| Product slug collision | Wrong product | ID suffix in slug ensures uniqueness |
| Query params on product page break | Lost filters | Clear approach: product page has no query params |

### 11.5 Data Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product data on PDP differs from store data | Inconsistent display | Same `getStoreBySlugCached` source, single product endpoint |
| Stock changes between store and PDP view | Overselling | Server Action validates stock at add-to-cart time |
| Product deleted between store render and PDP click | 404 | Handle gracefully with error.tsx and redirect back |

### 11.6 Rollback Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ProductDetailModal deleted before rollback | Broken store | Keep modal code until Phase 4, use feature flag |
| Browser cached old JS with router.push | Users see 404s | Deploy with updated manifest, test rollout |
| Database query load increases | Slowdown | Monitor, add caching layer for single product queries |

---

## 12. FINAL PRODUCTION ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE (CDN)                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Store HTML   │  │ Product HTML │  │ Store Data   │  │ Product Data │   │
│  │ (ISR 60s)    │  │ (ISR 60s)    │  │ (s-maxage=10)│  │ (s-maxage=10)│   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└───────────────────────────┬─────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────────────┐
│                        NEXT.JS SERVER                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SERVER COMPONENTS (RSC)                         │   │
│  │                                                                      │   │
│  │  getStoreBySlugCached(slug) ──► LRU Cache ──► Supabase (miss)      │   │
│  │  getProductBySlugCached(slug, productSlug) ──► PCache ──► Supabase │   │
│  │                                                                      │   │
│  │  ┌────────────┐  ┌────────────────┐  ┌────────────────────────┐    │   │
│  │  │ Store Page │  │ Product Page   │  │ API Routes             │    │   │
│  │  │            │  │                │  │  /store/[s]/version    │    │   │
│  │  │ Carousel   │  │ Breadcrumb     │  │  /store/[s]/products   │    │   │
│  │  │ NewArrivals│  │ ProductInfo    │  │  /store/[s]/orders     │    │   │
│  │  │ Categories │  │ RelatedProducts│  │  /store/[s]/payment    │    │   │
│  │  │ Footer     │  │ Reviews        │  │  /store/[s]/create-pay │    │   │
│  │  └────────────┘  └────────────────┘  └────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CLIENT ISLANDS                                     │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐               │   │
│  │  │ Variant      │  │ AddToCart    │  │ Gallery     │               │   │
│  │  │ Selector     │  │ Section      │  │ (zoom/pinch)│               │   │
│  │  │ (color/size) │  │ (server act) │  │             │               │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐               │   │
│  │  │ CartDrawer   │  │ SearchOverlay│  │ Recently    │               │   │
│  │  │ (lazy)       │  │ (lazy)       │  │ Viewed      │               │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SERVER ACTIONS                                    │   │
│  │  addToCartAction(formData) → validates stock → returns cart state    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────────────┐
│                       DATA LAYER                                            │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    CACHING LAYER                                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌───────────┐   │   │
│  │  │ LRU: Store │  │ LRU: Slug  │  │ LRU: Product │  │ LRU:      │   │   │
│  │  │ Data       │  │ Resolution │  │ Data (NEW)   │  │ Version   │   │   │
│  │  │ (500,30s)  │  │ (1000,5m)  │  │ (1000,60s)   │  │ (1000,5s) │   │   │
│  │  └────────────┘  └────────────┘  └──────────────┘  └───────────┘   │   │
│  │  ┌────────────┐  ┌────────────┐                                     │   │
│  │  │ React      │  │ React      │                                     │   │
│  │  │ cache()    │  │ cache()    │                                     │   │
│  │  │ Store      │  │ Product    │                                     │   │
│  │  └────────────┘  └────────────┘                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐                  │
│  │  Supabase     │  │  Flask       │  │  Razorpay        │                  │
│  │  (Database)   │  │  (Backend)   │  │  (Payments)      │                  │
│  └──────────────┘  └──────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.1 Request Lifecycle

```
STORE PAGE REQUEST:
  User → /store/my-shop
    → CDN cache hit? Return ISR HTML
    → Miss: Next.js server
      → generateMetadata() → getStoreBySlugCached()
        → LRU cache hit? Return data
        → Miss: React cache() → already fetching? Deduplicate
        → Miss: Supabase parallel queries (~80-120ms)
      → Render store page
      → Stream: banner → new arrivals → categories → footer
      → Client hydrates interactive parts

PRODUCT PAGE REQUEST:
  User → /store/my-shop/product/silk-saree-abc12345
    → CDN cache hit? Return ISR HTML
    → Miss: Next.js server
      → generateMetadata() → getStoreBySlugCached() + getProductBySlugCached()
        → LRU cache hit? Return data
        → Miss: React cache() → deduplicate
        → Miss: Supabase (store + product in parallel)
      → Render:
        1. BreadcrumbNav (server HTML, 0 JS)
        2. <Suspense><ProductGallery /></Suspense> (streams in)
        3. <Suspense><ProductInfo /></Suspense> (server HTML, 0 JS)
           4. <ClientCartBoundary><AddToCart /></ClientCartBoundary> (hydrates later)
        5. <Suspense><RelatedProducts /></Suspense> (streams in)
      → Client hydrates interactive islands
      → Server Action for Add to Cart

PRODUCT CLICK (client-side navigation):
  User clicks product card
    → Link was prefetched (data in router cache)
    → Instant client-side transition
    → Layout persists (CartProvider still mounted)
    → New page streams in
    → < 100ms perceived navigation
```

### 12.2 Deleted Files After Migration

```
DELETED:  app/store/[slug]/components/ProductDetailModal.tsx
REMOVED:  ProductDetailModal from components/index.ts
REMOVED:  Modal-related state from client-page.tsx
REMOVED:  Modal-related CSS from store.module.css (modals, overlays, animations)
```

### 12.3 New Files After Migration

```
NEW:  app/store/[slug]/product/
        [productSlug]/
          page.tsx
          loading.tsx
          error.tsx

NEW:  app/store/[slug]/product/product.module.css

NEW:  components/product/
        ProductGallery.tsx
        ProductInfo.tsx
        VariantSelector.tsx
        AddToCartSection.tsx
        ProductReviews.tsx
        RelatedProducts.tsx
        RecentlyViewed.tsx

NEW:  app/api/store/[slug]/product/[productSlug]/route.ts

NEW:  lib/product/
        urls.ts
        pricing.ts
        stock.ts
        queries.ts
```

### 12.4 Shared Logic Extract (Critical Refactoring)

Current problem: Pricing and stock logic is duplicated across 3 places:

1. `ProductCardStore.tsx` — `getPriceForSelection()`, `buildPricingInfo()`, `getStockStatus()`
2. `ProductDetailModal.tsx` — `getPriceForVariant()`, `getStockForSize()`, `getAvailableSizesForColor()`
3. `CartContext.tsx` — `updateItemOptions()` price recalculation
4. `CartDrawer.tsx` — `getAvailableSizesForColor()` (duplicate of modal's version)

**Target:** Single source of truth in `lib/product/pricing.ts` and `lib/product/stock.ts`

```typescript
// lib/product/pricing.ts (NEW — single source of truth)
export function getPriceForVariant(
  product: Product,
  selectedColor?: string | null,
  selectedSize?: string | null,
): number { /* single implementation */ }

export function buildPricingInfo(product: Product): CartPricingInfo { /* ... */ }

// lib/product/stock.ts (NEW — single source of truth)
export function getStockForSize(
  product: Product,
  size: string,
  selectedColor?: string | null,
): number { /* single implementation */ }

export function getStockStatus(product: Product): StockStatus { /* ... */ }

export function getAvailableSizesForColor(
  product: Product,
  color: string,
): string[] { /* single implementation */ }
```

---

## APPENDIX: Dependency Graph — What Must Change & What Can Stay

```
WHAT MUST CHANGE:
  app/store/[slug]/client-page.tsx      — remove modal state, add router.push
  app/store/[slug]/components/
    ProductDetailModal.tsx              — DELETE
    index.ts                            — remove ProductDetailModal export
    ProductCardStore.tsx                — onClick → router.push, extract logic
  lib/store.ts                          — add getProductBySlug
  lib/cache/store-cache.ts              — add product cache
  lib/seo/store-metadata.ts             — refactor generateProductMetadata
  lib/seo/product-schema.ts             — refactor to use real URLs

WHAT SHOULD NOT CHANGE:
  app/store/[slug]/layout.tsx           — stays server component
  app/store/[slug]/ClientProviders.tsx  — stays the same
  app/store/[slug]/context/CartContext.tsx — stays (extract pricing to lib)
  app/store/[slug]/components/
    CartDrawer.tsx                      — stays
    SearchOverlay.tsx                   — stays
    StoreHeader.tsx                     — stays
    StoreFooter.tsx                     — stays
    CarouselBanner.tsx                  — stays
    NewArrivalsSection.tsx              — stays
    CategorySection.tsx                 — stays
    CategoryNav.tsx                     — stays
    RecommendedProducts.tsx             — stays
  app/store/[slug]/checkout/page.tsx    — stays
  app/store/[slug]/track-order/page.tsx — stays
  All API routes (except new product endpoint)
  lib/resolve-slug.ts                   — stays
  lib/seo/structured-data.ts            — stays
  All analytics code                    — enhanced, not replaced
  app/layout.tsx                        — stays

WHAT CAN STAY REUSABLE:
  CartContext (addToCart, removeFromCart, updateQuantity)
  CartDrawer component
  SearchOverlay component
  StoreHeader component
  StoreFooter component
  CarouselBanner component
  NewArrivalsSection (horizontal scroll, stays on store page)
  CategorySection (stays on store page)
  CategoryNav (stays on store page)
  RecommendedProducts (stays on store page, and used on PDP)
  Next.js ISR configuration
  LRU cache system (extend with product cache)
  Slug resolution system
  Supabase query patterns (add single product query)
  Analytics event types (view_item, add_to_cart already defined)
  All checkout, payment, order API routes
  All stock validation API routes
```
