import type { ProductPricingData, CartPricingInfo } from "./types";

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

export function calculateDiscount(
  originalPrice: number,
  offerPrice: number,
): number {
  if (originalPrice <= 0 || offerPrice >= originalPrice) return 0;
  return Math.round(((originalPrice - offerPrice) / originalPrice) * 100);
}

export function getPriceForSelection(
  product: ProductPricingData,
  selectedColor?: string,
  selectedSize?: string,
): number {
  const variants = product.variants;
  if (selectedColor && variants && variants.length > 0) {
    const matchingVariant = variants.find((v) => {
      const colorMatches = v.color === selectedColor;
      if (selectedSize && v.size) {
        const variantSizes = Array.isArray(v.size)
          ? v.size
          : typeof v.size === "string"
            ? v.size.split(",").map((s) => s.trim())
            : [];
        return colorMatches && variantSizes.includes(selectedSize);
      }
      return colorMatches;
    });

    if (matchingVariant) {
      if (
        matchingVariant.hasSizePricing &&
        matchingVariant.sizePrices &&
        selectedSize
      ) {
        const sizePrice = matchingVariant.sizePrices[selectedSize];
        if (sizePrice !== undefined && sizePrice > 0) return sizePrice;
      }

      if (matchingVariant.compareAtPrice && matchingVariant.compareAtPrice > 0)
        return matchingVariant.compareAtPrice;
      if (matchingVariant.price && matchingVariant.price > 0)
        return matchingVariant.price;
    }
  }

  if (product.hasSizePricing && product.sizePrices && selectedSize) {
    let sizePrice = product.sizePrices[selectedSize];
    if (sizePrice === undefined) {
      const sizeKey = Object.keys(product.sizePrices).find(
        (k) => k.toLowerCase() === selectedSize.toLowerCase(),
      );
      if (sizeKey) sizePrice = product.sizePrices[sizeKey];
    }
    if (sizePrice !== undefined && sizePrice > 0) return sizePrice;
  }

  if (
    !product.hasSizePricing &&
    product.compareAtPrice &&
    product.compareAtPrice > 0
  ) {
    return product.compareAtPrice;
  }
  return product.price;
}

export function getDisplayPriceInfo(product: ProductPricingData): {
  price: number;
  hasRange: boolean;
  minPrice?: number;
  maxPrice?: number;
} {
  const allPrices: number[] = [];

  if (product.hasSizePricing && product.sizePrices) {
    const sp = Object.values(product.sizePrices).filter(
      (p) => typeof p === "number" && p > 0,
    );
    allPrices.push(...sp);
  }

  const variants = product.variants;
  if (variants && variants.length > 0) {
    variants.forEach((v) => {
      if (v.hasSizePricing && v.sizePrices) {
        const vp = Object.values(v.sizePrices).filter(
          (p) => typeof p === "number" && p > 0,
        );
        allPrices.push(...vp);
      } else if (v.price > 0) {
        allPrices.push(v.price);
      }
    });
  }

  const baseSellingPrice =
    product.compareAtPrice && product.compareAtPrice > 0
      ? product.compareAtPrice
      : product.price;

  if (baseSellingPrice > 0) allPrices.push(baseSellingPrice);

  if (allPrices.length > 0) {
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    return {
      price: minPrice,
      hasRange: minPrice !== maxPrice || allPrices.length > 1,
      minPrice,
      maxPrice,
    };
  }

  return { price: product.price, hasRange: false };
}

export function getDiscountInfo(product: {
  price: number;
  compareAtPrice?: number;
}): {
  originalPrice: number;
  offerPrice: number;
  discountPercent: number;
  hasDiscount: boolean;
} {
  if (product.compareAtPrice && product.compareAtPrice > 0) {
    const originalPrice = product.price;
    const offerPrice = product.compareAtPrice;
    const discountPercent =
      offerPrice < originalPrice
        ? calculateDiscount(originalPrice, offerPrice)
        : 0;
    return { originalPrice, offerPrice, discountPercent, hasDiscount: true };
  }
  return {
    originalPrice: product.price,
    offerPrice: product.price,
    discountPercent: 0,
    hasDiscount: false,
  };
}

export function buildPricingInfo(product: ProductPricingData): CartPricingInfo {
  const baseColors = getBaseProductColors(product);
  const baseSizes = (product as { sizes?: string[] }).sizes || [];

  const pricingInfo: CartPricingInfo = {
    basePrice:
      product.compareAtPrice && product.compareAtPrice > 0
        ? product.compareAtPrice
        : product.price,
    hasSizePricing: product.hasSizePricing,
    baseProductColors: baseColors.length > 0 ? baseColors : undefined,
    baseProductSizes: baseSizes.length > 0 ? baseSizes : undefined,
  };

  const variants = product.variants;
  if (variants && variants.length > 0) {
    const colorPrices: Record<string, number> = {};
    const variantSizePrices: Record<string, number> = {};

    variants.forEach((variant) => {
      const variantSizes: string[] = [];
      if (Array.isArray(variant.size)) {
        variantSizes.push(...variant.size);
      } else if (typeof variant.size === "string" && variant.size) {
        variantSizes.push(
          ...variant.size
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }

      variantSizes.forEach((size) => {
        let priceForSize: number;
        if (
          variant.hasSizePricing &&
          variant.sizePrices &&
          variant.sizePrices[size] !== undefined &&
          variant.sizePrices[size] > 0
        ) {
          priceForSize = variant.sizePrices[size];
        } else if (variant.compareAtPrice && variant.compareAtPrice > 0) {
          priceForSize = variant.compareAtPrice;
        } else if (variant.price && variant.price > 0) {
          priceForSize = variant.price;
        } else {
          priceForSize = pricingInfo.basePrice;
        }
        variantSizePrices[`${variant.color}_${size}`] = priceForSize;
      });

      if (!colorPrices[variant.color]) {
        if (variant.compareAtPrice && variant.compareAtPrice > 0) {
          colorPrices[variant.color] = variant.compareAtPrice;
        } else if (variant.price && variant.price > 0) {
          colorPrices[variant.color] = variant.price;
        }
      }
    });

    if (Object.keys(colorPrices).length > 0)
      pricingInfo.colorPrices = colorPrices;
    if (Object.keys(variantSizePrices).length > 0)
      pricingInfo.variantSizePrices = variantSizePrices;
  }

  if (product.hasSizePricing && product.sizePrices) {
    const sizePrices: Record<string, number> = {};
    Object.entries(product.sizePrices).forEach(([size, price]) => {
      if (typeof price === "number" && price > 0) {
        sizePrices[size] = price;
      }
    });
    if (Object.keys(sizePrices).length > 0) pricingInfo.sizePrices = sizePrices;
  }

  return pricingInfo;
}

function getBaseProductColors(
  product: { colors?: string | string[] },
): string[] {
  if (!product.colors) return [];
  if (Array.isArray(product.colors)) return product.colors;
  if (typeof product.colors === "string" && product.colors) return [product.colors];
  return [];
}
