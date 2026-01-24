"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./add-product.module.css";
import ProductImageUpload from "../../components/ProductImageUpload";
import SearchableDropdown from "../../components/SearchableDropdown";
import type { SearchableOption } from "../../components/SearchableDropdown";

// Variant type definition
interface ProductVariant {
  id: string;
  color: string;
  size: string[];
  price: number;
  stock: number;
  imageUrl: string;
  imagePublicId: string;
  sizeStocks?: Record<string, number>;
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
}

// Default fallback options (used if DB options not available)
const DEFAULT_COLOR_OPTIONS = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#EF4444" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Green", hex: "#22C55A" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Gray", hex: "#6B7280" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Purple", hex: "#A855F7" },
  { name: "Orange", hex: "#F97316" },
];

const DEFAULT_SIZE_OPTIONS = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "Free Size",
];

// Color option interface
interface ColorOption {
  name: string;
  hex: string;
}

// Product type definition
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  compareAtPrice: number;
  priceUnit: string;
  duration: string;
  available: boolean;
  description: string;
  sku: string;
  stockStatus: string;
  quantity: number;
  imageUrl: string;
  imagePublicId: string;
  originalSize: number;
  optimizedSize: number;
  variants: ProductVariant[];
  sizes: string[];
  colors: string;
  brand: string;
  materials: string[];
  sellingType: string;
  weight: number;
  weightUnit: string;
  packageLength: number;
  packageBreadth: number;
  packageWidth: number;
  images: string[];
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  sizeStocks?: Record<string, number>;
}

// Selling type options (Hidden as per user request, but keeping type for compatibility)
const SELLING_TYPES = [
  { value: "in-store", label: "In-store selling only" },
  { value: "online", label: "Online selling only" },
  { value: "both", label: "Available both in-store and online" },
];

// Create empty product
const createEmptyProduct = (): Product => ({
  id: Date.now().toString(),
  name: "",
  category: "",
  price: 0,
  compareAtPrice: 0,
  priceUnit: "INR",
  duration: "",
  available: true,
  description: "",
  sku: "",
  stockStatus: "in_stock",
  quantity: 0,
  imageUrl: "",
  imagePublicId: "",
  originalSize: 0,
  optimizedSize: 0,
  variants: [],
  sizes: [],
  colors: "",
  brand: "",
  materials: [],
  sellingType: "in-store",
  weight: 0,
  weightUnit: "kg",
  packageLength: 0,
  packageBreadth: 0,
  packageWidth: 0,
  images: [],
  hasSizePricing: false,
  sizePrices: {},
  sizeStocks: {},
});

// Multi-Select Dropdown Component (for colors and sizes)
function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder,
  multi = false,
}: {
  options: string[];
  value: string | string[];
  onChange: (val: string | string[]) => void;
  placeholder: string;
  multi?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    return options.filter((opt) =>
      opt.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [options, searchTerm]);

  const toggleOption = (option: string) => {
    if (multi) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(option)) {
        onChange(currentValues.filter((v) => v !== option));
      } else {
        onChange([...currentValues, option]);
      }
    } else {
      onChange(option);
      setIsOpen(false);
    }
  };

  const isSelected = (option: string) => {
    if (multi) {
      return Array.isArray(value) && value.includes(option);
    }
    return value === option;
  };

  const displayValue = () => {
    if (multi) {
      const vals = Array.isArray(value) ? value : [];
      return vals.length > 0 ? vals.join(", ") : placeholder;
    }
    return value || placeholder;
  };

  return (
    <div className={styles.customDropdown} ref={dropdownRef}>
      <button
        type="button"
        className={`${styles.dropdownTrigger} ${isOpen ? styles.open : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.dropdownValue}>
          <span
            style={{
              color:
                !value || (Array.isArray(value) && value.length === 0)
                  ? "rgba(255,255,255,0.4)"
                  : "#fff",
            }}
          >
            {displayValue()}
          </span>
        </span>
        <svg
          className={styles.dropdownArrow}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline
            points="6 9 12 15 18 9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.dropdownMenu}>
          {/* Search Input */}
          <div className={styles.dropdownSearchWrapper}>
            <input
              type="text"
              className={styles.dropdownSearchInput}
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>

          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt}
                className={`${styles.dropdownItem} ${isSelected(opt) ? styles.selected : ""}`}
                onClick={() => toggleOption(opt)}
              >
                <span className={styles.dropdownItemText}>{opt}</span>
                {isSelected(opt) && (
                  <svg
                    className={styles.dropdownItemCheck}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline
                      points="20 6 9 17 4 12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            ))
          ) : (
            <div className={styles.noCategories}>No matches found.</div>
          )}
        </div>
      )}
    </div>
  );
}

// LocalStorage key for draft product
const DRAFT_PRODUCT_KEY = "draft_product_add";

export default function AddProductPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<Product>(createEmptyProduct());
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showOfferPrice, setShowOfferPrice] = useState(false);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [customCategory, setCustomCategory] = useState("");
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  // Dynamic color and size options from database
  const [colorOptions, setColorOptions] = useState<ColorOption[]>(
    DEFAULT_COLOR_OPTIONS,
  );
  const [sizeOptions, setSizeOptions] =
    useState<string[]>(DEFAULT_SIZE_OPTIONS);

  // Add a new variant
  const addVariant = () => {
    const newVariant: ProductVariant = {
      id: Date.now().toString(),
      color: "",
      size: [],
      price: formData.price || 0,
      stock: 0,
      imageUrl: "",
      imagePublicId: "",
      sizeStocks: {},
    };
    setProductVariants([...productVariants, newVariant]);
  };

  // Update a variant - using functional update to handle consecutive calls properly
  const updateVariant = (
    id: string,
    field: keyof ProductVariant,
    value: string | string[] | number | boolean | Record<string, number>,
  ) => {
    setProductVariants((prevVariants) =>
      prevVariants.map((v) => {
        if (v.id === id) {
          const updated = { ...v, [field]: value };

          // Cleanup sizeStocks if size changed
          if (field === "size" && updated.sizeStocks) {
            const newSizeStocks = { ...updated.sizeStocks };
            const sizes = value as string[];
            Object.keys(newSizeStocks).forEach((s) => {
              if (!sizes.includes(s)) {
                delete newSizeStocks[s];
              }
            });
            updated.sizeStocks = newSizeStocks;
          }

          return updated;
        }
        return v;
      }),
    );
  };

  // Remove a variant
  const removeVariant = (id: string) => {
    setProductVariants(productVariants.filter((v) => v.id !== id));
  };

  // Load categories, color/size options, and restore draft from localStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load categories from API
        const response = await fetch("/api/products/categories");
        if (response.ok) {
          const result = await response.json();
          if (result.categories) {
            setProductCategories(
              result.categories.map((c: { name: string }) => c.name),
            );
          }
        }

        // Load color and size options from business settings
        const businessResponse = await fetch("/api/business/get");
        if (businessResponse.ok) {
          const businessResult = await businessResponse.json();
          if (businessResult.data) {
            if (
              businessResult.data.colorOptions &&
              businessResult.data.colorOptions.length > 0
            ) {
              setColorOptions(businessResult.data.colorOptions);
            }
            if (
              businessResult.data.sizeOptions &&
              businessResult.data.sizeOptions.length > 0
            ) {
              setSizeOptions(businessResult.data.sizeOptions);
            }
          }
        }

        // Restore draft from localStorage
        const savedDraft = localStorage.getItem(DRAFT_PRODUCT_KEY);
        if (savedDraft) {
          try {
            const draft = JSON.parse(savedDraft);
            setFormData(draft.formData || createEmptyProduct());
            setProductVariants(draft.productVariants || []);
            setCustomCategory(draft.customCategory || "");
            setShowOfferPrice(draft.showOfferPrice || false);
          } catch (e) {
            console.error("Error parsing saved draft:", e);
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
        setIsDataLoaded(true);
      }
    };
    loadData();
  }, []);

  // Auto-save draft to localStorage whenever form data changes
  useEffect(() => {
    if (!isDataLoaded) return; // Don't save until initial data is loaded

    const draft = {
      formData,
      productVariants,
      customCategory,
      showOfferPrice,
      timestamp: Date.now(),
    };
    localStorage.setItem(DRAFT_PRODUCT_KEY, JSON.stringify(draft));
  }, [formData, productVariants, customCategory, showOfferPrice, isDataLoaded]);

  // Update field helper
  const updateField = (field: keyof Product, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle save - uses new normalized /api/products endpoint
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "Product name is required" });
      return;
    }

    setSaving(true);
    try {
      // If a new custom category was created, add it first
      if (customCategory && !productCategories.includes(customCategory)) {
        await fetch("/api/products/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: customCategory }),
        });
      }

      // Build product data for the new API
      const productData = {
        name: formData.name,
        description: formData.description,
        sku: formData.sku,
        brand: formData.brand,
        price: formData.price,
        compareAtPrice: formData.compareAtPrice,
        priceUnit: formData.priceUnit,
        stockStatus: formData.stockStatus,
        stockQuantity: formData.quantity,
        imageUrl: formData.imageUrl,
        imagePublicId: formData.imagePublicId,
        duration: formData.duration,
        sizes: formData.sizes,
        colors: formData.colors ? [formData.colors] : [],
        materials: formData.materials,
        available: formData.available,
        category: formData.category || customCategory,
        variants: productVariants,
      };

      // Create product via new API
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
      });

      if (response.ok) {
        // Clear the draft from localStorage on successful save
        localStorage.removeItem(DRAFT_PRODUCT_KEY);
        setMessage({ type: "success", text: "Product added successfully!" });
        setTimeout(() => {
          router.push("/dashboard/products");
        }, 1000);
      } else {
        const error = await response.json();
        setMessage({
          type: "error",
          text: error.error || "Failed to save product",
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save product" });
    } finally {
      setSaving(false);
    }
  };

  // Handle discard
  const handleDiscard = () => {
    // Clear the draft from localStorage when discarding
    localStorage.removeItem(DRAFT_PRODUCT_KEY);
    router.push("/dashboard/products");
  };

  // Auto-dismiss message
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <Link href="/dashboard/products" className={styles.backLink}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to product list
          </Link>
          <h1 className={styles.pageTitle}>Add New Product</h1>
          {isDataLoaded && (
            <p
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.5)",
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Draft auto-saved
            </p>
          )}
        </div>
      </div>

      {/* Main Content Area (Single Column) */}
      <div>
        {/* Combined Details Section */}
        <div className={styles.section}>
          <div className={styles.field} style={{ marginBottom: "32px" }}>
            <label className={styles.label}>Product Images</label>
            <ProductImageUpload
              productId={formData.id}
              imageUrl={formData.imageUrl || ""}
              imagePublicId={formData.imagePublicId || ""}
              onUpload={(result) => {
                updateField("imageUrl", result.secure_url);
                updateField("imagePublicId", result.public_id);
                updateField("originalSize", result.original_size || 0);
                updateField("optimizedSize", result.bytes);
              }}
              onDelete={() => {
                updateField("imageUrl", "");
                updateField("imagePublicId", "");
                updateField("originalSize", 0);
                updateField("optimizedSize", 0);
              }}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Product Name</label>
            <input
              type="text"
              className={styles.input}
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g., Full Spectrum CBD Tincture - Pet Tincture"
            />
          </div>

          {/* Pricing - Moved here from separate card */}
          <div className={styles.fieldsRow}>
            <div className={styles.field}>
              <label className={styles.label}>Price</label>
              <div className={styles.inputWithPrefix}>
                <span className={styles.inputPrefix}>$</span>
                <input
                  type="number"
                  className={`${styles.input} ${styles.inputWithPrefixField}`}
                  value={formData.price || ""}
                  onChange={(e) => {
                    const newPrice = parseFloat(e.target.value) || 0;
                    updateField("price", newPrice);
                    // If offer price is OFF and size pricing is ON, propagate change to sizes
                    if (
                      !showOfferPrice &&
                      formData.hasSizePricing &&
                      formData.sizes &&
                      formData.sizes.length > 0
                    ) {
                      const updatedPrices: Record<string, number> = {};
                      formData.sizes.forEach((size) => {
                        updatedPrices[size] = newPrice;
                      });
                      updateField("sizePrices", updatedPrices);
                    }
                  }}
                  placeholder="180.00"
                />
              </div>
            </div>
            <div className={styles.field}>
              <div
                className={styles.fieldHeader}
                style={{ marginBottom: "8px" }}
              >
                <label className={styles.label} style={{ margin: 0 }}>
                  Offer Price
                </label>
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => {
                    const newShowOfferPrice = !showOfferPrice;
                    setShowOfferPrice(newShowOfferPrice);
                    // If size pricing is enabled, update size prices based on offer price toggle state
                    if (
                      formData.hasSizePricing &&
                      formData.sizes &&
                      formData.sizes.length > 0
                    ) {
                      const updatedPrices: Record<string, number> = {};
                      if (newShowOfferPrice) {
                        // Turning ON offer price - use offer price (or current price if compareAtPrice not set yet)
                        const offerPrice =
                          formData.compareAtPrice || formData.price || 0;
                        formData.sizes.forEach((size) => {
                          updatedPrices[size] = offerPrice;
                        });
                      } else {
                        // Turning OFF offer price - use regular price
                        formData.sizes.forEach((size) => {
                          updatedPrices[size] = formData.price ?? 0;
                        });
                      }
                      updateField("sizePrices", updatedPrices);
                    }
                  }}
                  style={{
                    width: "40px",
                    height: "22px",
                    borderRadius: "11px",
                    border: "none",
                    background: showOfferPrice
                      ? "#22c55a"
                      : "rgba(255,255,255,0.2)",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s ease",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "2px",
                      left: showOfferPrice ? "20px" : "2px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.2s ease",
                    }}
                  />
                </button>
              </div>
              {showOfferPrice && (
                <div style={{ position: "relative" }}>
                  <div className={styles.inputWithPrefix}>
                    <span className={styles.inputPrefix}>$</span>
                    <input
                      type="number"
                      className={`${styles.input} ${styles.inputWithPrefixField}`}
                      value={formData.compareAtPrice || ""}
                      onChange={(e) => {
                        const newOfferPrice = parseFloat(e.target.value) || 0;
                        updateField("compareAtPrice", newOfferPrice);
                        // If offer price is ON and size pricing is ON, propagate change to sizes
                        if (
                          showOfferPrice &&
                          formData.hasSizePricing &&
                          formData.sizes &&
                          formData.sizes.length > 0
                        ) {
                          const updatedPrices: Record<string, number> = {};
                          formData.sizes.forEach((size) => {
                            updatedPrices[size] = newOfferPrice;
                          });
                          updateField("sizePrices", updatedPrices);
                        }
                      }}
                      placeholder="320.00"
                      style={{ paddingRight: "40px" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOfferPrice(false);
                      updateField("compareAtPrice", 0);
                      // Update size prices to use regular price when offer price is removed
                      if (
                        formData.hasSizePricing &&
                        formData.sizes &&
                        formData.sizes.length > 0
                      ) {
                        const updatedPrices: Record<string, number> = {};
                        formData.sizes.forEach((size) => {
                          updatedPrices[size] = formData.price ?? 0;
                        });
                        updateField("sizePrices", updatedPrices);
                      }
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                      fontSize: "18px",
                      padding: "4px",
                    }}
                    title="Remove offer price"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Color and Size Fields */}
          <div className={styles.fieldsRow}>
            <div className={styles.field}>
              <label className={styles.label}>Color</label>
              <MultiSelectDropdown
                options={colorOptions.map((c) => c.name)}
                value={formData.colors || ""}
                onChange={(val) => updateField("colors", val)}
                placeholder="Select color..."
                multi={false}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Sizes</label>
              <MultiSelectDropdown
                options={sizeOptions}
                value={formData.sizes || []}
                onChange={(val) => {
                  const sizes = val as string[];
                  updateField("sizes", sizes);
                  // Clean up sizePrices for removed sizes
                  if (formData.sizePrices) {
                    const newSizePrices = { ...formData.sizePrices };
                    Object.keys(newSizePrices).forEach((size) => {
                      if (!sizes.includes(size)) {
                        delete newSizePrices[size];
                      }
                    });
                    updateField("sizePrices", newSizePrices);
                  }
                  // Clean up sizeStocks for removed sizes
                  if (formData.sizeStocks) {
                    const newSizeStocks = { ...formData.sizeStocks };
                    Object.keys(newSizeStocks).forEach((size) => {
                      if (!sizes.includes(size)) {
                        delete newSizeStocks[size];
                      }
                    });
                    updateField("sizeStocks", newSizeStocks);
                  }
                }}
                placeholder="Select sizes..."
                multi={true}
              />
            </div>
          </div>

          {/* Size-Based Pricing Toggle - Only show when 2 or more sizes are selected */}
          {formData.sizes && formData.sizes.length > 1 && (
            <div className={styles.sizePricingSection}>
              <div className={styles.sizePricingToggle}>
                <div className={styles.toggleInfo}>
                  <span className={styles.toggleLabel}>
                    Different price for each size
                  </span>
                  <span className={styles.toggleHint}>
                    Enable to set individual prices per size
                  </span>
                </div>
                <button
                  type="button"
                  className={`${styles.toggleSwitch} ${formData.hasSizePricing ? styles.toggleActive : ""}`}
                  onClick={() => {
                    const newValue = !formData.hasSizePricing;
                    updateField("hasSizePricing", newValue);
                    // Initialize sizePrices with current base price when enabling
                    if (newValue && formData.sizes) {
                      const initialPrices: Record<string, number> = {};
                      // Use offer price if enabled, otherwise use regular price
                      const basePrice =
                        showOfferPrice && formData.compareAtPrice
                          ? formData.compareAtPrice
                          : formData.price;
                      formData.sizes.forEach((size) => {
                        // Always reset to current base price when toggling ON to ensure it gets the latest global price
                        initialPrices[size] = basePrice ?? 0;
                      });
                      updateField("sizePrices", initialPrices);
                    }
                  }}
                  aria-pressed={formData.hasSizePricing}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>

              {/* Size-Specific Price Inputs */}
              {formData.hasSizePricing && (
                <div className={styles.sizePricesContainer}>
                  <div className={styles.sizePricesGrid}>
                    {formData.sizes.map((size) => (
                      <div key={size} className={styles.sizePriceItem}>
                        <label className={styles.sizePriceLabel}>{size}</label>
                        <div className={styles.sizePriceInputWrapper}>
                          <span className={styles.currencySymbol}>$</span>
                          <input
                            type="number"
                            className={styles.sizePriceInput}
                            value={
                              formData.sizePrices?.[size] ??
                              (showOfferPrice && formData.compareAtPrice
                                ? formData.compareAtPrice
                                : formData.price) ??
                              ""
                            }
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0;
                              updateField("sizePrices", {
                                ...(formData.sizePrices || {}),
                                [size]: newPrice,
                              });
                            }}
                            placeholder="0"
                            min="0"
                            step="1"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label className={styles.label}>Business Description</label>
            </div>
            <textarea
              className={styles.textarea}
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="We've partnered with Coastal Green Wellness based out of Myrtle Beach South Carolina

The CBD USED
• Naturae CBD not only grows but also extracts the hemp used in our product lines.
• They grow in Albany New York and use CO2 as the solvent for their extraction method."
            />
            <div className={styles.richTextToolbar}>
              <button type="button" className={styles.toolbarBtn} title="Bold">
                <strong>B</strong>
              </button>
              <button
                type="button"
                className={styles.toolbarBtn}
                title="Italic"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                className={styles.toolbarBtn}
                title="Underline"
              >
                <u>U</u>
              </button>
              <button type="button" className={styles.toolbarBtn} title="Link">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </button>
              <button type="button" className={styles.toolbarBtn} title="List">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Category Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Category</h2>

          <div className={styles.field}>
            <label className={styles.label}>Product Category</label>
            <SearchableDropdown
              options={productCategories.map((cat) => ({
                id: cat,
                label: cat,
              }))}
              value={formData.category}
              customValue={customCategory}
              onChange={(value, customValue) => {
                updateField("category", value);
                setCustomCategory(customValue || "");
              }}
              placeholder="Type to search or add a category..."
            />
          </div>
        </div>

        {/* Inventory Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Inventory</h2>

          {formData.sizes && formData.sizes.length > 0 ? (
            <div className={styles.sizeInventoryGrid}>
              {formData.sizes.map((size) => (
                <div key={size} className={styles.field}>
                  <label className={styles.label}>Quantity for {size}</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={formData.sizeStocks?.[size] ?? ""}
                    onChange={(e) => {
                      const newQuantity = parseInt(e.target.value) || 0;
                      updateField("sizeStocks", {
                        ...(formData.sizeStocks || {}),
                        [size]: newQuantity,
                      });
                    }}
                    placeholder="0"
                    min="0"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.label}>Quantity</label>
              <input
                type="number"
                className={styles.input}
                value={formData.quantity || ""}
                onChange={(e) =>
                  updateField("quantity", parseInt(e.target.value) || 0)
                }
                placeholder="1020"
                min="0"
              />
            </div>
          )}
        </div>

        {/* Variant Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Variants</h2>

          {productVariants.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              {productVariants.map((variant, index) => (
                <div
                  key={variant.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                    padding: "20px",
                    background: "#1a1a1a",
                    borderRadius: "12px",
                    marginBottom: "16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    alignItems: "center",
                  }}
                >
                  {/* Top Center: Variant Photo */}
                  <div
                    style={{
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    <label
                      className={styles.label}
                      style={{
                        marginBottom: "12px",
                        fontSize: "12px",
                        display: "block",
                      }}
                    >
                      Variant Photo
                    </label>
                    <ProductImageUpload
                      productId={`${formData.id}-v-${variant.id}`}
                      imageUrl={variant.imageUrl || ""}
                      imagePublicId={variant.imagePublicId || ""}
                      onUpload={(result) => {
                        updateVariant(
                          variant.id,
                          "imageUrl",
                          result.secure_url,
                        );
                        updateVariant(
                          variant.id,
                          "imagePublicId",
                          result.public_id,
                        );
                      }}
                      onDelete={() => {
                        updateVariant(variant.id, "imageUrl", "");
                        updateVariant(variant.id, "imagePublicId", "");
                      }}
                    />
                  </div>

                  {/* Bottom: Inputs */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px",
                      alignItems: "center",
                      width: "100%",
                      paddingTop: "20px",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
                      <MultiSelectDropdown
                        options={colorOptions.map((c) => c.name)}
                        value={variant.color}
                        onChange={(val) =>
                          updateVariant(variant.id, "color", val as string)
                        }
                        placeholder="Color"
                        multi={false}
                      />
                    </div>

                    <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
                      <MultiSelectDropdown
                        options={sizeOptions}
                        value={variant.size || []}
                        onChange={(val) =>
                          updateVariant(variant.id, "size", val as string[])
                        }
                        placeholder="Sizes"
                        multi={true}
                      />
                    </div>

                    <div
                      style={{
                        position: "relative",
                        flex: "1 1 100px",
                        minWidth: "100px",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: "10px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "rgba(255,255,255,0.5)",
                          fontSize: "14px",
                        }}
                      >
                        $
                      </span>
                      <input
                        type="number"
                        className={styles.input}
                        value={variant.price || ""}
                        onChange={(e) =>
                          updateVariant(
                            variant.id,
                            "price",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        placeholder="Price"
                        style={{ margin: 0, paddingLeft: "24px" }}
                      />
                    </div>

                    {/* Size-Based Pricing Toggle - Only show when multiple sizes are selected */}
                    {variant.size && variant.size.length > 1 && (
                      <div style={{ width: "100%", marginTop: "16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "14px 16px",
                            background:
                              "linear-gradient(135deg, rgba(34, 193, 90, 0.08) 0%, rgba(34, 193, 90, 0.02) 100%)",
                            border: "1px solid rgba(34, 193, 90, 0.2)",
                            borderRadius: "10px",
                            marginBottom: variant.hasSizePricing ? "12px" : 0,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "#fff",
                              }}
                            >
                              Different price for each size
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "rgba(255,255,255,0.5)",
                              }}
                            >
                              Set individual prices per size
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = !variant.hasSizePricing;
                              updateVariant(
                                variant.id,
                                "hasSizePricing",
                                newValue,
                              );
                              if (newValue && variant.size) {
                                const initialPrices: Record<string, number> =
                                  {};
                                variant.size.forEach((sz) => {
                                  initialPrices[sz] =
                                    variant.sizePrices?.[sz] ??
                                    variant.price ??
                                    0;
                                });
                                updateVariant(
                                  variant.id,
                                  "sizePrices",
                                  initialPrices,
                                );
                              }
                            }}
                            style={{
                              position: "relative",
                              width: "48px",
                              height: "26px",
                              background: variant.hasSizePricing
                                ? "linear-gradient(135deg, #22c15a 0%, #1fa850 100%)"
                                : "rgba(255, 255, 255, 0.12)",
                              border: variant.hasSizePricing
                                ? "1px solid #22c15a"
                                : "1px solid rgba(255, 255, 255, 0.15)",
                              borderRadius: "13px",
                              cursor: "pointer",
                              transition: "all 0.3s ease",
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: "3px",
                                left: variant.hasSizePricing ? "24px" : "3px",
                                width: "18px",
                                height: "18px",
                                background: "#fff",
                                borderRadius: "50%",
                                transition: "all 0.3s ease",
                                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                              }}
                            />
                          </button>
                        </div>

                        {/* Size-Specific Price Inputs */}
                        {variant.hasSizePricing && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(100px, 1fr))",
                              gap: "12px",
                              padding: "14px",
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                              borderRadius: "10px",
                            }}
                          >
                            {variant.size.map((sz) => (
                              <div
                                key={sz}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "6px",
                                }}
                              >
                                <label
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "rgba(255, 255, 255, 0.85)",
                                    textTransform: "uppercase",
                                    padding: "3px 8px",
                                    background: "rgba(34, 193, 90, 0.15)",
                                    borderRadius: "5px",
                                    textAlign: "center",
                                    border: "1px solid rgba(34, 193, 90, 0.25)",
                                  }}
                                >
                                  {sz}
                                </label>
                                <div style={{ position: "relative" }}>
                                  <span
                                    style={{
                                      position: "absolute",
                                      left: "10px",
                                      top: "50%",
                                      transform: "translateY(-50%)",
                                      color: "rgba(255,255,255,0.5)",
                                      fontSize: "13px",
                                    }}
                                  >
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    value={
                                      variant.sizePrices?.[sz] ??
                                      variant.price ??
                                      ""
                                    }
                                    onChange={(e) => {
                                      const newPrice =
                                        parseFloat(e.target.value) || 0;
                                      updateVariant(variant.id, "sizePrices", {
                                        ...(variant.sizePrices || {}),
                                        [sz]: newPrice,
                                      });
                                    }}
                                    placeholder="0"
                                    min="0"
                                    style={{
                                      width: "100%",
                                      padding: "8px 10px 8px 24px",
                                      background: "rgba(0, 0, 0, 0.25)",
                                      border:
                                        "1px solid rgba(255, 255, 255, 0.12)",
                                      borderRadius: "6px",
                                      fontSize: "13px",
                                      color: "#fff",
                                      textAlign: "right",
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Variant Stock Section */}
                    <div style={{ width: "100%", marginTop: "12px" }}>
                      {variant.size && variant.size.length > 0 ? (
                        <div className={styles.sizeInventoryGrid}>
                          {variant.size.map((sz) => (
                            <div
                              key={sz}
                              className={styles.field}
                              style={{ marginBottom: 0 }}
                            >
                              <label
                                className={styles.label}
                                style={{ fontSize: "11px" }}
                              >
                                Stock for {sz}
                              </label>
                              <input
                                type="number"
                                className={styles.input}
                                value={variant.sizeStocks?.[sz] ?? ""}
                                onChange={(e) => {
                                  const newQty = parseInt(e.target.value) || 0;
                                  updateVariant(variant.id, "sizeStocks", {
                                    ...(variant.sizeStocks || {}),
                                    [sz]: newQty,
                                  });
                                }}
                                placeholder="0"
                                min="0"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          className={styles.field}
                          style={{ maxWidth: "200px" }}
                        >
                          <label className={styles.label}>Stock</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={variant.stock || ""}
                            onChange={(e) =>
                              updateVariant(
                                variant.id,
                                "stock",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            placeholder="Stock"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeVariant(variant.id)}
                      style={{
                        width: "36px",
                        height: "36px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: "8px",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: "18px",
                        transition: "all 0.2s ease",
                        flex: "0 0 36px",
                      }}
                      title="Remove variant"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.variantRow}>
            <span className={styles.variantLabel}>
              {productVariants.length === 0
                ? "Add variants for different sizes, colors, or options"
                : `${productVariants.length} variant(s) added`}
            </span>
            <button
              type="button"
              className={styles.addVariantBtn}
              onClick={addVariant}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Variant
            </button>
          </div>
        </div>

        {/* Footer Actions - Discard left, Schedule & Add Product right */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.discardBtn}
            onClick={handleDiscard}
          >
            Discard
          </button>
          <div className={styles.footerRight}>
            <button type="button" className={styles.scheduleBtn}>
              Schedule
            </button>
            <button
              type="button"
              className={styles.addProductBtn}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Adding..." : "Add Product"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`${styles.toast} ${
            message.type === "success" ? styles.toastSuccess : styles.toastError
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
