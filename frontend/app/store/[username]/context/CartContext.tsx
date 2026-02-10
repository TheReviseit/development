"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

// Types
export interface CartItemOption {
  size?: string;
  color?: string;
}

// Pricing info to recalculate price when options change
export interface CartPricingInfo {
  basePrice: number;
  // Map of color -> price (for variant-based pricing)
  colorPrices?: Record<string, number>;
  // Map of size -> price (for size-based pricing)
  sizePrices?: Record<string, number>;
  // Map of "color_size" -> price (for variant + size pricing)
  variantSizePrices?: Record<string, number>;
  // Flag to indicate if size-based pricing is enabled
  hasSizePricing?: boolean;
  // Base product colors (not variant colors) - for filtering
  baseProductColors?: string[];
  // Base product sizes (available for base product colors)
  baseProductSizes?: string[];
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  options?: CartItemOption;
  addedFromDashboard?: boolean; // Flag to show dropdowns in cart
  availableColors?: string[]; // Available colors for dropdown
  availableSizes?: string[]; // Available sizes for dropdown
  pricingInfo?: CartPricingInfo; // Pricing info for price updates
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (
    product: { id: string; name: string; price: number; imageUrl?: string },
    quantity?: number,
    options?: CartItemOption,
    addedFromDashboard?: boolean,
    availableColors?: string[],
    availableSizes?: string[],
    pricingInfo?: CartPricingInfo,
  ) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateItemOptions: (itemId: string, options: CartItemOption) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isHydrated: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_STORAGE_KEY = "flowauxi_store_cart";

export function CartProvider({
  children,
  username,
}: {
  children: React.ReactNode;
  username: string;
}) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const storageKey = `${CART_STORAGE_KEY}_${username}`;

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCartItems(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to load cart from localStorage:", error);
    }
    setIsHydrated(true);
  }, [storageKey]);

  // Save cart to localStorage on change
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(cartItems));
      } catch (error) {
        console.error("Failed to save cart to localStorage:", error);
      }
    }
  }, [cartItems, isHydrated, storageKey]);

  // Generate unique cart item ID based on product and options
  const generateItemId = useCallback(
    (productId: string, options?: CartItemOption) => {
      const optionStr = options
        ? `_${options.size || ""}_${options.color || ""}`
        : "";
      return `${productId}${optionStr}`;
    },
    [],
  );

  const addToCart = useCallback(
    (
      product: { id: string; name: string; price: number; imageUrl?: string },
      quantity = 1,
      options?: CartItemOption,
      addedFromDashboard?: boolean,
      availableColors?: string[],
      availableSizes?: string[],
      pricingInfo?: CartPricingInfo,
    ) => {
      const itemId = generateItemId(product.id, options);

      setCartItems((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === itemId);

        if (existingIndex >= 0) {
          // Update quantity if item exists
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
          };
          return updated;
        }

        // Add new item
        return [
          ...prev,
          {
            id: itemId,
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity,
            imageUrl: product.imageUrl,
            options,
            addedFromDashboard,
            availableColors,
            availableSizes,
            pricingInfo,
          },
        ];
      });
    },
    [generateItemId],
  );

  const removeFromCart = useCallback((itemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (quantity < 1) {
        removeFromCart(itemId);
        return;
      }

      setCartItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, quantity } : item)),
      );
    },
    [removeFromCart],
  );

  // Update item options (size/color) in cart and recalculate price
  // This mirrors the getPriceForVariant logic from ProductDetailModal
  const updateItemOptions = useCallback(
    (itemId: string, newOptions: CartItemOption) => {
      setCartItems((prev) =>
        prev.map((item) => {
          if (item.id === itemId) {
            const updatedOptions = {
              ...item.options,
              ...newOptions,
            };

            // Calculate new price based on selected options
            // Priority order (same as ProductDetailModal.getPriceForVariant):
            // 1. variantSizePrices[color_size] - variant + size specific price
            // 2. sizePrices[size] - product-level size pricing
            // 3. colorPrices[color] - variant base price (already includes offer price)
            // 4. basePrice - fallback

            let newPrice = item.pricingInfo?.basePrice || item.price;

            if (item.pricingInfo) {
              const color = updatedOptions.color;
              const size = updatedOptions.size;

              let priceFound = false;

              // Priority 1: Check variant + size pricing (color_size key)
              if (color && size && item.pricingInfo.variantSizePrices) {
                const key = `${color}_${size}`;
                if (item.pricingInfo.variantSizePrices[key] !== undefined) {
                  newPrice = item.pricingInfo.variantSizePrices[key];
                  priceFound = true;
                }
                // Try case-insensitive match
                if (!priceFound) {
                  const matchKey = Object.keys(
                    item.pricingInfo.variantSizePrices,
                  ).find((k) => k.toLowerCase() === key.toLowerCase());
                  if (
                    matchKey &&
                    item.pricingInfo.variantSizePrices[matchKey] !== undefined
                  ) {
                    newPrice = item.pricingInfo.variantSizePrices[matchKey];
                    priceFound = true;
                  }
                }
              }

              // Priority 2: Check product-level size pricing
              if (!priceFound && size && item.pricingInfo.sizePrices) {
                if (item.pricingInfo.sizePrices[size] !== undefined) {
                  newPrice = item.pricingInfo.sizePrices[size];
                  priceFound = true;
                }
                // Try case-insensitive match
                if (!priceFound) {
                  const sizeKey = Object.keys(item.pricingInfo.sizePrices).find(
                    (k) => k.toLowerCase() === size.toLowerCase(),
                  );
                  if (
                    sizeKey &&
                    item.pricingInfo.sizePrices[sizeKey] !== undefined
                  ) {
                    newPrice = item.pricingInfo.sizePrices[sizeKey];
                    priceFound = true;
                  }
                }
              }

              // Priority 3: Check variant color pricing (includes offer price)
              if (!priceFound && color && item.pricingInfo.colorPrices) {
                if (item.pricingInfo.colorPrices[color] !== undefined) {
                  newPrice = item.pricingInfo.colorPrices[color];
                  priceFound = true;
                }
              }

              // Priority 4: Use base price (already set as default)
            }

            return {
              ...item,
              options: updatedOptions,
              price: newPrice,
            };
          }
          return item;
        }),
      );
    },
    [],
  );

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const cartTotal = useMemo(() => {
    return cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
  }, [cartItems]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  }, [cartItems]);

  const value = useMemo(
    () => ({
      cartItems,
      addToCart,
      removeFromCart,
      updateQuantity,
      updateItemOptions,
      clearCart,
      cartTotal,
      cartCount,
      isCartOpen,
      setIsCartOpen,
      isHydrated,
    }),
    [
      cartItems,
      addToCart,
      removeFromCart,
      updateQuantity,
      updateItemOptions,
      clearCart,
      cartTotal,
      cartCount,
      isCartOpen,
      isHydrated,
      isHydrated, // Added dependency
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
