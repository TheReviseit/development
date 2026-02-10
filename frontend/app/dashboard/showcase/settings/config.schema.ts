/**
 * Showcase Configuration Schema & Types
 *
 * LOCKED FOR SPRINT 2 - DO NOT MODIFY
 *
 * This defines the contract between:
 * - Backend (JSONB storage)
 * - Frontend (TypeScript types)
 * - Preview (ConfigurableCard)
 */

// ============================================
// CORE TYPES (FROZEN)
// ============================================

export interface PresentationConfig {
  version: number;
  fields: Record<string, FieldConfig>;
  actions: Record<string, ActionConfig>;
  layout: LayoutConfig;
}

export interface FieldConfig {
  visible: boolean;
}

export interface ActionConfig {
  enabled: boolean;
  label: string;
}

export interface LayoutConfig {
  type: string;
  imageRatio: string;
}

export interface ShowcaseSettings {
  version: number;
  presentation: PresentationConfig;
  contentType: ContentType;
}

export type ContentType = "generic" | "visual" | "service" | "catalog";

// ============================================
// DEFAULT CONFIGURATION
// ============================================

export const DEFAULT_CONFIG: PresentationConfig = {
  version: 1,
  fields: {
    price: { visible: true }, // ✅ CHANGED: Enable by default
    colors: { visible: true }, // ✅ CHANGED: Enable by default
    sizes: { visible: true }, // ✅ CHANGED: Enable by default
    stock: { visible: true }, // ✅ CHANGED: Enable by default
    category: { visible: true },
    description: { visible: true },
  },
  actions: {
    order: { enabled: true, label: "Order Now" }, // ✅ CHANGED: Enable by default
    book: { enabled: false, label: "Book Now" },
  },
  layout: {
    type: "standard",
    imageRatio: "1:1",
  },
};

// ============================================
// MOCK DATA FOR PREVIEW
// ============================================

export interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  subtitle?: string;
  imageUrl: string;
  price?: number;
  compareAtPrice?: number;
  category?: string;
  colors?: string[];
  sizes?: string[];
  stockStatus?: "in_stock" | "out_of_stock" | "low_stock";
  stockQuantity?: number;
  isFeatured?: boolean;
  metadata?: Record<string, any>;
}

export const MOCK_PREVIEW_ITEM: ShowcaseItem = {
  id: "preview-1",
  title: "Handcrafted Gold Necklace",
  description:
    "Beautiful handcrafted necklace made with 18K gold and precious stones. Perfect for weddings and special occasions.",
  subtitle: "Premium Collection",
  imageUrl:
    "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&h=400&fit=crop",
  price: 2999,
  compareAtPrice: 3999,
  colors: ["Gold", "Rose Gold", "Silver"],
  sizes: ['16"', '18"', '20"', '22"'],
  stockStatus: "in_stock",
  stockQuantity: 12,
  isFeatured: true,
};

// ============================================
// CONTENT TYPE PRESETS
// ============================================

export const CONTENT_TYPE_PRESETS: Record<
  ContentType,
  Partial<PresentationConfig>
> = {
  visual: {
    // Photography, art, portfolios
    fields: {
      price: { visible: false },
      colors: { visible: false },
      sizes: { visible: false },
      stock: { visible: false },
      category: { visible: true },
      description: { visible: true },
    },
    actions: {
      book: { enabled: true, label: "Book Now" },
      order: { enabled: false, label: "Order Now" },
    },
  },
  catalog: {
    // E-commerce, retail
    fields: {
      price: { visible: true },
      colors: { visible: true },
      sizes: { visible: true },
      stock: { visible: true },
      category: { visible: true },
      description: { visible: true },
    },
    actions: {
      order: { enabled: true, label: "Order Now" },
      book: { enabled: false, label: "Book Now" },
    },
  },
  service: {
    // Appointments, consultations
    fields: {
      price: { visible: true },
      colors: { visible: false },
      sizes: { visible: false },
      stock: { visible: false },
      category: { visible: true },
      description: { visible: true },
    },
    actions: {
      book: { enabled: true, label: "Book Appointment" },
      order: { enabled: false, label: "Order Now" },
    },
  },
  generic: {
    // Minimal default
    fields: {
      price: { visible: false },
      colors: { visible: false },
      sizes: { visible: false },
      stock: { visible: false },
      category: { visible: true },
      description: { visible: true },
    },
    actions: {
      order: { enabled: false, label: "Order Now" },
      book: { enabled: false, label: "Book Now" },
    },
  },
};

// ============================================
// VALIDATION
// ============================================

export function validateConfig(config: any): config is PresentationConfig {
  if (!config || typeof config !== "object") return false;
  if (typeof config.version !== "number") return false;
  if (!config.fields || typeof config.fields !== "object") return false;
  if (!config.actions || typeof config.actions !== "object") return false;
  if (!config.layout || typeof config.layout !== "object") return false;
  return true;
}

export function mergeWithDefaults(
  partial: Partial<PresentationConfig>,
): PresentationConfig {
  return {
    version: partial.version || DEFAULT_CONFIG.version,
    fields: { ...DEFAULT_CONFIG.fields, ...partial.fields },
    actions: { ...DEFAULT_CONFIG.actions, ...partial.actions },
    layout: { ...DEFAULT_CONFIG.layout, ...partial.layout },
  };
}
