"use client";

import React, { useState } from "react";
import styles from "./ProductForm.module.css";
import ProductImageUpload from "../ProductImageUpload";
import Dropdown, { DropdownOption } from "@/app/utils/ui/Dropdown";
import SearchableDropdown from "../SearchableDropdown";

// Types
// ProductVariant type for compatibility
interface ProductVariant {
  id: string;
  color: string;
  size: string | string[];
  price: number;
  stock: number;
  imageUrl: string;
  imagePublicId: string;
}

interface ProductService {
  id: string;
  name: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  priceUnit: string;
  duration: string;
  available: boolean;
  description: string;
  sku: string;
  stockStatus: string;
  imageUrl: string;
  imagePublicId: string;
  originalSize: number;
  optimizedSize: number;
  variants: ProductVariant[];
  sizes: string[];
  colors: string[];
  brand: string;
  materials: string[];
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  sizeStocks?: Record<string, number>;
  quantity?: number;
}

interface UploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  original_size?: number;
}

interface ProductFormProps {
  product?: ProductService;
  isEcommerce: boolean;
  productCategories: string[];
  onSave: (product: ProductService) => void;
  onCancel: () => void;
  onImageDeleted?: (updatedProduct: ProductService) => void; // Auto-save after image deletion
  onAddCategory?: (categoryName: string) => void; // Callback to add new category
  onDeleteCategory?: (categoryName: string) => void; // Callback to delete category
}

// Predefined size options
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"];

// Predefined color options
const COLOR_OPTIONS = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Black",
  "White",
  "Grey",
  "Pink",
  "Purple",
  "Orange",
  "Brown",
  "Gold",
  "Silver",
  "Maroon",
  "Navy Blue",
  "Teal",
  "Peach",
  "Multi-color",
];

// Create empty product
const createEmptyProduct = (): ProductService => ({
  id: Date.now().toString(),
  name: "",
  category: "",
  description: "",
  price: 0,
  compareAtPrice: 0,
  priceUnit: "",
  duration: "",
  available: true,
  sku: "",
  stockStatus: "in_stock",
  imageUrl: "",
  imagePublicId: "",
  originalSize: 0,
  optimizedSize: 0,
  variants: [],
  sizes: [],
  colors: [],
  brand: "",
  materials: [],
  hasSizePricing: false,
  sizePrices: {},
  sizeStocks: {},
  quantity: 0,
});

// Size Multi-Select Component
function SizeMultiSelect({
  selectedSizes,
  onChange,
}: {
  selectedSizes: string[];
  onChange: (sizes: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      onChange(selectedSizes.filter((s) => s !== size));
    } else {
      onChange([...selectedSizes, size]);
    }
  };

  const removeSize = (size: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedSizes.filter((s) => s !== size));
  };

  const filteredOptions = SIZE_OPTIONS.filter((size) =>
    size.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div ref={dropdownRef} className={styles.sizeMultiSelect}>
      <button
        type="button"
        className={`${styles.sizeSelectTrigger} ${isOpen ? styles.open : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedSizes.length > 0 ? (
          <div className={styles.selectedSizes}>
            {selectedSizes.map((size) => (
              <span key={size} className={styles.sizeTag}>
                {size}
                <button
                  type="button"
                  className={styles.sizeTagRemove}
                  onClick={(e) => removeSize(size, e)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={styles.placeholder}>Select sizes...</span>
        )}
        <svg
          className={`${styles.dropdownIcon} ${
            isOpen ? styles.iconRotated : ""
          }`}
          width="14"
          height="14"
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
        <div className={styles.sizeDropdown}>
          <div className={styles.dropdownSearch}>
            <input
              type="text"
              placeholder="Search sizes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className={styles.optionsList}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((size) => (
                <div
                  key={size}
                  className={`${styles.sizeOption} ${
                    selectedSizes.includes(size) ? styles.selected : ""
                  }`}
                  onClick={() => toggleSize(size)}
                >
                  <span>{size}</span>
                  {selectedSizes.includes(size) && (
                    <svg
                      className={styles.checkIcon}
                      width="14"
                      height="14"
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
              <div className={styles.noOptions}>No sizes found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Color Multi-Select Component
function ColorMultiSelect({
  selectedColors,
  onChange,
}: {
  selectedColors: string[];
  onChange: (colors: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleColor = (color: string) => {
    if (selectedColors.includes(color)) {
      onChange(selectedColors.filter((c) => c !== color));
    } else {
      onChange([...selectedColors, color]);
    }
  };

  const removeColor = (color: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedColors.filter((c) => c !== color));
  };

  const filteredOptions = COLOR_OPTIONS.filter((color) =>
    color.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div ref={dropdownRef} className={styles.sizeMultiSelect}>
      <button
        type="button"
        className={`${styles.sizeSelectTrigger} ${isOpen ? styles.open : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedColors.length > 0 ? (
          <div className={styles.selectedSizes}>
            {selectedColors.map((color) => (
              <span key={color} className={styles.sizeTag}>
                {color}
                <button
                  type="button"
                  className={styles.sizeTagRemove}
                  onClick={(e) => removeColor(color, e)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={styles.placeholder}>Select colors...</span>
        )}
        <svg
          className={`${styles.dropdownIcon} ${
            isOpen ? styles.iconRotated : ""
          }`}
          width="14"
          height="14"
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
        <div className={styles.sizeDropdown}>
          <div className={styles.dropdownSearch}>
            <input
              type="text"
              placeholder="Search colors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className={styles.optionsList}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((color) => (
                <div
                  key={color}
                  className={`${styles.sizeOption} ${
                    selectedColors.includes(color) ? styles.selected : ""
                  }`}
                  onClick={() => toggleColor(color)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        backgroundColor: color.toLowerCase().replace(" ", ""),
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                      }}
                    />
                    <span>{color}</span>
                  </div>
                  {selectedColors.includes(color) && (
                    <svg
                      className={styles.checkIcon}
                      width="14"
                      height="14"
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
              <div className={styles.noOptions}>No colors found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductForm({
  product,
  isEcommerce,
  productCategories,
  onSave,
  onCancel,
  onImageDeleted,
  onAddCategory,
  onDeleteCategory,
}: ProductFormProps) {
  const [formData, setFormData] = useState<ProductService>(
    product || createEmptyProduct(),
  );
  const [showOfferPrice, setShowOfferPrice] = useState(
    !!(product?.compareAtPrice && product.compareAtPrice > 0),
  );
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const updateField = (field: keyof ProductService, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  // Category dropdown options
  const categoryOptions: DropdownOption[] = productCategories.map((cat) => ({
    value: cat,
    label: cat,
  }));

  const handleVariantImageUpload = (color: string, result: UploadResult) => {
    setFormData((prev) => ({
      ...prev,
      variantImages: {
        ...(prev.variantImages || {}),
        [color]: {
          imageUrl: result.secure_url,
          imagePublicId: result.public_id,
        },
      },
    }));
  };

  const handleVariantImageDelete = (color: string) => {
    setFormData((prev) => {
      const newVariantImages = { ...(prev.variantImages || {}) };
      delete newVariantImages[color];
      return {
        ...prev,
        variantImages: newVariantImages,
      };
    });
  };

  return (
    <div className={styles.form}>
      {/* Image Upload - For e-commerce only */}
      {isEcommerce && (
        <div className={styles.imageSection}>
          <label className={styles.label}>Product Image</label>
          <div className={styles.imageUploadWrapper}>
            <ProductImageUpload
              productId={formData.id}
              imageUrl={formData.imageUrl || ""}
              imagePublicId={formData.imagePublicId || ""}
              onUpload={(result: UploadResult) => {
                updateField("imageUrl", result.secure_url);
                updateField("imagePublicId", result.public_id);
                updateField("originalSize", result.original_size || 0);
                updateField("optimizedSize", result.bytes);
              }}
              onDelete={() => {
                // Create updated product with cleared image fields
                const updatedProduct = {
                  ...formData,
                  imageUrl: "",
                  imagePublicId: "",
                  originalSize: 0,
                  optimizedSize: 0,
                };
                // Update local form state
                updateField("imageUrl", "");
                updateField("imagePublicId", "");
                updateField("originalSize", 0);
                updateField("optimizedSize", 0);
                // Auto-save to Firestore to sync with Cloudinary deletion
                if (onImageDeleted) {
                  onImageDeleted(updatedProduct);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Product/Service Name */}
      <div className={styles.field}>
        <label className={styles.label}>
          {isEcommerce ? "Product Name" : "Service Name"}
        </label>
        <input
          type="text"
          className={styles.input}
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder={isEcommerce ? "e.g., Silk Saree" : "e.g., Haircut - Men"}
        />
      </div>

      {/* Price */}
      <div className={styles.field}>
        <div className={styles.fieldHeader}>
          <label className={styles.label}>Price (₹)</label>
          <div className={styles.fieldHeader} style={{ gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Offer Price
            </span>
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
                    const offerPrice =
                      formData.compareAtPrice || formData.price || 0;
                    formData.sizes.forEach((size) => {
                      updatedPrices[size] = offerPrice;
                    });
                  } else {
                    formData.sizes.forEach((size) => {
                      updatedPrices[size] = formData.price ?? 0;
                    });
                  }
                  updateField("sizePrices", updatedPrices);
                }
              }}
              style={{
                background: showOfferPrice
                  ? "#22c15a"
                  : "rgba(255,255,255,0.2)",
              }}
            >
              <div
                className={styles.toggleKnobSmall}
                style={{ left: showOfferPrice ? "20px" : "2px" }}
              />
            </button>
          </div>
        </div>
        <div className={styles.inputWithPrefix}>
          <span className={styles.inputPrefix}>₹</span>
          <input
            type="number"
            className={`${styles.input} ${styles.inputWithPrefixField}`}
            value={formData.price || ""}
            onChange={(e) => {
              const newPrice = parseFloat(e.target.value) || 0;
              updateField("price", newPrice);
              // Propagate to sizes if offer price is OFF
              if (
                !showOfferPrice &&
                formData.hasSizePricing &&
                formData.sizes
              ) {
                const updatedPrices: Record<string, number> = {};
                formData.sizes.forEach((size) => {
                  updatedPrices[size] = newPrice;
                });
                updateField("sizePrices", updatedPrices);
              }
            }}
            placeholder={isEcommerce ? "e.g., 1999" : "e.g., 300"}
          />
        </div>
      </div>

      {/* Offer Price Input */}
      {showOfferPrice && (
        <div className={styles.field} style={{ marginTop: "-8px" }}>
          <label
            className={styles.label}
            style={{ fontSize: "11px", color: "#22c15a" }}
          >
            Displaying Offer Price
          </label>
          <div
            className={styles.inputWithPrefix}
            style={{ position: "relative" }}
          >
            <span className={styles.inputPrefix}>₹</span>
            <input
              type="number"
              className={`${styles.input} ${styles.inputWithPrefixField}`}
              value={formData.compareAtPrice || ""}
              onChange={(e) => {
                const newOfferPrice = parseFloat(e.target.value) || 0;
                updateField("compareAtPrice", newOfferPrice);
                // Propagate to sizes if offer price is ON
                if (
                  showOfferPrice &&
                  formData.hasSizePricing &&
                  formData.sizes
                ) {
                  const updatedPrices: Record<string, number> = {};
                  formData.sizes.forEach((size) => {
                    updatedPrices[size] = newOfferPrice;
                  });
                  updateField("sizePrices", updatedPrices);
                }
              }}
              placeholder="Sale price"
              style={{ paddingRight: "40px" }}
            />
            <button
              type="button"
              onClick={() => {
                setShowOfferPrice(false);
                updateField("compareAtPrice", 0);
                if (formData.hasSizePricing && formData.sizes) {
                  const updatedPrices: Record<string, number> = {};
                  formData.sizes.forEach((size) => {
                    updatedPrices[size] = formData.price ?? 0;
                  });
                  updateField("sizePrices", updatedPrices);
                }
              }}
              style={{
                position: "absolute",
                right: "12px",
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Category */}
      <div className={styles.field}>
        <label className={styles.label}>Category</label>
        <SearchableDropdown
          options={productCategories.map((cat) => ({ id: cat, label: cat }))}
          value={formData.category}
          onChange={(value) => {
            updateField("category", value);
            // Auto-add to category list if it's new
            if (value && !productCategories.includes(value) && onAddCategory) {
              onAddCategory(value);
            }
          }}
          placeholder={
            isEcommerce ? "Type to search or add category" : "e.g., Hair"
          }
        />
      </div>

      {/* Duration - For services only */}
      {!isEcommerce && (
        <div className={styles.field}>
          <label className={styles.label}>Duration</label>
          <input
            type="text"
            className={styles.input}
            value={formData.duration}
            onChange={(e) => updateField("duration", e.target.value)}
            placeholder="e.g., 30 min"
          />
        </div>
      )}

      {/* Colors - Multi-selection */}
      {isEcommerce && (
        <div className={styles.field}>
          <label className={styles.label}>Product Colors</label>
          <ColorMultiSelect
            selectedColors={formData.colors || []}
            onChange={(colors) => updateField("colors", colors)}
          />
          <p className={styles.fieldHint}>
            Select all available colors for this product
          </p>
        </div>
      )}

      {/* Variant Images - For each color */}
      {isEcommerce && formData.colors && formData.colors.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label}>Color Variant Images</label>
          <div className={styles.variantImagesGrid}>
            {formData.colors.map((color) => (
              <div key={color} className={styles.variantImageItem}>
                <span className={styles.variantColorLabel}>{color}</span>
                <ProductImageUpload
                  productId={`${formData.id}-${color}`}
                  imageUrl={formData.variantImages?.[color]?.imageUrl || ""}
                  imagePublicId={
                    formData.variantImages?.[color]?.imagePublicId || ""
                  }
                  onUpload={(result) => handleVariantImageUpload(color, result)}
                  onDelete={() => handleVariantImageDelete(color)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sizes - For e-commerce only */}
      {isEcommerce && (
        <div className={styles.field}>
          <label className={styles.label}>Sizes</label>
          <SizeMultiSelect
            selectedSizes={formData.sizes || []}
            onChange={(sizes) => {
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
            }}
          />
        </div>
      )}

      {/* Size-Based Pricing Toggle - Only show when 2 or more sizes are selected */}
      {isEcommerce && formData.sizes && formData.sizes.length > 1 && (
        <>
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
              <div className={styles.sizePricesHeader}>
                <span className={styles.sizePricesTitle}>Size Pricing</span>
                <span className={styles.sizePricesSubtitle}>
                  Set individual prices for each size
                </span>
              </div>
              <div className={styles.sizePricesGrid}>
                {formData.sizes.map((size) => (
                  <div key={size} className={styles.sizePriceItem}>
                    <label className={styles.sizePriceLabel}>{size}</label>
                    <div className={styles.sizePriceInputWrapper}>
                      <span className={styles.currencySymbol}>₹</span>
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
        </>
      )}

      {/* Description */}
      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea
          className={styles.textarea}
          value={formData.description || ""}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Describe your product/service in detail..."
          rows={4}
        />
      </div>

      {/* Inventory Section */}
      <div className={styles.field}>
        <label className={styles.label}>Inventory</label>

        {formData.sizes && formData.sizes.length > 0 ? (
          <div className={styles.sizeInventoryGrid}>
            {formData.sizes.map((size) => (
              <div
                key={size}
                className={styles.field}
                style={{ marginBottom: "12px" }}
              >
                <label className={styles.label} style={{ fontSize: "11px" }}>
                  Quantity for {size}
                </label>
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
              placeholder="0"
              min="0"
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
        >
          {product ? "Save Changes" : "Create Product"}
        </button>
      </div>
    </div>
  );
}

export type { ProductService, ProductFormProps };
