export interface ProductPricingData {
  id: string;
  price: number;
  compareAtPrice?: number;
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  colors?: string | string[];
  variants?: Array<{
    color: string;
    size: string | string[];
    price: number;
    compareAtPrice?: number;
    stock: number;
    hasSizePricing?: boolean;
    sizePrices?: Record<string, number>;
    sizeStocks?: Record<string, number>;
  }>;
}

export interface ProductStockData {
  id: string;
  sizes?: string[];
  colors?: string | string[];
  available?: boolean;
  sizeStocks?: Record<string, number>;
  variants?: ProductPricingData["variants"];
}

export interface CartPricingInfo {
  basePrice: number;
  colorPrices?: Record<string, number>;
  sizePrices?: Record<string, number>;
  variantSizePrices?: Record<string, number>;
  hasSizePricing?: boolean;
  baseProductColors?: string[];
  baseProductSizes?: string[];
}

export interface StockStatus {
  isSoldOut: boolean;
  isLowStock: boolean;
  totalStock: number;
  hasPartialStock: boolean;
  outOfStockSizes: string[];
  outOfStockColors: string[];
  stockByVariant: Record<string, { stock: number; soldOut: boolean }>;
}
