"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import styles from "../store.module.css";
import { useCart } from "../context/CartContext";
import { useRouter, useParams } from "next/navigation";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  compareAtPrice?: number;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  description?: string;
  imageUrl?: string;
  sizes?: string[];
  colors?: string | string[];
  available?: boolean;
  variants?: Array<{
    id: string;
    color: string;
    size: string | string[];
    price: number;
    compareAtPrice?: number;
    stock: number;
    imageUrl?: string;
    imagePublicId?: string;
    sizeStocks?: Record<string, number>;
    hasSizePricing?: boolean;
    sizePrices?: Record<string, number>;
  }>;
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
  badge?: "new" | "premium" | "bestseller" | "hot" | null;
  isWishlisted?: boolean;
  // Size-based pricing fields
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  sizeStocks?: Record<string, number>;
}

interface ProductCardStoreProps {
  product: Product;
  onClick: () => void;
  index: number;
  onAddToCart?: (e: React.MouseEvent) => void;
  onBuyNow?: (e: React.MouseEvent) => void;
  onWishlistToggle?: (productId: string) => void;
}

export default function ProductCardStore({
  product,
  onClick,
  index,
  onAddToCart,
  onBuyNow,
  onWishlistToggle,
}: ProductCardStoreProps) {
  const { cartItems, addToCart, updateQuantity, removeFromCart } = useCart();
  const router = useRouter();
  const params = useParams();
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuyNowLoading, setIsBuyNowLoading] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(
    product.isWishlisted || false,
  );

  // Get quantity from cart
  const cartItem = cartItems.find((item) => item.productId === product.id);
  const quantityInCart = cartItem?.quantity || 0;

  // Simulate initial loading for skeleton effect
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setIsLoading(false);
      },
      600 + index * 80,
    );
    return () => clearTimeout(timer);
  }, [index]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const truncateDescription = (desc: string, maxLength: number = 50) => {
    if (desc.length <= maxLength) return desc;
    return desc.substring(0, maxLength).trim() + "...";
  };

  const rating = product.rating || 4.5;
  const reviewCount = product.reviewCount;
  const description = product.description || "";
  const colors = product.colors || [];

  // =========================================================================
  // ENTERPRISE-GRADE STOCK STATUS CALCULATION
  // Handles ALL inventory scenarios like Amazon/Flipkart
  // =========================================================================
  type StockStatus = {
    isSoldOut: boolean; // TRUE if completely sold out
    isLowStock: boolean; // TRUE if low stock warning needed
    totalStock: number; // Total available stock
    hasPartialStock: boolean; // TRUE if some sizes/colors are out
    outOfStockSizes: string[]; // List of sizes that are sold out
    outOfStockColors: string[]; // List of colors that are sold out
    stockByVariant: Record<string, { stock: number; soldOut: boolean }>;
  };

  // Helper: Parse sizeStocks - handles both string JSON and object
  const parseSizeStocks = (
    sizeStocks: Record<string, number> | string | undefined | null,
  ): Record<string, number> => {
    if (!sizeStocks) return {};

    // If it's already an object, return it
    if (typeof sizeStocks === "object" && sizeStocks !== null) {
      return sizeStocks as Record<string, number>;
    }

    // If it's a string, try to parse it as JSON
    if (typeof sizeStocks === "string") {
      try {
        const parsed = JSON.parse(sizeStocks);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as Record<string, number>;
        }
      } catch (e) {
        console.warn("Failed to parse sizeStocks:", sizeStocks);
      }
    }

    return {};
  };

  const getStockStatus = (): StockStatus => {
    const status: StockStatus = {
      isSoldOut: false,
      isLowStock: false,
      totalStock: 0,
      hasPartialStock: false,
      outOfStockSizes: [],
      outOfStockColors: [],
      stockByVariant: {},
    };

    // CASE 1: Product with variants - check variant stock
    if (product.variants && product.variants.length > 0) {
      let totalVariantStock = 0;
      const allSizesStock: Record<string, number> = {};
      const allColorsStock: Record<string, number> = {};

      product.variants.forEach((variant) => {
        let variantTotalStock = 0;

        // Parse sizeStocks (handles JSON string from DB)
        const variantSizeStocks = parseSizeStocks(variant.sizeStocks);

        // Check if variant has size-level stock
        if (Object.keys(variantSizeStocks).length > 0) {
          // CASE 4: Variant with size_stocks
          Object.entries(variantSizeStocks).forEach(([size, stock]) => {
            const stockNum =
              typeof stock === "number" ? stock : parseInt(String(stock)) || 0;
            variantTotalStock += stockNum;
            allSizesStock[size] = (allSizesStock[size] || 0) + stockNum;
          });
        } else {
          // CASE 3: Variant with stock_quantity only
          variantTotalStock = variant.stock || 0;
        }

        // Track by color
        if (variant.color) {
          allColorsStock[variant.color] =
            (allColorsStock[variant.color] || 0) + variantTotalStock;
          status.stockByVariant[variant.color] = {
            stock: variantTotalStock,
            soldOut: variantTotalStock === 0,
          };
        }

        totalVariantStock += variantTotalStock;
      });

      status.totalStock = totalVariantStock;

      // Detect out of stock sizes
      Object.entries(allSizesStock).forEach(([size, stock]) => {
        if (stock === 0) status.outOfStockSizes.push(size);
      });

      // Detect out of stock colors
      Object.entries(allColorsStock).forEach(([color, stock]) => {
        if (stock === 0) status.outOfStockColors.push(color);
      });

      status.hasPartialStock =
        status.outOfStockSizes.length > 0 || status.outOfStockColors.length > 0;
    }
    // CASE 2: Product with size_stocks (no variants)
    else {
      // Parse product sizeStocks (handles JSON string from DB)
      const productSizeStocks = parseSizeStocks(product.sizeStocks);

      if (Object.keys(productSizeStocks).length > 0) {
        let totalSizeStock = 0;
        Object.entries(productSizeStocks).forEach(([size, stock]) => {
          const stockNum =
            typeof stock === "number" ? stock : parseInt(String(stock)) || 0;
          totalSizeStock += stockNum;
          if (stockNum === 0) {
            status.outOfStockSizes.push(size);
          }
        });
        status.totalStock = totalSizeStock;
        status.hasPartialStock = status.outOfStockSizes.length > 0;
      }
      // CASE 1: Simple product - check available or stock_quantity
      else if (product.available === false) {
        status.totalStock = 0;
      } else {
        // Default: assume in stock if no stock data provided
        status.totalStock = 1;
      }
    }

    // Determine final status
    status.isSoldOut = status.totalStock === 0;

    status.isLowStock =
      !status.isSoldOut && status.totalStock > 0 && status.totalStock <= 15;

    return status;
  };

  const stockStatus = getStockStatus();
  const getDisplayPriceInfo = (): {
    price: number;
    hasRange: boolean;
    minPrice?: number;
    maxPrice?: number;
  } => {
    const allPrices: number[] = [];

    // 1. Check Product-level Size Pricing
    if (product.hasSizePricing && product.sizePrices) {
      const sp = Object.values(product.sizePrices).filter(
        (p) => typeof p === "number" && p > 0,
      ) as number[];
      allPrices.push(...sp);
    }

    // 2. Check Variants
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((v) => {
        // Variant-level size pricing
        if (v.hasSizePricing && v.sizePrices) {
          const vp = Object.values(v.sizePrices).filter(
            (p) => typeof p === "number" && p > 0,
          ) as number[];
          allPrices.push(...vp);
        }
        // Variant base price
        else if (v.price > 0) {
          allPrices.push(v.price);
        }
      });
    }

    // 3. Always include base product price if no specific prices found yet,
    // or as a fallback/comparison point. Use offer price if available.
    const baseSellingPrice =
      product.compareAtPrice && product.compareAtPrice > 0
        ? product.compareAtPrice
        : product.price;

    if (baseSellingPrice > 0) {
      allPrices.push(baseSellingPrice);
    }

    // 4. Calculate Min/Max
    if (allPrices.length > 0) {
      const minPrice = Math.min(...allPrices);
      const maxPrice = Math.max(...allPrices);
      return {
        price: minPrice, // Show lowest price by default
        hasRange: minPrice !== maxPrice || allPrices.length > 1, // Show "From" if range or multiple prices
        minPrice,
        maxPrice,
      };
    }

    // Fallback
    return { price: product.price, hasRange: false };
  };

  const displayPriceInfo = getDisplayPriceInfo();

  // Calculate discount percentage
  const calculateDiscount = (
    originalPrice: number,
    offerPrice: number,
  ): number => {
    if (originalPrice <= 0 || offerPrice >= originalPrice) return 0;
    return Math.round(((originalPrice - offerPrice) / originalPrice) * 100);
  };

  // Calculate discount percentage for the product
  const getDiscountInfo = () => {
    // If product has compareAtPrice, always show both prices
    if (product.compareAtPrice && product.compareAtPrice > 0) {
      const originalPrice = product.price;
      const offerPrice = product.compareAtPrice;
      const discountPercent =
        offerPrice < originalPrice
          ? calculateDiscount(originalPrice, offerPrice)
          : 0;
      return {
        originalPrice,
        offerPrice,
        discountPercent,
        hasDiscount: true, // Always show both prices when compareAtPrice exists
      };
    }
    return {
      originalPrice: product.price,
      offerPrice: product.price,
      discountPercent: 0,
      hasDiscount: false,
    };
  };

  const discountInfo = getDiscountInfo();

  // Check if a color is from the base product (not a variant)
  const isBaseProductColor = (color: string): boolean => {
    if (product.colors) {
      if (Array.isArray(product.colors)) {
        return product.colors.includes(color);
      }
      if (typeof product.colors === "string") {
        return product.colors === color;
      }
    }
    return false;
  };

  // Get variant colors (colors that are only in variants, not base product)
  const getVariantColors = (): string[] => {
    if (!product.variants || product.variants.length === 0) return [];
    const variantColors = new Set<string>();
    product.variants.forEach((v) => {
      if (v.color && !isBaseProductColor(v.color)) {
        variantColors.add(v.color);
      }
    });
    return Array.from(variantColors);
  };

  // Get base product colors only
  const getBaseProductColors = (): string[] => {
    if (!product.colors) return [];
    if (Array.isArray(product.colors)) {
      return product.colors;
    }
    if (typeof product.colors === "string" && product.colors) {
      return [product.colors];
    }
    return [];
  };

  // Get first available color - PRIORITIZE BASE PRODUCT colors over variants
  const getFirstColor = (): string | undefined => {
    // First, try base product colors
    const baseColors = getBaseProductColors();
    if (baseColors.length > 0) {
      return baseColors[0];
    }
    // Fallback to variant colors if no base colors
    if (product.variants && product.variants.length > 0) {
      return product.variants[0].color;
    }
    return undefined;
  };

  // Get available sizes for a specific color
  const getSizesForColor = (color: string): string[] => {
    // If it's a base product color, return base product sizes
    if (isBaseProductColor(color)) {
      return product.sizes || [];
    }

    // For variant colors, find sizes from matching variants
    if (product.variants && product.variants.length > 0) {
      const sizesSet = new Set<string>();
      product.variants.forEach((v) => {
        if (v.color === color) {
          if (Array.isArray(v.size)) {
            v.size.forEach((s) => sizesSet.add(s));
          } else if (typeof v.size === "string" && v.size) {
            const sizes = v.size
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            sizes.forEach((s) => sizesSet.add(s));
          }
        }
      });
      if (sizesSet.size > 0) {
        return Array.from(sizesSet);
      }
    }

    // Fallback to base product sizes
    return product.sizes || [];
  };

  // Get first available size for a specific color
  const getFirstSizeForColor = (color?: string): string | undefined => {
    if (!color) {
      // No color specified, use base product sizes first
      if (product.sizes && product.sizes.length > 0) {
        return product.sizes[0];
      }
      // Fallback to first variant's sizes
      if (product.variants && product.variants.length > 0) {
        const firstVariant = product.variants[0];
        if (Array.isArray(firstVariant.size) && firstVariant.size.length > 0) {
          return firstVariant.size[0];
        }
        if (typeof firstVariant.size === "string" && firstVariant.size) {
          const sizes = firstVariant.size
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          return sizes[0];
        }
      }
      return undefined;
    }

    const sizes = getSizesForColor(color);
    return sizes.length > 0 ? sizes[0] : undefined;
  };

  // Get first available size (backward compatible)
  const getFirstSize = (): string | undefined => {
    const firstColor = getFirstColor();
    return getFirstSizeForColor(firstColor);
  };

  // Get all available colors for the product - BASE PRODUCT COLORS FIRST
  const getAllColors = (): string[] => {
    const colorList: string[] = [];
    const addedColors = new Set<string>();

    // First, add base product colors (they should appear first in dropdown)
    if (product.colors) {
      if (Array.isArray(product.colors)) {
        product.colors.forEach((c) => {
          if (!addedColors.has(c)) {
            colorList.push(c);
            addedColors.add(c);
          }
        });
      } else if (typeof product.colors === "string") {
        if (!addedColors.has(product.colors)) {
          colorList.push(product.colors);
          addedColors.add(product.colors);
        }
      }
    }

    // Then, add variant colors (only those not already added)
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((v) => {
        if (v.color && !addedColors.has(v.color)) {
          colorList.push(v.color);
          addedColors.add(v.color);
        }
      });
    }

    return colorList;
  };

  // Get all available sizes for the product - BASE PRODUCT SIZES FIRST
  const getAllSizes = (): string[] => {
    const sizeList: string[] = [];
    const addedSizes = new Set<string>();

    // First, add base product sizes (they should appear first in dropdown)
    if (product.sizes && product.sizes.length > 0) {
      product.sizes.forEach((s) => {
        if (!addedSizes.has(s)) {
          sizeList.push(s);
          addedSizes.add(s);
        }
      });
    }

    // Then, add variant sizes (only those not already added)
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((v) => {
        if (Array.isArray(v.size)) {
          v.size.forEach((s) => {
            if (!addedSizes.has(s)) {
              sizeList.push(s);
              addedSizes.add(s);
            }
          });
        } else if (typeof v.size === "string" && v.size) {
          // Handle comma-separated size strings - split into individual sizes
          const sizes = v.size
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          sizes.forEach((s) => {
            if (!addedSizes.has(s)) {
              sizeList.push(s);
              addedSizes.add(s);
            }
          });
        }
      });
    }

    return sizeList;
  };

  // Build pricing info for cart price updates
  // This mirrors the getPriceForVariant logic from ProductDetailModal
  const buildPricingInfo = () => {
    const baseColors = getBaseProductColors();
    const baseSizes = product.sizes || [];

    const pricingInfo: {
      basePrice: number;
      colorPrices?: Record<string, number>;
      sizePrices?: Record<string, number>;
      variantSizePrices?: Record<string, number>;
      hasSizePricing?: boolean;
      baseProductColors?: string[];
      baseProductSizes?: string[];
    } = {
      basePrice:
        product.compareAtPrice && product.compareAtPrice > 0
          ? product.compareAtPrice // Use offer price as base
          : product.price,
      hasSizePricing: product.hasSizePricing,
      baseProductColors: baseColors.length > 0 ? baseColors : undefined,
      baseProductSizes: baseSizes.length > 0 ? baseSizes : undefined,
    };

    // Build pricing from variants
    if (product.variants && product.variants.length > 0) {
      const colorPrices: Record<string, number> = {};
      const variantSizePrices: Record<string, number> = {};

      product.variants.forEach((variant) => {
        // Get all sizes for this variant
        const variantSizes: string[] = [];
        if (Array.isArray(variant.size)) {
          variantSizes.push(...variant.size);
        } else if (typeof variant.size === "string" && variant.size) {
          // Handle comma-separated size strings
          const sizes = variant.size
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          variantSizes.push(...sizes);
        }

        // For each size in this variant, calculate and store the price
        variantSizes.forEach((size) => {
          let priceForSize: number;

          // Priority 1: Variant-level size pricing
          if (
            variant.hasSizePricing &&
            variant.sizePrices &&
            variant.sizePrices[size] !== undefined &&
            variant.sizePrices[size] > 0
          ) {
            priceForSize = variant.sizePrices[size];
          }
          // Priority 2: Variant offer price (compareAtPrice)
          else if (variant.compareAtPrice && variant.compareAtPrice > 0) {
            priceForSize = variant.compareAtPrice;
          }
          // Priority 3: Variant base price
          else if (variant.price && variant.price > 0) {
            priceForSize = variant.price;
          }
          // Fallback to product base/offer price
          else {
            priceForSize = pricingInfo.basePrice;
          }

          variantSizePrices[`${variant.color}_${size}`] = priceForSize;
        });

        // Store variant's default price for just selecting the color (no size)
        // Use offer price if available, otherwise base price
        if (!colorPrices[variant.color]) {
          if (variant.compareAtPrice && variant.compareAtPrice > 0) {
            colorPrices[variant.color] = variant.compareAtPrice;
          } else if (variant.price && variant.price > 0) {
            colorPrices[variant.color] = variant.price;
          }
        }
      });

      if (Object.keys(colorPrices).length > 0) {
        pricingInfo.colorPrices = colorPrices;
      }
      if (Object.keys(variantSizePrices).length > 0) {
        pricingInfo.variantSizePrices = variantSizePrices;
      }
    }

    // Build size prices from product-level size pricing
    if (product.hasSizePricing && product.sizePrices) {
      const sizePrices: Record<string, number> = {};
      Object.entries(product.sizePrices).forEach(([size, price]) => {
        if (typeof price === "number" && price > 0) {
          sizePrices[size] = price;
        }
      });
      if (Object.keys(sizePrices).length > 0) {
        pricingInfo.sizePrices = sizePrices;
      }
    }

    return pricingInfo;
  };

  // Get price for a specific color/size selection
  // This mirrors the getPriceForVariant logic from ProductDetailModal
  const getPriceForSelection = (
    selectedColor?: string,
    selectedSize?: string,
  ): number => {
    // Priority 1: Check variant-level size pricing
    if (selectedColor && product.variants && product.variants.length > 0) {
      // Find variant matching selected color
      const matchingVariant = product.variants.find((v) => {
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
        // Check if this variant has size-based pricing
        if (
          matchingVariant.hasSizePricing &&
          matchingVariant.sizePrices &&
          selectedSize
        ) {
          const sizePrice = matchingVariant.sizePrices[selectedSize];
          if (sizePrice !== undefined && sizePrice > 0) {
            return sizePrice;
          }
        }

        // Use variant's offer price if available
        if (
          matchingVariant.compareAtPrice &&
          matchingVariant.compareAtPrice > 0
        ) {
          return matchingVariant.compareAtPrice;
        }
        // Otherwise use variant base price
        if (matchingVariant.price && matchingVariant.price > 0) {
          return matchingVariant.price;
        }
      }
    }

    // Priority 2: Check product-level sizePrices
    if (product.hasSizePricing && product.sizePrices && selectedSize) {
      let sizePrice = product.sizePrices[selectedSize];
      // Try case-insensitive match
      if (sizePrice === undefined) {
        const sizeKey = Object.keys(product.sizePrices).find(
          (key) => key.toLowerCase() === selectedSize.toLowerCase(),
        );
        if (sizeKey) {
          sizePrice = product.sizePrices[sizeKey];
        }
      }
      if (sizePrice !== undefined && sizePrice > 0) {
        return sizePrice;
      }
    }

    // Fallback: Use offer price if available, otherwise base price
    if (
      !product.hasSizePricing &&
      product.compareAtPrice &&
      product.compareAtPrice > 0
    ) {
      return product.compareAtPrice;
    }
    return product.price;
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Auto-select first color and size when adding from dashboard
    const firstColor = getFirstColor();
    const firstSize = getFirstSize();
    const allColors = getAllColors();
    const allSizes = getAllSizes();

    const options: { size?: string; color?: string } = {};
    if (firstColor) options.color = firstColor;
    if (firstSize) options.size = firstSize;

    // Build pricing info for price updates when changing options
    const pricingInfo = buildPricingInfo();

    // Calculate the correct price for the selected first color and size
    const initialPrice = getPriceForSelection(firstColor, firstSize);

    addToCart(
      {
        id: product.id,
        name: product.name,
        price: initialPrice,
        imageUrl: product.imageUrl,
      },
      1,
      Object.keys(options).length > 0 ? options : undefined,
      true, // addedFromDashboard flag
      allColors.length > 0 ? allColors : undefined,
      allSizes.length > 0 ? allSizes : undefined,
      pricingInfo,
    );
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartItem) {
      updateQuantity(cartItem.id, quantityInCart + 1);
    }
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartItem && quantityInCart > 1) {
      updateQuantity(cartItem.id, quantityInCart - 1);
    } else if (cartItem) {
      removeFromCart(cartItem.id);
    }
  };

  const handleBuyNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBuyNowLoading(true);

    if (quantityInCart === 0) {
      // Auto-select first color and size when adding from dashboard
      const firstColor = getFirstColor();
      const firstSize = getFirstSize();
      const allColors = getAllColors();
      const allSizes = getAllSizes();

      const options: { size?: string; color?: string } = {};
      if (firstColor) options.color = firstColor;
      if (firstSize) options.size = firstSize;

      // Build pricing info for price updates when changing options
      const pricingInfo = buildPricingInfo();

      // Calculate the correct price for the selected first color and size
      const initialPrice = getPriceForSelection(firstColor, firstSize);

      addToCart(
        {
          id: product.id,
          name: product.name,
          price: initialPrice,
          imageUrl: product.imageUrl,
        },
        1,
        Object.keys(options).length > 0 ? options : undefined,
        true, // addedFromDashboard flag
        allColors.length > 0 ? allColors : undefined,
        allSizes.length > 0 ? allSizes : undefined,
        pricingInfo,
      );
    }
    // Redirect to checkout
    router.push(`/store/${params.username}/checkout`);
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsWishlisted(!isWishlisted);
    if (onWishlistToggle) {
      onWishlistToggle(product.id);
    }
  };

  // Color mapping for swatches
  const getColorHex = (colorName: string) => {
    const colorMap: { [key: string]: string } = {
      black: "#1a1a1a",
      white: "#ffffff",
      red: "#ef4444",
      blue: "#3b82f6",
      green: "#22c55e",
      yellow: "#eab308",
      pink: "#ec4899",
      purple: "#a855f7",
      orange: "#f97316",
      gray: "#6b7280",
      navy: "#1e3a5f",
      brown: "#8b5a2b",
      beige: "#d4b896",
      gold: "#ffd700",
      silver: "#c0c0c0",
    };
    return colorMap[colorName.toLowerCase()] || "#6b7280";
  };

  // Skeleton Loading State
  if (isLoading) {
    return (
      <motion.article
        className={styles.novaCard}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: index * 0.05,
          ease: [0.25, 0.1, 0.25, 1],
        }}
      >
        {/* Skeleton Image */}
        <div className={styles.novaImageContainer}>
          <div className={styles.skeletonImage}>
            <div className={styles.skeletonShimmer} />
          </div>
        </div>

        {/* Skeleton Content */}
        <div className={styles.novaContent}>
          <div className={styles.skeletonTitle}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonDescription}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonPriceRow}>
            <div className={styles.skeletonPrice}>
              <div className={styles.skeletonShimmer} />
            </div>
            <div className={styles.skeletonColors}>
              <div className={styles.skeletonShimmer} />
            </div>
          </div>
          <div className={styles.skeletonBuyBtn}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonCartBtn}>
            <div className={styles.skeletonShimmer} />
          </div>
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article
      className={styles.novaCard}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={{ y: -4 }}
    >
      {/* Image Container - Light gray background */}
      <div className={styles.novaImageContainer}>
        {/* Skeleton Loading for Image */}
        {!isImageLoaded && product.imageUrl && (
          <div className={styles.skeletonImage}>
            <div className={styles.skeletonShimmer} />
          </div>
        )}

        {/* Product Image */}
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`${styles.novaImage} ${
              isImageLoaded ? styles.novaImageLoaded : ""
            } ${stockStatus.isSoldOut ? styles.novaImageSoldOut : ""}`}
            loading="lazy"
            onLoad={() => setIsImageLoaded(true)}
            onError={() => setIsImageLoaded(true)}
          />
        ) : (
          <div className={styles.novaImagePlaceholder}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* SOLD OUT Badge - Top Right Corner */}
        {stockStatus.isSoldOut && (
          <div className={styles.soldOutBadge}>
            <span>SOLD OUT</span>
          </div>
        )}

        {/* LOW STOCK Warning Badge */}
        {stockStatus.isLowStock && !stockStatus.isSoldOut && (
          <div className={styles.lowStockBadge}>
            <span>
              {stockStatus.totalStock <= 5
                ? `Only ${stockStatus.totalStock} left!`
                : "Only few left!"}
            </span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className={styles.novaContent}>
        {/* Product Title */}
        <h3 className={styles.novaTitle}>{product.name}</h3>

        {/* Description */}
        {description && (
          <p className={styles.novaDescription}>
            {truncateDescription(description)}
          </p>
        )}

        {/* Price Row with Rating on right */}
        <div className={styles.novaPriceRow}>
          <div className={styles.novaPriceContainer}>
            {discountInfo.hasDiscount ? (
              // Always show original price (striked) on left, offer price with discount % on right (NO "From" text)
              // Always show original price (striked) on left, offer price with discount % on right (NO "From" text)
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                <span className={styles.novaOriginalPrice}>
                  {formatPrice(discountInfo.originalPrice)}
                </span>
                <span className={styles.novaPrice}>
                  {formatPrice(discountInfo.offerPrice)}
                </span>
                {discountInfo.discountPercent > 0 && (
                  <span className={styles.novaDiscountBadge}>
                    {discountInfo.discountPercent}% OFF
                  </span>
                )}
              </div>
            ) : displayPriceInfo.hasRange ? (
              // Show price range for size-based pricing (no offer price)
              <span className={styles.novaPrice}>
                From {formatPrice(displayPriceInfo.minPrice!)}
              </span>
            ) : (
              // Show regular price
              <span className={styles.novaPrice}>
                {formatPrice(displayPriceInfo.price)}
              </span>
            )}
          </div>

          {/* Rating on right side */}
          <div className={styles.novaRating}>
            <svg
              className={styles.novaHeartIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className={styles.novaRatingValue}>{rating.toFixed(1)}</span>
          </div>
        </div>

        {/* Buttons Row - Cart/Qty left, Buy Now right (stacked on mobile when in cart) */}
        <div
          className={`${styles.novaButtonsRow} ${
            quantityInCart > 0 ? styles.novaButtonsRowStacked : ""
          }`}
        >
          {quantityInCart === 0 ? (
            <motion.button
              className={`${styles.novaCartIconBtn} ${stockStatus.isSoldOut ? styles.novaCartIconBtnDisabled : ""}`}
              onClick={stockStatus.isSoldOut ? undefined : handleAddToCart}
              whileHover={stockStatus.isSoldOut ? {} : { scale: 1.05 }}
              whileTap={stockStatus.isSoldOut ? {} : { scale: 0.95 }}
              aria-label={
                stockStatus.isSoldOut ? "Out of stock" : "Add to cart"
              }
              disabled={stockStatus.isSoldOut}
            >
              <img
                src="/icons/cart.svg"
                alt="Cart"
                className={styles.cartIcon}
              />
            </motion.button>
          ) : (
            <div className={styles.quantityControls}>
              <motion.button
                className={styles.quantityBtn}
                onClick={handleDecrement}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Decrease quantity"
              >
                −
              </motion.button>
              <span className={styles.quantityValue}>{quantityInCart}</span>
              <motion.button
                className={styles.quantityBtn}
                onClick={handleIncrement}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Increase quantity"
              >
                +
              </motion.button>
            </div>
          )}

          <motion.button
            className={`${styles.novaBuyNowBtn} ${isBuyNowLoading ? styles.novaBuyNowBtnLoading : ""} ${stockStatus.isSoldOut ? styles.novaBuyNowBtnDisabled : ""}`}
            onClick={stockStatus.isSoldOut ? undefined : handleBuyNow}
            whileHover={
              stockStatus.isSoldOut ? {} : { scale: isBuyNowLoading ? 1 : 1.02 }
            }
            whileTap={
              stockStatus.isSoldOut ? {} : { scale: isBuyNowLoading ? 1 : 0.98 }
            }
            disabled={isBuyNowLoading || stockStatus.isSoldOut}
          >
            {isBuyNowLoading ? (
              <span className={styles.buyNowSpinner}></span>
            ) : stockStatus.isSoldOut ? (
              "Sold Out"
            ) : (
              "Buy Now"
            )}
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}
