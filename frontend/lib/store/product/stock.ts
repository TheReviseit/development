import type { ProductStockData, StockStatus } from "./types";

export function parseSizeStocks(
  sizeStocks: Record<string, number> | string | undefined | null,
): Record<string, number> {
  if (!sizeStocks) return {};
  if (typeof sizeStocks === "object" && sizeStocks !== null) {
    return sizeStocks as Record<string, number>;
  }
  if (typeof sizeStocks === "string") {
    try {
      const parsed = JSON.parse(sizeStocks);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, number>;
      }
    } catch {
      console.warn("Failed to parse sizeStocks:", sizeStocks);
    }
  }
  return {};
}

export function getAvailableSizesForColor(
  product: ProductStockData,
  color: string,
): string[] {
  if (!product.variants || product.variants.length === 0) {
    return product.sizes || [];
  }

  const sizesSet = new Set<string>();
  product.variants.forEach((variant) => {
    if (variant.color === color) {
      if (Array.isArray(variant.size)) {
        variant.size.forEach((s) => sizesSet.add(s));
      } else if (typeof variant.size === "string" && variant.size) {
        variant.size
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => sizesSet.add(s));
      }
    }
  });

  if (sizesSet.size > 0) return Array.from(sizesSet);
  return product.sizes || [];
}

export function getStockForSize(
  product: ProductStockData,
  size: string,
  selectedColor?: string,
): number {
  if (selectedColor && product.variants && product.variants.length > 0) {
    const matchingVariant = product.variants.find(
      (v) => v.color === selectedColor,
    );
    if (matchingVariant) {
      const variantSizeStocks = parseSizeStocks(matchingVariant.sizeStocks);
      if (Object.keys(variantSizeStocks).length > 0) {
        return variantSizeStocks[size] ?? 0;
      }
      return matchingVariant.stock ?? 0;
    }
  }

  if (product.sizeStocks) {
    const productSizeStocks = parseSizeStocks(product.sizeStocks);
    return productSizeStocks[size] ?? 0;
  }

  return 1;
}

export function isSizeOutOfStock(
  product: ProductStockData,
  size: string,
  selectedColor?: string,
): boolean {
  return getStockForSize(product, size, selectedColor) === 0;
}

export function getStockStatus(product: ProductStockData): StockStatus {
  const status: StockStatus = {
    isSoldOut: false,
    isLowStock: false,
    totalStock: 0,
    hasPartialStock: false,
    outOfStockSizes: [],
    outOfStockColors: [],
    stockByVariant: {},
  };

  const variants = product.variants;
  if (variants && variants.length > 0) {
    let totalVariantStock = 0;
    const allSizesStock: Record<string, number> = {};

    variants.forEach((variant) => {
      let variantTotalStock = 0;
      const variantSizeStocks = parseSizeStocks(variant.sizeStocks);

      if (Object.keys(variantSizeStocks).length > 0) {
        Object.entries(variantSizeStocks).forEach(([size, stock]) => {
          const stockNum =
            typeof stock === "number"
              ? stock
              : parseInt(String(stock), 10) || 0;
          variantTotalStock += stockNum;
          allSizesStock[size] = (allSizesStock[size] || 0) + stockNum;
        });
      } else {
        variantTotalStock = variant.stock || 0;
      }

      if (variant.color) {
        status.stockByVariant[variant.color] = {
          stock: variantTotalStock,
          soldOut: variantTotalStock === 0,
        };
      }

      totalVariantStock += variantTotalStock;
    });

    status.totalStock = totalVariantStock;

    const baseProductSizeStocks = parseSizeStocks(product.sizeStocks);
    if (Object.keys(baseProductSizeStocks).length > 0) {
      Object.entries(baseProductSizeStocks).forEach(([size, stock]) => {
        const stockNum =
          typeof stock === "number"
            ? stock
            : parseInt(String(stock), 10) || 0;
        status.totalStock += stockNum;
        allSizesStock[size] = (allSizesStock[size] || 0) + stockNum;
      });
    }

    Object.entries(allSizesStock).forEach(([size, stock]) => {
      if (stock === 0) status.outOfStockSizes.push(size);
    });

    Object.entries(status.stockByVariant).forEach(([color, info]) => {
      if (info.soldOut) status.outOfStockColors.push(color);
    });

    status.hasPartialStock =
      status.outOfStockSizes.length > 0 || status.outOfStockColors.length > 0;
  } else {
    const productSizeStocks = parseSizeStocks(product.sizeStocks);

    if (Object.keys(productSizeStocks).length > 0) {
      let totalSizeStock = 0;
      Object.entries(productSizeStocks).forEach(([size, stock]) => {
        const stockNum =
          typeof stock === "number"
            ? stock
            : parseInt(String(stock), 10) || 0;
        totalSizeStock += stockNum;
        if (stockNum === 0) status.outOfStockSizes.push(size);
      });
      status.totalStock = totalSizeStock;
      status.hasPartialStock = status.outOfStockSizes.length > 0;
    } else if (product.available === false) {
      status.totalStock = 0;
    } else {
      status.totalStock = 1;
    }
  }

  status.isSoldOut = status.totalStock === 0;
  status.isLowStock =
    !status.isSoldOut && status.totalStock > 0 && status.totalStock <= 15;

  return status;
}

export function getAvailableColors(
  product: ProductStockData,
): string[] {
  const colorsSet = new Set<string>();

  if (product.colors) {
    const productColors = Array.isArray(product.colors)
      ? product.colors
      : [product.colors];
    productColors.forEach((c) => {
      if (c) colorsSet.add(c);
    });
  }

  const variants = product.variants;
  if (variants && variants.length > 0) {
    variants.forEach((variant) => {
      if (variant.color) colorsSet.add(variant.color);
    });
  }

  return Array.from(colorsSet);
}

export function getAllSizes(product: ProductStockData): string[] {
  const sizeList: string[] = [];
  const addedSizes = new Set<string>();

  if (product.sizes && product.sizes.length > 0) {
    product.sizes.forEach((s) => {
      if (!addedSizes.has(s)) {
        sizeList.push(s);
        addedSizes.add(s);
      }
    });
  }

  const variants = product.variants;
  if (variants && variants.length > 0) {
    variants.forEach((v) => {
      if (Array.isArray(v.size)) {
        v.size.forEach((s) => {
          if (!addedSizes.has(s)) {
            sizeList.push(s);
            addedSizes.add(s);
          }
        });
      } else if (typeof v.size === "string" && v.size) {
        v.size
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => {
            if (!addedSizes.has(s)) {
              sizeList.push(s);
              addedSizes.add(s);
            }
          });
      }
    });
  }

  return sizeList;
}

export function getColorHex(colorName: string): string {
  const colorMap: Record<string, string> = {
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
    grey: "#6b7280",
    navy: "#1e3a5f",
    brown: "#8b5a2b",
    beige: "#d4b896",
    gold: "#ffd700",
    silver: "#c0c0c0",
    maroon: "#800000",
    olive: "#808000",
    teal: "#008080",
    coral: "#ff7f50",
    cyan: "#00ffff",
  };
  return colorMap[colorName.toLowerCase()] || "#6b7280";
}

export function isBaseProductColor(
  product: { colors?: string | string[] },
  color: string,
): boolean {
  if (!product.colors) return false;
  if (Array.isArray(product.colors)) return product.colors.includes(color);
  if (typeof product.colors === "string") return product.colors === color;
  return false;
}

export function getFirstColor(product: ProductStockData): string | undefined {
  if (product.colors) {
    const baseColors = Array.isArray(product.colors)
      ? product.colors
      : [product.colors].filter(Boolean);
    if (baseColors.length > 0) return baseColors[0];
  }
  const variants = product.variants;
  if (variants && variants.length > 0) return variants[0].color;
  return undefined;
}

export function getFirstSize(
  product: ProductStockData,
  color?: string,
): string | undefined {
  if (color) {
    const sizes = getAvailableSizesForColor(product, color);
    if (sizes.length > 0) return sizes[0];
  }
  if (product.sizes && product.sizes.length > 0) return product.sizes[0];
  const variants = product.variants;
  if (variants && variants.length > 0) {
    const firstVariant = variants[0];
    if (Array.isArray(firstVariant.size) && firstVariant.size.length > 0)
      return firstVariant.size[0];
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
