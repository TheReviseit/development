"use client";

import React from "react";
import styles from "./ProductCard.module.css";
import ProductImageUpload from "../ProductImageUpload";
import Dropdown, { DropdownOption } from "@/app/utils/ui/Dropdown";

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
}

interface UploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  original_size?: number;
}

interface ProductCardProps {
  product: ProductService;
  index: number;
  isEcommerce: boolean;
  productCategories: string[];
  onUpdate: (id: string, field: keyof ProductService, value: unknown) => void;
  onRemove: (id: string) => void;
  onImageDeleted?: () => void; // Optional callback to trigger save after image deletion
}

// Predefined size options
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"];

// Size Multi-Select Component using utility dropdown styling
function SizeMultiSelect({
  selectedSizes,
  onChange,
}: {
  selectedSizes: string[];
  onChange: (sizes: string[]) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
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

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={styles.sizeMultiSelect}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={`${styles.sizeSelectTrigger} ${isOpen ? styles.open : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
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
          <span className={styles.sizePlaceholder}>Select sizes...</span>
        )}
        <svg
          className={`${styles.sizeDropdownIcon} ${
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
        <div className={styles.sizeDropdown} role="listbox">
          {SIZE_OPTIONS.map((size) => (
            <div
              key={size}
              className={`${styles.sizeOption} ${
                selectedSizes.includes(size) ? styles.selected : ""
              }`}
              onClick={() => toggleSize(size)}
              role="option"
              aria-selected={selectedSizes.includes(size)}
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

export default function ProductCard({
  product,
  index,
  isEcommerce,
  productCategories,
  onUpdate,
  onRemove,
  onImageDeleted,
}: ProductCardProps) {
  // Convert categories to dropdown options
  const categoryOptions: DropdownOption[] = productCategories.map((cat) => ({
    value: cat,
    label: cat,
  }));

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.productNumber}>
          <span className={styles.numberIndicator}></span>
          Product {index + 1}
        </span>
        <button
          className={styles.removeButton}
          onClick={() => onRemove(product.id)}
          title="Remove product"
        >
          ✕
        </button>
      </div>

      {/* Main Content: Image Left, Details Right */}
      <div className={styles.mainContent}>
        {/* Image Section - Left */}
        {isEcommerce && (
          <div className={styles.imageSection}>
            <div className={styles.imageWrapper}>
              <ProductImageUpload
                productId={product.id}
                imageUrl={product.imageUrl || ""}
                imagePublicId={product.imagePublicId || ""}
                onUpload={(result: UploadResult) => {
                  onUpdate(product.id, "imageUrl", result.secure_url);
                  onUpdate(product.id, "imagePublicId", result.public_id);
                  onUpdate(
                    product.id,
                    "originalSize",
                    result.original_size || 0
                  );
                  onUpdate(product.id, "optimizedSize", result.bytes);
                }}
                onDelete={() => {
                  onUpdate(product.id, "imageUrl", "");
                  onUpdate(product.id, "imagePublicId", "");
                  onUpdate(product.id, "originalSize", 0);
                  onUpdate(product.id, "optimizedSize", 0);
                  // Trigger auto-save to persist deletion to Firestore
                  // This ensures the DB is updated immediately after Cloudinary deletion
                  if (onImageDeleted) {
                    onImageDeleted();
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Details Section - Right */}
        <div className={styles.detailsSection}>
          <div className={styles.detailsGrid}>
            {/* Product Name */}
            <div className={styles.detailItem}>
              <label className={styles.detailLabel}>
                {isEcommerce ? "Product Name" : "Service Name"}
              </label>
              <input
                type="text"
                className={styles.detailInput}
                value={product.name}
                onChange={(e) => onUpdate(product.id, "name", e.target.value)}
                placeholder={
                  isEcommerce ? "e.g., Silk Saree" : "e.g., Haircut - Men"
                }
              />
            </div>

            {/* Price */}
            <div className={styles.detailItem}>
              <label className={styles.detailLabel}>Price (₹)</label>
              <input
                type="number"
                className={styles.detailInput}
                value={product.price || ""}
                onChange={(e) =>
                  onUpdate(product.id, "price", parseFloat(e.target.value) || 0)
                }
                placeholder={isEcommerce ? "e.g., 1999" : "e.g., 300"}
              />
            </div>

            {/* Category */}
            <div className={styles.detailItem}>
              <label className={styles.detailLabel}>Category</label>
              {isEcommerce && productCategories.length > 0 ? (
                <Dropdown
                  options={categoryOptions}
                  value={product.category}
                  onChange={(value) => onUpdate(product.id, "category", value)}
                  placeholder="Select a category"
                  className={styles.categoryDropdown}
                />
              ) : (
                <input
                  type="text"
                  className={styles.detailInput}
                  value={product.category}
                  onChange={(e) =>
                    onUpdate(product.id, "category", e.target.value)
                  }
                  placeholder={isEcommerce ? "e.g., Sarees" : "e.g., Hair"}
                />
              )}
            </div>

            {/* Duration field for service businesses */}
            {!isEcommerce && (
              <div className={styles.detailItem}>
                <label className={styles.detailLabel}>Duration</label>
                <input
                  type="text"
                  className={styles.detailInput}
                  value={product.duration}
                  onChange={(e) =>
                    onUpdate(product.id, "duration", e.target.value)
                  }
                  placeholder="e.g., 30 min"
                />
              </div>
            )}

            {/* Colors - Only for e-commerce */}
            {isEcommerce && (
              <div className={styles.detailItem}>
                <label className={styles.detailLabel}>Colors</label>
                <input
                  type="text"
                  className={styles.detailInput}
                  value={(product.colors || []).join(", ")}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const colors = rawValue.split(",").map((s) => s.trim());
                    onUpdate(product.id, "colors", colors);
                  }}
                  onBlur={() => {
                    const cleaned = (product.colors || []).filter(Boolean);
                    onUpdate(product.id, "colors", cleaned);
                  }}
                  placeholder="e.g., Red, Green, Gold"
                />
              </div>
            )}

            {/* Sizes - Only for e-commerce */}
            {isEcommerce && (
              <div className={styles.detailItem}>
                <label className={styles.detailLabel}>Sizes</label>
                <SizeMultiSelect
                  selectedSizes={product.sizes || []}
                  onChange={(sizes: string[]) =>
                    onUpdate(product.id, "sizes", sizes)
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description Section - Full Width at Bottom */}
      <div className={styles.descriptionSection}>
        <div className={styles.descriptionBox}>
          <label className={styles.descriptionLabel}>
            <span className={styles.descriptionIcon}>📝</span>
            Product Description
          </label>
          <textarea
            className={styles.descriptionInput}
            value={product.description || ""}
            onChange={(e) =>
              onUpdate(product.id, "description", e.target.value)
            }
            placeholder="Describe your product in detail... (e.g., Premium handwoven silk saree with traditional motifs, perfect for weddings and special occasions)"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}

export type { ProductService, ProductCardProps };
