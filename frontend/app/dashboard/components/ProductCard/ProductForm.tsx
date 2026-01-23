"use client";

import React, { useState } from "react";
import styles from "./ProductForm.module.css";
import ProductImageUpload from "../ProductImageUpload";
import Dropdown, { DropdownOption } from "@/app/utils/ui/Dropdown";
import SearchableDropdown from "../SearchableDropdown";

// Types
interface ProductService {
  id: string;
  name: string;
  category: string;
  price: number;
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
  variants: string[];
  sizes: string[];
  colors: string[];
  brand: string;
  materials: string[];
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
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

// Create empty product
const createEmptyProduct = (): ProductService => ({
  id: Date.now().toString(),
  name: "",
  category: "",
  description: "",
  price: 0,
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
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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
          {SIZE_OPTIONS.map((size) => (
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
          ))}
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
        <label className={styles.label}>Price (₹)</label>
        <input
          type="number"
          className={styles.input}
          value={formData.price || ""}
          onChange={(e) =>
            updateField("price", parseFloat(e.target.value) || 0)
          }
          placeholder={isEcommerce ? "e.g., 1999" : "e.g., 300"}
        />
      </div>

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

      {/* Color - Single selection for main product */}
      {isEcommerce && (
        <div className={styles.field}>
          <label className={styles.label}>Product Color</label>
          <input
            type="text"
            className={styles.input}
            value={formData.colors?.[0] || ""}
            onChange={(e) => {
              const color = e.target.value;
              updateField("colors", color ? [color] : []);
            }}
            placeholder="e.g., Red (single color for main product)"
          />
          <p className={styles.fieldHint}>
            For multiple color variants, add them separately after creating the
            product
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
            onChange={(sizes) => updateField("sizes", sizes)}
          />
        </div>
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
