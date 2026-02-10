"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./ShowcaseProducts.module.css";
import "./nova-cards.css";
import ProductImageUpload from "../../components/ProductImageUpload";
import CategorySelect from "./components/CategorySelect";
import ProductCard from "./components/ProductCard";
import { useShowcaseSettings } from "../hooks/useShowcaseSettings";
import { broadcastStoreUpdate } from "@/app/utils/storeSync";
import { useAuth } from "@/app/components/auth/AuthProvider";

interface ShowcaseItem {
  id: string;
  title: string;
  description?: string;
  price?: number;
  image_url?: string;
  category?: string;
  is_visible: boolean;
  is_featured: boolean;
  created_at: string;
}

const PRODUCTS_PER_PAGE = 10; // Define products per page

export default function ShowcaseProductsPage() {
  const router = useRouter();
  const { firebaseUser } = useAuth();

  // ✅ Fetch settings to drive edit form fields
  const { config, loading: configLoading } = useShowcaseSettings();

  const [products, setProducts] = useState<ShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [productTitleToDelete, setProductTitleToDelete] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);

  // ✅ Search and Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    status: string[];
    category: string[];
  }>({
    status: [],
    category: [],
  });

  // ✅ Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // ✅ Edit Panel State
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShowcaseItem | null>(
    null,
  );

  // ✅ Edit Form State
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
    image_url: "",
    image_public_id: "",
    colors: [] as string[],
    sizes: [] as string[],
    stock_status: "in_stock",
    stock_quantity: 0,
    is_visible: true,
    is_featured: false,
  });

  // ✅ Categories for dropdown
  const [categories, setCategories] = useState<string[]>([]);

  // ✅ Username and canonical slug for View Showcase button
  const [username, setUsername] = useState<string | null>(null);
  const [canonicalSlug, setCanonicalSlug] = useState<string | null>(null);

  // ✅ Edit panel loading/error state
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ✅ Temporary Filter State (for filter menu before apply)
  const [tempFilters, setTempFilters] = useState<{
    status: string[];
    category: string[];
  }>(activeFilters);

  // ✅ Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if the click is outside any menu button or menu content
      const target = event.target as HTMLElement;
      if (
        openMenuId &&
        !target.closest(`[data-menu-id="${openMenuId}"]`) &&
        !target.closest(`[data-menu-button-id="${openMenuId}"]`)
      ) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openMenuId]);

  // ✅ Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        filterMenuOpen &&
        !target.closest(`.${styles.filterMenu}`) &&
        !target.closest(`.${styles.filterButton}`)
      ) {
        setFilterMenuOpen(false);
      }
    };

    if (filterMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [filterMenuOpen]);

  // ✅ Fetch categories for edit panel (Showcase + Store)
  useEffect(() => {
    const fetchCategories = async () => {
      const uniqueCategories = new Set<string>();

      // 1. From current showcase products
      products.forEach((product) => {
        if (product.category) {
          uniqueCategories.add(product.category);
        }
      });

      // 2. From store categories API
      try {
        const response = await fetch("/api/products/categories");
        if (response.ok) {
          const data = await response.json();
          if (data.categories && Array.isArray(data.categories)) {
            data.categories.forEach((cat: { name: string }) => {
              if (cat.name) uniqueCategories.add(cat.name);
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch store categories:", err);
      }

      setCategories(Array.from(uniqueCategories).sort());
    };

    fetchCategories();
  }, [products]);

  // ✅ Fetch username and canonical slug on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Fetch username
        const usernameResponse = await fetch("/api/user/username");
        if (usernameResponse.ok) {
          const usernameData = await usernameResponse.json();
          if (usernameData.success) {
            setUsername(usernameData.username);
          }
        }

        // Fetch business data to get canonical slug
        const businessResponse = await fetch("/api/business/get");
        if (businessResponse.ok) {
          const businessData = await businessResponse.json();
          // Slug is stored in business_name as lowercase URL-safe version
          // Or we can fetch from dedicated url_slug field if available
          if (businessData.url_slug) {
            setCanonicalSlug(businessData.url_slug);
          } else if (businessData.business_name) {
            // Generate slug client-side as fallback
            const slug = businessData.business_name
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            setCanonicalSlug(slug);
          }
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, []);

  // ✅ Real-time sync: Auto-refresh when products change
  useEffect(() => {
    const { subscribeToStoreUpdates } = require("@/app/utils/storeSync");

    const storeId = username || firebaseUser?.uid;
    if (!storeId) return;

    console.log(
      "[Dashboard Products] 🔄 Subscribing to real-time updates for:",
      storeId,
    );

    const unsubscribe = subscribeToStoreUpdates(storeId, (event: any) => {
      console.log("[Dashboard Products] 📡 Received update:", event.type);
      fetchProducts();
    });

    return () => unsubscribe();
  }, [username, firebaseUser?.uid]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/showcase/items");

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      const data = await response.json();
      console.log("API Response:", data);

      if (data.success) {
        const items = data.data?.items || data.data || [];
        setProducts(Array.isArray(items) ? items : []);
        setCurrentPage(1); // Reset to first page on new data
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleVisibility = async (id: string, currentState: boolean) => {
    try {
      const response = await fetch(`/api/showcase/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_visible: !currentState }),
      });

      if (!response.ok) throw new Error("Failed to update visibility");

      // ✅ ENTERPRISE FIX: Broadcast with BOTH username and userId
      // - username: For BroadcastChannel/localStorage (same-browser instant sync)
      // - userId: For Supabase Realtime (cross-device, cross-browser sync)
      if (username) {
        broadcastStoreUpdate(username);
      }
      if (firebaseUser?.uid) {
        broadcastStoreUpdate(firebaseUser.uid);
      }

      fetchProducts();
    } catch (err) {
      console.error("Error toggling visibility:", err);
    }
  };

  const showDeleteConfirmation = (id: string, title: string) => {
    setProductToDelete(id);
    setProductTitleToDelete(title);
    setDeleteModalOpen(true);
    setOpenMenuId(null); // Close any open dropdown menu
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      const response = await fetch(`/api/showcase/items/${productToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete product");

      // ✅ ENTERPRISE FIX: Broadcast with BOTH username and userId
      // - username: For BroadcastChannel/localStorage (same-browser instant sync)
      // - userId: For Supabase Realtime (cross-device, cross-browser sync)
      if (username) {
        broadcastStoreUpdate(username);
      }
      if (firebaseUser?.uid) {
        broadcastStoreUpdate(firebaseUser.uid);
      }

      setDeleteModalOpen(false);
      setProductToDelete(null);
      setProductTitleToDelete("");
      fetchProducts();
    } catch (err) {
      console.error("Error deleting product:", err);
      setErrorMessage("Failed to delete product. Please try again.");
      setErrorModalOpen(true);
      setDeleteModalOpen(false);
    }
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setProductToDelete(null);
    setProductTitleToDelete("");
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId(openMenuId === id ? null : id);
  };

  const handleViewShowcase = () => {
    // ✅ ENTERPRISE: Use canonical slug for showcase URL
    // Priority: canonicalSlug > username > uid
    const slug = canonicalSlug || username;
    if (slug) {
      const showcaseUrl = `/showcase/${slug}`;
      window.open(showcaseUrl, "_blank");
    } else if (firebaseUser?.uid) {
      // Fallback to UID if nothing else loaded
      const showcaseUrl = `/showcase/${firebaseUser.uid}`;
      window.open(showcaseUrl, "_blank");
    }
  };

  // ✅ Filter and Search Logic
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query),
      );
    }

    // Apply status filter
    if (activeFilters.status.length > 0) {
      filtered = filtered.filter((p) => {
        if (activeFilters.status.includes("active")) {
          return p.is_visible;
        }
        if (activeFilters.status.includes("out_of_stock")) {
          return !p.is_visible;
        }
        return false;
      });
    }

    // Apply category filter (if needed)
    if (activeFilters.category.length > 0) {
      filtered = filtered.filter((p) =>
        p.category
          ? activeFilters.category.includes(p.category.toLowerCase())
          : false,
      );
    }

    return filtered;
  }, [products, searchQuery, activeFilters]);

  const handleClearActiveFilters = () => {
    setActiveFilters({ status: [], category: [] });
    setTempFilters({ status: [], category: [] });
  };

  const hasActiveFilters =
    activeFilters.status.length > 0 || activeFilters.category.length > 0;

  // ✅ Edit Panel Handlers
  const openEditPanel = (product: ShowcaseItem) => {
    setEditingProduct(product);

    // Parse commerce data if available
    const commerce = (product as any).commerce || {};
    const variants = commerce.variants || [];
    const inventory = commerce.inventory || {};

    // Extract colors and sizes from variants
    const colors = [
      ...new Set(variants.map((v: any) => v.color).filter(Boolean)),
    ] as string[];
    const sizes = [
      ...new Set(variants.map((v: any) => v.size).filter(Boolean)),
    ] as string[];

    setEditFormData({
      title: product.title,
      description: product.description || "",
      price: product.price ? product.price.toString() : "",
      category: product.category || "",
      image_url: product.image_url || "",
      image_public_id: (product as any).image_public_id || "",
      colors: colors,
      sizes: sizes,
      stock_status: inventory.status || "in_stock",
      stock_quantity: inventory.quantity || 0,
      is_visible: product.is_visible,
      is_featured: product.is_featured,
    });

    setEditPanelOpen(true);
    setEditError(null);
    setOpenMenuId(null);
  };

  const closeEditPanel = () => {
    setEditPanelOpen(false);
    setEditingProduct(null);
    setEditError(null);
    setEditSaving(false);
  };

  // ✅ Save edited product
  const handleSaveEdit = async () => {
    if (!editingProduct) return;

    setEditSaving(true);
    setEditError(null);

    try {
      // Build commerce JSONB similar to add page
      const commerce = {
        price: editFormData.price ? parseFloat(editFormData.price) : null,
        inventory: {
          status: editFormData.stock_status,
          quantity: editFormData.stock_quantity,
        },
        variants: generateVariants(editFormData.colors, editFormData.sizes),
      };

      const payload = {
        title: editFormData.title,
        description: editFormData.description,
        imageUrl: editFormData.image_url,
        imagePublicId: editFormData.image_public_id,
        metadata: {
          category: editFormData.category || null,
        },
        commerce,
        isVisible: editFormData.is_visible,
        isFeatured: editFormData.is_featured,
      };

      const response = await fetch(`/api/showcase/items/${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update product");
      }

      // Success - close panel and refresh
      closeEditPanel();

      // ✅ ENTERPRISE FIX: Broadcast with BOTH username and userId
      // - username: For BroadcastChannel/localStorage (same-browser instant sync)
      // - userId: For Supabase Realtime (cross-device, cross-browser sync)
      if (username) {
        broadcastStoreUpdate(username);
      }
      if (firebaseUser?.uid) {
        broadcastStoreUpdate(firebaseUser.uid);
      }

      fetchProducts();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update product",
      );
    } finally {
      setEditSaving(false);
    }
  };

  // ✅ Helper to generate variants from colors and sizes
  const generateVariants = (colors: string[], sizes: string[]) => {
    if (colors.length === 0 && sizes.length === 0) return [];
    if (colors.length > 0 && sizes.length === 0) {
      return colors.map((color) => ({ color, size: null }));
    }
    if (colors.length === 0 && sizes.length > 0) {
      return sizes.map((size) => ({ color: null, size }));
    }
    // Cartesian product
    return colors.flatMap((color) => sizes.map((size) => ({ color, size })));
  };

  // ✅ Filter Handlers
  const toggleFilterStatus = (status: string) => {
    setTempFilters((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((s) => s !== status)
        : [...prev.status, status],
    }));
  };

  const applyFilters = () => {
    setActiveFilters(tempFilters);
    setFilterMenuOpen(false);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setTempFilters({ status: [], category: [] });
  };

  const openFilterMenu = () => {
    setTempFilters(activeFilters);
    setFilterMenuOpen(true);
  };

  // Pagination logic - using filtered products
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const currentProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setOpenMenuId(null); // Close any open menu when changing page
    }
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5; // Number of page buttons to show directly

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Always show first page
      pageNumbers.push(1);

      // Determine start and end for middle pages
      let startPage = Math.max(
        2,
        currentPage - Math.floor(maxPagesToShow / 2) + 1,
      );
      let endPage = Math.min(
        totalPages - 1,
        currentPage + Math.floor(maxPagesToShow / 2) - 1,
      );

      if (currentPage <= Math.ceil(maxPagesToShow / 2)) {
        endPage = maxPagesToShow - 1;
      } else if (currentPage > totalPages - Math.ceil(maxPagesToShow / 2)) {
        startPage = totalPages - maxPagesToShow + 2;
      }

      if (startPage > 2) {
        pageNumbers.push("...");
      }

      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }

      if (endPage < totalPages - 1) {
        pageNumbers.push("...");
      }

      // Always show last page
      if (totalPages > 1) {
        pageNumbers.push(totalPages);
      }
    }
    return pageNumbers;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading products...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Products</h1>
        <div className={styles.headerActions}>
          {/* View Showcase Button */}
          <button
            className={styles.viewShowcaseButton}
            onClick={handleViewShowcase}
            style={{
              background: "white",
              color: "#000",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: "500",
              cursor: "pointer",
              marginRight: "12px",
            }}
          >
            View Showcase
          </button>
          <button
            className={styles.addButton}
            onClick={() => router.push("/dashboard/showcase/products/add")}
          >
            + New product
          </button>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search products..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset to first page on search
            }}
          />
          <div style={{ position: "relative" }}>
            <button className={styles.filterButton} onClick={openFilterMenu}>
              Filters
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginLeft: "6px", opacity: 0.8 }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Filter Dropdown Menu */}
            {filterMenuOpen && (
              <div className={styles.filterMenu}>
                <div className={styles.filterSection}>
                  <div className={styles.filterSectionTitle}>Status</div>
                  <div
                    className={styles.filterOption}
                    onClick={() => toggleFilterStatus("active")}
                  >
                    <input
                      type="checkbox"
                      checked={tempFilters.status.includes("active")}
                      onChange={() => {}}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <label>Active</label>
                  </div>
                  <div
                    className={styles.filterOption}
                    onClick={() => toggleFilterStatus("out_of_stock")}
                  >
                    <input
                      type="checkbox"
                      checked={tempFilters.status.includes("out_of_stock")}
                      onChange={() => {}}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <label>Out of Stock</label>
                  </div>
                </div>

                <div className={styles.filterActions}>
                  <button
                    className={styles.filterClearButton}
                    onClick={clearFilters}
                  >
                    Clear
                  </button>
                  <button
                    className={styles.filterApplyButton}
                    onClick={applyFilters}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {hasActiveFilters && (
          <div className={styles.filterChip}>
            {activeFilters.status.includes("active") && "Status: Active"}
            {activeFilters.status.includes("out_of_stock") &&
              "Status: Out of Stock"}
            <button
              className={styles.closeChip}
              onClick={handleClearActiveFilters}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No products yet. Add your first product to get started!</p>
          <button
            className={styles.addButton}
            onClick={() => router.push("/dashboard/showcase/products/add")}
          >
            + Add Product
          </button>
        </div>
      ) : (
        <>
          {/* Nova Card Grid - Store Design Pattern */}
          <div className="productGrid">
            {currentProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => openEditPanel(product)}
                onToggleVisibility={() =>
                  toggleVisibility(product.id, product.is_visible)
                }
                onDelete={() =>
                  showDeleteConfirmation(product.id, product.title)
                }
              />
            ))}
          </div>

          {/* ✅ Real Pagination - Only show if more than 10 products */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageButton}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                ←
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    className={`${styles.pageButton} ${
                      currentPage === page ? styles.pageActive : ""
                    }`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ),
              )}

              <button
                className={styles.pageButton}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                →
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className={styles.deleteModalOverlay}>
          <div className={styles.deleteModal}>
            <div className={styles.deleteModalHeader}>
              <h3>Delete Product</h3>
              <button
                className={styles.closeButton}
                onClick={cancelDelete}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.deleteModalBody}>
              <p>
                Are you sure you want to delete &quot;{productTitleToDelete}
                &quot;?
              </p>
              <p>This action cannot be undone.</p>
            </div>
            <div className={styles.deleteModalFooter}>
              <button className={styles.cancelButton} onClick={cancelDelete}>
                Cancel
              </button>
              <button className={styles.modalButtonYes} onClick={confirmDelete}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModalOpen && (
        <div className={styles.deleteModalOverlay}>
          <div className={styles.deleteModal}>
            <div className={styles.deleteModalHeader}>
              <h3>Error</h3>
              <button
                className={styles.closeButton}
                onClick={() => setErrorModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.deleteModalBody}>
              <p>{errorMessage}</p>
            </div>
            <div className={styles.deleteModalFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setErrorModalOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Side Panel */}
      {editPanelOpen && (
        <>
          <div
            className={`${styles.editPanelOverlay} ${editPanelOpen ? styles.open : ""}`}
            onClick={closeEditPanel}
          />
          <div
            className={`${styles.editPanel} ${editPanelOpen ? styles.open : ""}`}
          >
            <div className={styles.editPanelHeader}>
              <h2>Edit Product</h2>
              <button
                className={styles.editPanelClose}
                onClick={closeEditPanel}
              >
                ×
              </button>
            </div>
            <div className={styles.editPanelContent}>
              {editingProduct && (
                <>
                  {editError && (
                    <div className={styles.editError}>{editError}</div>
                  )}

                  <div className={styles.editFormGroup}>
                    <label htmlFor="edit-title" className={styles.editLabel}>
                      Product Name *
                    </label>
                    <input
                      id="edit-title"
                      type="text"
                      required
                      className={styles.editInput}
                      value={editFormData.title}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          title: e.target.value,
                        })
                      }
                      placeholder="Enter product name"
                    />
                  </div>

                  {config?.fields?.description?.visible !== false && (
                    <div className={styles.editFormGroup}>
                      <label
                        htmlFor="edit-description"
                        className={styles.editLabel}
                      >
                        Description
                      </label>
                      <textarea
                        id="edit-description"
                        className={styles.editTextarea}
                        value={editFormData.description}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            description: e.target.value,
                          })
                        }
                        placeholder="Enter product description"
                        rows={4}
                      />
                    </div>
                  )}

                  <div className={styles.editFormGroup}>
                    <label htmlFor="edit-price" className={styles.editLabel}>
                      Price
                    </label>
                    <input
                      id="edit-price"
                      type="number"
                      step="0.01"
                      min="0"
                      className={styles.editInput}
                      value={editFormData.price}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          price: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <div className={styles.editFormGroup}>
                    <label htmlFor="edit-category" className={styles.editLabel}>
                      Category
                    </label>
                    <CategorySelect
                      value={editFormData.category}
                      onChange={(value) =>
                        setEditFormData({ ...editFormData, category: value })
                      }
                      categories={categories}
                      placeholder="Search or add category..."
                    />
                  </div>

                  <div className={styles.editFormGroup}>
                    <label className={styles.editLabel}>Product Image</label>
                    <ProductImageUpload
                      productId={editingProduct.id}
                      imageUrl={editFormData.image_url}
                      imagePublicId={editFormData.image_public_id}
                      onUpload={(result: any) => {
                        setEditFormData({
                          ...editFormData,
                          image_url: result.secure_url,
                          image_public_id: result.public_id,
                        });
                      }}
                      onDelete={() => {
                        setEditFormData({
                          ...editFormData,
                          image_url: "",
                          image_public_id: "",
                        });
                      }}
                    />
                  </div>

                  {config?.fields?.colors?.visible && (
                    <div className={styles.editFormGroup}>
                      <label className={styles.editLabel}>
                        Available Colors
                      </label>
                      <input
                        type="text"
                        className={styles.editInput}
                        placeholder="e.g., Red, Blue, Green (comma-separated)"
                        value={editFormData.colors.join(", ")}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            colors: e.target.value
                              .split(",")
                              .map((c) => c.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      <small className={styles.editHint}>
                        Enter colors separated by commas.
                      </small>
                    </div>
                  )}

                  {config?.fields?.sizes?.visible && (
                    <div className={styles.editFormGroup}>
                      <label className={styles.editLabel}>
                        Available Sizes
                      </label>
                      <input
                        type="text"
                        className={styles.editInput}
                        placeholder="e.g., S, M, L, XL (comma-separated)"
                        value={editFormData.sizes.join(", ")}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            sizes: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      <small className={styles.editHint}>
                        Enter sizes separated by commas.
                      </small>
                    </div>
                  )}

                  {config?.fields?.stock?.visible && (
                    <>
                      <div className={styles.editFormGroup}>
                        <label
                          htmlFor="edit-stock-status"
                          className={styles.editLabel}
                        >
                          Stock Status
                        </label>
                        <select
                          id="edit-stock-status"
                          className={styles.editSelect}
                          value={editFormData.stock_status}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              stock_status: e.target.value,
                            })
                          }
                        >
                          <option value="in_stock">In Stock</option>
                          <option value="low_stock">Low Stock</option>
                          <option value="out_of_stock">Out of Stock</option>
                          <option value="pre_order">Pre-order</option>
                        </select>
                      </div>
                      <div className={styles.editFormGroup}>
                        <label
                          htmlFor="edit-stock-quantity"
                          className={styles.editLabel}
                        >
                          Stock Quantity
                        </label>
                        <input
                          id="edit-stock-quantity"
                          type="number"
                          min="0"
                          className={styles.editInput}
                          value={editFormData.stock_quantity}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              stock_quantity: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className={styles.editFormGroup}>
                    <label className={styles.editCheckboxLabel}>
                      <input
                        type="checkbox"
                        checked={editFormData.is_visible}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            is_visible: e.target.checked,
                          })
                        }
                      />
                      Visible on showcase
                    </label>
                  </div>

                  <div className={styles.editFormGroup}>
                    <label className={styles.editCheckboxLabel}>
                      <input
                        type="checkbox"
                        checked={editFormData.is_featured}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            is_featured: e.target.checked,
                          })
                        }
                      />
                      Feature this product
                    </label>
                  </div>

                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.editCancelButton}
                      onClick={closeEditPanel}
                      disabled={editSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.editSaveButton}
                      onClick={handleSaveEdit}
                      disabled={editSaving || !editFormData.title.trim()}
                    >
                      {editSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
