"use client";

import React from "react";
import styles from "./ProductCard.module.css";
import ProductImageUpload from "../ProductImageUpload";
import ImageModal from "../ImageModal";
import Dropdown, { DropdownOption } from "@/app/utils/ui/Dropdown";
import SearchableDropdown from "../SearchableDropdown";

// Types
interface ProductVariant {
  id: string;
  color: string;
  size: string;
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
  variants: ProductVariant[] | string[];
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
  onSave?: () => void; // Optional callback to trigger save when editing is done
}

// Predefined size options
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"];

// Predefined color options
const COLOR_OPTIONS = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Purple",
  "Pink",
  "Black",
  "White",
  "Grey",
  "Brown",
  "Navy",
  "Maroon",
  "Gold",
  "Silver",
  "Beige",
  "Cream",
  "Teal",
  "Coral",
  "Multi-Color",
];

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
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.sizeTagRemove}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSize(size, e);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      removeSize(size, e as unknown as React.MouseEvent);
                    }
                  }}
                >
                  ×
                </span>
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

// Variants Display Component - Collapsible section to view saved variants
function VariantsDisplay({ variants }: { variants: ProductVariant[] }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = React.useState<string | null>(
    null,
  );

  if (!variants || variants.length === 0) return null;

  return (
    <div className={styles.variantsSection}>
      <button
        type="button"
        className={styles.variantsToggle}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.variantsLabel}>
          📦 {variants.length} Variant{variants.length > 1 ? "s" : ""}
        </span>
        <svg
          className={`${styles.variantsArrow} ${isExpanded ? styles.expanded : ""}`}
          width="16"
          height="16"
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

      {isExpanded && (
        <div className={styles.variantsList}>
          {variants.map((variant, idx) => (
            <div key={variant.id || idx} className={styles.variantItem}>
              {variant.imageUrl ? (
                <img
                  src={variant.imageUrl}
                  alt={`${variant.color} ${variant.size}`}
                  className={styles.variantImage}
                  onClick={() => setSelectedImageUrl(variant.imageUrl)}
                  style={{ cursor: "zoom-in" }}
                  title="Click to enlarge"
                />
              ) : (
                <div className={styles.variantImagePlaceholder}>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
              <div className={styles.variantDetails}>
                {variant.color && (
                  <span className={styles.variantColor}>{variant.color}</span>
                )}
                {variant.size && (
                  <span className={styles.variantSize}>{variant.size}</span>
                )}
                {variant.price > 0 && (
                  <span className={styles.variantPrice}>₹{variant.price}</span>
                )}
                {variant.stock > 0 && (
                  <span className={styles.variantStock}>
                    Stock: {variant.stock}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedImageUrl && (
        <ImageModal
          isOpen={!!selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
          imageUrl={selectedImageUrl}
        />
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
  onSave,
}: ProductCardProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = React.useState<string | null>(
    null,
  );

  // Handle edit toggle - save when done editing
  const handleEditToggle = () => {
    if (isEditing && onSave) {
      // If we're currently editing and about to close, trigger save
      onSave();
    }
    setIsEditing(!isEditing);
  };

  // Convert categories to dropdown options
  const categoryOptions: DropdownOption[] = productCategories.map((cat) => ({
    value: cat,
    label: cat,
  }));

  return (
    <div className={`${styles.card} ${!isEditing ? styles.viewMode : ""}`}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.productNumber}>
          <span className={styles.numberIndicator}></span>
          Product {index + 1}
        </span>
        <div className={styles.headerActions}>
          {/* Edit/Done Toggle Button */}
          <button
            className={`${styles.editButton} ${isEditing ? styles.editing : ""}`}
            onClick={handleEditToggle}
            title={isEditing ? "Done editing" : "Edit product"}
          >
            {isEditing ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            )}
          </button>
          {/* Cancel Button - Only shown when editing */}
          {isEditing && (
            <button
              className={styles.cancelButton}
              onClick={() => setIsEditing(false)}
              title="Cancel editing"
            >
              ✕
            </button>
          )}
          {/* Remove Button - Hidden when editing */}
          {!isEditing && (
            <button
              className={styles.removeButton}
              onClick={() => onRemove(product.id)}
              title="Remove product"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Image Left, Details Right */}
      <div className={styles.mainContent}>
        {/* Image Section - Left */}
        {isEcommerce && (
          <div className={styles.imageSection}>
            <div className={styles.imageWrapper}>
              {isEditing ? (
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
                      result.original_size || 0,
                    );
                    onUpdate(product.id, "optimizedSize", result.bytes);
                  }}
                  onDelete={() => {
                    onUpdate(product.id, "imageUrl", "");
                    onUpdate(product.id, "imagePublicId", "");
                    onUpdate(product.id, "originalSize", 0);
                    onUpdate(product.id, "optimizedSize", 0);
                    if (onImageDeleted) {
                      onImageDeleted();
                    }
                  }}
                />
              ) : product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name || "Product"}
                  className={styles.viewImage}
                  loading="eager"
                  fetchPriority="high"
                  onClick={() => setSelectedImageUrl(product.imageUrl)}
                  style={{ cursor: "zoom-in" }}
                  title="Click to enlarge"
                />
              ) : (
                <div className={styles.noImage}>
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>No image</span>
                </div>
              )}
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
                className={`${styles.detailInput} ${!isEditing ? styles.inputDisabled : ""}`}
                value={product.name}
                onChange={(e) => onUpdate(product.id, "name", e.target.value)}
                placeholder={
                  isEcommerce ? "e.g., Silk Saree" : "e.g., Haircut - Men"
                }
                disabled={!isEditing}
              />
            </div>

            {/* Price */}
            <div className={styles.detailItem}>
              <label className={styles.detailLabel}>Price (₹)</label>
              <input
                type="number"
                className={`${styles.detailInput} ${!isEditing ? styles.inputDisabled : ""}`}
                value={product.price || ""}
                onChange={(e) =>
                  onUpdate(product.id, "price", parseFloat(e.target.value) || 0)
                }
                placeholder={isEcommerce ? "e.g., 1999" : "e.g., 300"}
                disabled={!isEditing}
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
                  disabled={!isEditing}
                />
              ) : (
                <input
                  type="text"
                  className={`${styles.detailInput} ${!isEditing ? styles.inputDisabled : ""}`}
                  value={product.category}
                  onChange={(e) =>
                    onUpdate(product.id, "category", e.target.value)
                  }
                  placeholder={isEcommerce ? "e.g., Sarees" : "e.g., Hair"}
                  disabled={!isEditing}
                />
              )}
            </div>

            {/* Duration field for service businesses */}
            {!isEcommerce && (
              <div className={styles.detailItem}>
                <label className={styles.detailLabel}>Duration</label>
                <input
                  type="text"
                  className={`${styles.detailInput} ${!isEditing ? styles.inputDisabled : ""}`}
                  value={product.duration}
                  onChange={(e) =>
                    onUpdate(product.id, "duration", e.target.value)
                  }
                  placeholder="e.g., 30 min"
                  disabled={!isEditing}
                />
              </div>
            )}

            {/* Colors - Only for e-commerce - Searchable dropdown */}
            {isEcommerce && (
              <div className={styles.detailItem}>
                <label className={styles.detailLabel}>Color</label>
                {isEditing ? (
                  <SearchableDropdown
                    options={COLOR_OPTIONS.map((color) => ({
                      id: color,
                      label: color,
                    }))}
                    value={(product.colors && product.colors[0]) || ""}
                    onChange={(value) =>
                      onUpdate(product.id, "colors", value ? [value] : [])
                    }
                    placeholder="Search or add color..."
                    className={styles.colorSearchDropdown}
                  />
                ) : (
                  <Dropdown
                    options={COLOR_OPTIONS.map((color) => ({
                      value: color,
                      label: color,
                    }))}
                    value={(product.colors && product.colors[0]) || ""}
                    onChange={(value) =>
                      onUpdate(product.id, "colors", value ? [value] : [])
                    }
                    placeholder="Select a color"
                    className={styles.categoryDropdown}
                    disabled={true}
                  />
                )}
              </div>
            )}

            {/* Sizes - Only for e-commerce */}
            {isEcommerce && (
              <div className={styles.detailItem}>
                <label className={styles.detailLabel}>Sizes</label>
                <div className={!isEditing ? styles.disabledWrapper : ""}>
                  <SizeMultiSelect
                    selectedSizes={product.sizes || []}
                    onChange={(sizes: string[]) =>
                      isEditing && onUpdate(product.id, "sizes", sizes)
                    }
                  />
                </div>
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
            className={`${styles.descriptionInput} ${!isEditing ? styles.inputDisabled : ""}`}
            value={product.description || ""}
            onChange={(e) =>
              onUpdate(product.id, "description", e.target.value)
            }
            placeholder="Describe your product in detail... (e.g., Premium handwoven silk saree with traditional motifs, perfect for weddings and special occasions)"
            rows={3}
            disabled={!isEditing}
          />
        </div>
      </div>

      {/* Variants Section - Only show if variants exist and is e-commerce */}
      {isEcommerce &&
        product.variants &&
        Array.isArray(product.variants) &&
        product.variants.length > 0 &&
        typeof product.variants[0] === "object" && (
          <VariantsDisplay variants={product.variants as ProductVariant[]} />
        )}

      {/* Image Modal for product image zoom */}
      {selectedImageUrl && (
        <ImageModal
          isOpen={!!selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
          imageUrl={selectedImageUrl}
        />
      )}
    </div>
  );
}

export type { ProductService, ProductCardProps };
