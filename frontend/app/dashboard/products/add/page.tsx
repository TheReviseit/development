"use client";

"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./add-product.module.css";
import ProductImageUpload from "../../components/ProductImageUpload";

// Variant type definition
interface ProductVariant {
  id: string;
  color: string;
  size: string;
  price: number;
  stock: number;
  imageUrl: string;
  imagePublicId: string;
}

const COLOR_OPTIONS = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Gray",
  "Pink",
  "Purple",
  "Orange",
  "Brown",
  "Beige",
  "Navy",
  "Maroon",
  "Olive",
  "Silver",
  "Gold",
  "Multi",
];

const SIZE_OPTIONS = [
  "Free Size",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
  "4XL",
  "5XL",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "One Size",
];

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
  colors: string[];
  brand: string;
  materials: string[];
  sellingType: string;
  weight: number;
  weightUnit: string;
  packageLength: number;
  packageBreadth: number;
  packageWidth: number;
  images: string[];
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
  colors: [],
  brand: "",
  materials: [],
  sellingType: "in-store",
  weight: 0,
  weightUnit: "kg",
  packageLength: 0,
  packageBreadth: 0,
  packageWidth: 0,
  images: [],
});

// Searchable Dropdown Component
function SearchableDropdown({
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
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setCategoryDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Add a new variant
  const addVariant = () => {
    const newVariant: ProductVariant = {
      id: Date.now().toString(),
      color: "",
      size: "",
      price: formData.price || 0,
      stock: 0,
      imageUrl: "",
      imagePublicId: "",
    };
    setProductVariants([...productVariants, newVariant]);
  };

  // Update a variant - using functional update to handle consecutive calls properly
  const updateVariant = (
    id: string,
    field: keyof ProductVariant,
    value: string | number,
  ) => {
    setProductVariants((prevVariants) =>
      prevVariants.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );
  };

  // Remove a variant
  const removeVariant = (id: string) => {
    setProductVariants(productVariants.filter((v) => v.id !== id));
  };

  // Load categories on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setProductCategories(result.data.productCategories || []);
          }
        }
      } catch (error) {
        console.error("Error loading categories:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Update field helper
  const updateField = (field: keyof Product, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handle save
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "Product name is required" });
      return;
    }

    setSaving(true);
    try {
      // First get existing products
      const getResponse = await fetch("/api/business/get");
      const getData = await getResponse.json();
      const existingProducts = getData.data?.products || [];

      // Add new product with variants
      const productToSave = {
        ...formData,
        variants: productVariants,
      };
      const updatedProducts = [...existingProducts, productToSave];

      // Save products
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: updatedProducts,
        }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Product added successfully!" });
        setTimeout(() => {
          router.push("/dashboard/products");
        }, 1000);
      } else {
        setMessage({ type: "error", text: "Failed to save product" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save product" });
    } finally {
      setSaving(false);
    }
  };

  // Handle discard
  const handleDiscard = () => {
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
                  onChange={(e) =>
                    updateField("price", parseFloat(e.target.value) || 0)
                  }
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
                  onClick={() => setShowOfferPrice(!showOfferPrice)}
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
                      onChange={(e) =>
                        updateField(
                          "compareAtPrice",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      placeholder="320.00"
                      style={{ paddingRight: "40px" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOfferPrice(false);
                      updateField("compareAtPrice", 0);
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
              <label className={styles.label}>Colors</label>
              <SearchableDropdown
                options={COLOR_OPTIONS}
                value={formData.colors || []}
                onChange={(val) => updateField("colors", val)}
                placeholder="Select colors..."
                multi={true}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Sizes</label>
              <SearchableDropdown
                options={SIZE_OPTIONS}
                value={formData.sizes || []}
                onChange={(val) => updateField("sizes", val)}
                placeholder="Select sizes..."
                multi={true}
              />
            </div>
          </div>

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
            <div className={styles.customDropdown} ref={categoryDropdownRef}>
              <button
                type="button"
                className={`${styles.dropdownTrigger} ${categoryDropdownOpen ? styles.open : ""}`}
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              >
                {formData.category ? (
                  <span className={styles.dropdownValue}>
                    <span className={styles.categoryIcon}>📦</span>
                    {formData.category}
                  </span>
                ) : (
                  <span className={styles.dropdownPlaceholder}>
                    Select a category
                  </span>
                )}
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

              {categoryDropdownOpen && (
                <div className={styles.dropdownMenu}>
                  {productCategories.length > 0 ? (
                    productCategories.map((cat) => (
                      <div
                        key={cat}
                        className={`${styles.dropdownItem} ${formData.category === cat ? styles.selected : ""}`}
                        onClick={() => {
                          updateField("category", cat);
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        <span className={styles.dropdownItemIcon}>📦</span>
                        <span className={styles.dropdownItemText}>{cat}</span>
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
                      </div>
                    ))
                  ) : (
                    <div className={styles.noCategories}>
                      No categories available. Add one first.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Inventory Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Inventory</h2>

          <div className={styles.fieldsRow}>
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
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>SKU(Optional)</label>
              <input
                type="text"
                className={styles.input}
                value={formData.sku}
                onChange={(e) => updateField("sku", e.target.value)}
                placeholder="UGG-BB-PUR-06"
              />
            </div>
          </div>
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
                      <SearchableDropdown
                        options={COLOR_OPTIONS}
                        value={variant.color}
                        onChange={(val) =>
                          updateVariant(variant.id, "color", val as string)
                        }
                        placeholder="Color"
                        multi={false}
                      />
                    </div>

                    <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
                      <SearchableDropdown
                        options={SIZE_OPTIONS}
                        value={variant.size}
                        onChange={(val) =>
                          updateVariant(variant.id, "size", val as string)
                        }
                        placeholder="Size"
                        multi={false}
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

                    <div style={{ flex: "1 1 80px", minWidth: "80px" }}>
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
                        style={{ margin: 0 }}
                      />
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
