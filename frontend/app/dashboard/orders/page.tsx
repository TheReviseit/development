"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./orders.module.css";
import { useRealtimeOrders } from "@/lib/hooks/useRealtimeOrders";
import ImageModal from "../components/ImageModal";
import Dropdown from "@/app/utils/ui/Dropdown";
import { useFeatureGate } from "@/lib/hooks/useFeatureGate";

interface FeatureUsage {
  used: number;
  limit: number | null;
  allowed: boolean;
}

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  notes?: string;
  size?: string;
  color?: string;
  variant_display?: string;
  image?: string;
  imageUrl?: string;
  product_id?: string;
  variant_id?: string;
}

interface Order {
  id: string;
  order_id?: string;
  user_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  items: OrderItem[];
  total_quantity: number;
  status: "pending" | "confirmed" | "processing" | "completed" | "cancelled";
  source: "ai" | "manual";
  notes?: string;
  created_at: string;
  updated_at?: string;
  custom_fields?: any;
  payment_status?: string;
  payment_method?: string;
  razorpay_payment_id?: string;
}

interface OrderFormData {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  items: OrderItem[];
  notes: string;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formData, setFormData] = useState<OrderFormData>({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    items: [{ name: "", quantity: 1 }],
    notes: "",
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false); // Add view mode state
  const [productImages, setProductImages] = useState<Record<string, string>>(
    {},
  ); // Cache for product images
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set()); // Track orders being updated
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null); // For image zoom modal
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    order: Order;
    newStatus: string;
  } | null>(null); // For status change confirmation

  // Google Sheets integration state
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetSyncEnabled, setSheetSyncEnabled] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetConnected, setSheetConnected] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Feature gate: google_sheets_sync — server-authoritative check via
  // backend FeatureGateEngine (respects plan limits + subscription status)
  const { allowed: canAccessSheets } =
    useFeatureGate("google_sheets_sync");

  // Feature usage for live_order_updates and email_invoices
  const [notifUsage, setNotifUsage] = useState<FeatureUsage | null>(null);
  const [invoiceUsage, setInvoiceUsage] = useState<FeatureUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const refreshNotifUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/features/check?feature=live_order_updates");
      if (res.ok) {
        const data = await res.json();
        setNotifUsage({
          used: data.used ?? 0,
          limit: data.hard_limit ?? null,
          allowed: data.allowed ?? false,
        });
      }
    } catch (err) {
      console.error("Error refreshing order updates usage:", err);
    }
  }, []);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const [notifRes, invoiceRes] = await Promise.all([
          fetch("/api/features/check?feature=live_order_updates"),
          fetch("/api/features/check?feature=email_invoices"),
        ]);

        if (notifRes.ok) {
          const data = await notifRes.json();
          setNotifUsage({
            used: data.used ?? 0,
            limit: data.hard_limit ?? null,
            allowed: data.allowed ?? false,
          });
        }

        if (invoiceRes.ok) {
          const data = await invoiceRes.json();
          setInvoiceUsage({
            used: data.used ?? 0,
            limit: data.hard_limit ?? null,
            allowed: data.allowed ?? false,
          });
        }
      } catch (err) {
        console.error("Error fetching feature usage:", err);
      } finally {
        setUsageLoading(false);
      }
    };
    fetchUsage();
  }, []);

  // Fetch user ID for realtime subscription
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const response = await fetch("/api/me");
        const data = await response.json();
        if (data.success && data.user?.uid) {
          setUserId(data.user.uid);
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }
    };
    fetchUserId();
  }, []);

  // Load Google Sheet settings (no redirect needed)
  useEffect(() => {
    const loadSheetSettings = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        if (data.success && data.data) {
          // Load Google Sheet settings if available
          if (data.data.order_sheet_url) {
            setSheetUrl(data.data.order_sheet_url);
            setSheetConnected(true);
          }
          if (data.data.order_sheet_sync_enabled) {
            setSheetSyncEnabled(data.data.order_sheet_sync_enabled);
          }
        }
      } catch (error) {
        console.error("Error loading sheet settings:", error);
      }
    };
    loadSheetSettings();
  }, []);

  // Real-time order handlers with optimistic updates
  const handleRealtimeInsert = useCallback((newOrder: Order) => {
    setOrders((prev) => {
      // Check if order already exists (prevent duplicates)
      if (prev.some((order) => order.id === newOrder.id)) {
        return prev;
      }
      // Add new order at the top
      return [newOrder, ...prev];
    });
  }, []);

  const handleRealtimeUpdate = useCallback((updatedOrder: Order) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === updatedOrder.id ? { ...updatedOrder } : order,
      ),
    );
    // Remove from updating set when realtime update arrives
    setUpdatingStatus((prev) => {
      const next = new Set(prev);
      next.delete(updatedOrder.id);
      return next;
    });
  }, []);

  const handleRealtimeDelete = useCallback((deleted: { id: string }) => {
    setOrders((prev) => prev.filter((order) => order.id !== deleted.id));
  }, []);

  // Subscribe to realtime updates
  const { isConnected: realtimeConnected } = useRealtimeOrders({
    userId,
    onInsert: handleRealtimeInsert,
    onUpdate: handleRealtimeUpdate,
    onDelete: handleRealtimeDelete,
    enabled: !!userId,
  });

  // Optimized: Fetch product image with caching
  const fetchProductImage = useCallback(
    async (productId: string) => {
      // Extract base product ID if it's in concatenated format (e.g., "uuid_variant_uuid")
      let baseProductId = productId;
      if (productId.includes("_variant_")) {
        baseProductId = productId.split("_variant_")[0];
      }

      // Return cached image if available (check both original and base ID)
      if (productImages[productId]) {
        return productImages[productId] || null;
      }
      if (productImages[baseProductId]) {
        return productImages[baseProductId] || null;
      }

      try {
        const response = await fetch(`/api/products/${baseProductId}`);
        const data = await response.json();

        if (data.product?.image_url) {
          const imageUrl = data.product.image_url;
          // Cache under both the original productId and baseProductId
          setProductImages((prev) => ({
            ...prev,
            [productId]: imageUrl,
            [baseProductId]: imageUrl,
          }));
          return imageUrl;
        }
      } catch (error) {
        console.error(
          `Error fetching product image for ${baseProductId}:`,
          error,
        );
      }

      return null;
    },
    [productImages],
  );

  // Fetch orders (only on mount or filter change, not on status updates)
  const fetchOrders = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
        const params = new URLSearchParams();
        if (filter !== "all") {
          params.set("status", filter);
        }

        const response = await fetch(`/api/orders?${params.toString()}`, {
          cache: "no-store",
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
          },
        });
        const data = await response.json();

        if (data.success) {
          const ordersData = data.data || [];
          // setOrders(ordersData); // We need to be careful not to overwrite optimistic updates if we were editing?
          // Actually for the list view, overwriting is fine, but we should perhaps check if we are editing?
          // For simplicity, we just update the list.
          setOrders(ordersData);

          // Optimized: Batch fetch images instead of individual requests
          // Collect all unique product IDs that need images
          const productIdsToFetch = new Set<string>();
          ordersData.forEach((order: Order) => {
            order.items.forEach((item: OrderItem) => {
              if (
                item.product_id &&
                !item.image &&
                !item.imageUrl &&
                !productImages[item.product_id]
              ) {
                productIdsToFetch.add(item.product_id);
              }
            });
          });

          // Fetch images in parallel with Promise.allSettled (doesn't fail if one fails)
          if (productIdsToFetch.size > 0) {
            const imagePromises = Array.from(productIdsToFetch).map(
              (productId) => fetchProductImage(productId),
            );
            await Promise.allSettled(imagePromises);
          }
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [filter, fetchProductImage, productImages],
  );

  // Only fetch on mount or when filter changes
  useEffect(() => {
    // Only show loading on initial mount, not on filter changes
    if (orders.length === 0) {
      fetchOrders(true);
    } else {
      fetchOrders(false);
    }
  }, [filter]); // fetchOrders is stable due to useCallback

  // Smart polling: Only poll when tab is visible and at a reasonable interval (30s)
  // This is much more efficient than aggressive 5-second polling
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Fetch immediately when tab becomes visible
        fetchOrders(false);
        // Start polling
        intervalId = setInterval(() => {
          fetchOrders(false);
        }, 30000); // 30 seconds - enterprise standard
      } else {
        // Stop polling when tab is hidden
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Initial setup
    if (document.visibilityState === "visible") {
      intervalId = setInterval(() => {
        fetchOrders(false);
      }, 30000);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchOrders]);

  // Memoized stats - only recalculate when orders change
  const stats = useMemo(() => {
    return {
      pending: orders.filter((o) => o.status === "pending").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
      processing: orders.filter((o) => o.status === "processing").length,
      completed: orders.filter((o) => o.status === "completed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      total: orders.length,
    };
  }, [orders]);

  // Memoized filtered orders - only recalculate when orders or filter changes
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filter === "all") return true;
      return order.status === filter;
    });
  }, [orders, filter]);

  // Google Sheets handlers
  const handleSaveSheetSettings = async () => {
    setSavingSheet(true);
    try {
      // 1. Save sheet settings
      const response = await fetch("/api/ai-capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_sheet_url: sheetUrl,
          order_sheet_sync_enabled: sheetSyncEnabled,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // 2. If sheet URL is provided and connected, initialize sheet with headers
        let initSuccess = true;
        let initMessage = "";

        if (sheetUrl && userId) {
          try {
            const initResponse = await fetch("/api/orders/sheets/initialize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId }),
            });
            const initData = await initResponse.json();

            if (initData.success) {
              console.log(
                "✅ Sheet initialized with headers:",
                initData.data?.headers,
              );
              initSuccess = true;
            } else {
              console.warn("⚠️ Sheet init warning:", initData.error?.message);
              initSuccess = false;
              initMessage =
                initData.error?.message ||
                "Failed to initialize sheet headers.";
            }
          } catch (err) {
            console.warn("⚠️ Sheet init error:", err);
            initSuccess = false;
            initMessage = "Network error during sheet initialization.";
          }
        }

        setSheetConnected(!!sheetUrl);
        setShowSheetModal(false);

        if (sheetUrl && !initSuccess) {
          alert(
            `Settings saved, but could not connect to Sheet:\n${initMessage}\n\nPlease check permissions and try again.`,
          );
        } else if (sheetUrl) {
          alert("✅ Google Sheet connected and initialized successfully!");
        } else {
          // Disconnected case logic handled mostly by handleDisconnect, but if they cleared URL here
          if (!sheetUrl) alert("Google Sheet disconnected.");
        }
      } else {
        alert(
          "Failed to save Google Sheet settings: " +
            (data.error || "Unknown error"),
        );
      }
    } catch (error) {
      console.error("Error saving sheet settings:", error);
      alert("Failed to save settings");
    } finally {
      setSavingSheet(false);
    }
  };

  const handleDisconnectSheet = async () => {
    if (!confirm("Disconnect Google Sheet? Orders will no longer sync."))
      return;

    setSavingSheet(true);
    try {
      await fetch("/api/ai-capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_sheet_url: "",
          order_sheet_sync_enabled: false,
        }),
      });
      setSheetUrl("");
      setSheetSyncEnabled(false);
      setSheetConnected(false);
      setShowSheetModal(false);
    } catch (error) {
      console.error("Error disconnecting sheet:", error);
    } finally {
      setSavingSheet(false);
    }
  };

  // Form handlers
  const handleOpenModal = async (order?: Order) => {
    if (order) {
      setEditingOrder(order);
      setIsViewMode(true); // Default to view mode for existing orders

      // Extract address from notes if not present in customer_address
      let address = order.customer_address || "";
      let notes = order.notes || "";

      if (!address && notes) {
        const addressMatch = notes.match(/Address:\s*([^\n]+)/i);
        if (addressMatch) {
          address = addressMatch[1].trim();
          // Remove address from notes to avoid duplication
          notes = notes.replace(/Address:\s*[^\n]+/i, "").trim();
        }
      }

      const parsedItems = (
        order.items.length > 0
          ? order.items
          : [{ name: "", quantity: 1 } as OrderItem]
      ).map((item) => {
        let name = item.name;
        let size = item.size || "";
        let color = item.color || "";
        let notes = item.notes || "";

        // Attempt to extract from name if size/color are missing
        if (!size || !color) {
          // Check for pattern: Name (Size: X, Color: Y) or Name - Size: X, Color: Y
          const sizeMatch =
            name.match(/Size:\s*([^,)]+)/i) || notes.match(/Size:\s*([^,)]+)/i);
          const colorMatch =
            name.match(/Color:\s*([^,)]+)/i) ||
            notes.match(/Color:\s*([^,)]+)/i);

          if (sizeMatch && !size) {
            size = sizeMatch[1].trim();
            name = name
              .replace(/Size:\s*[^,)]+[, ]*/i, "")
              .replace(/[()]/g, "")
              .trim();
            notes = notes.replace(/Size:\s*[^,)]+[, ]*/i, "").trim();
          }

          if (colorMatch && !color) {
            color = colorMatch[1].trim();
            name = name
              .replace(/Color:\s*[^,)]+[, ]*/i, "")
              .replace(/[()]/g, "")
              .trim();
            notes = notes.replace(/Color:\s*[^,)]+[, ]*/i, "").trim();
          }

          // Clean up trailing commas or dashes in name
          name = name.replace(/,\s*$/, "").replace(/-\s*$/, "").trim();
        }

        return {
          ...item,
          name,
          size,
          color,
          notes,
        };
      });

      setFormData({
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: address,
        items: parsedItems,
        notes: notes,
      });

      // Fetch product images for items that have product_id but no image
      const imagePromises = parsedItems
        .filter((item) => item.product_id && !item.image && !item.imageUrl)
        .map((item) => fetchProductImage(item.product_id!));
      await Promise.all(imagePromises);
    } else {
      setEditingOrder(null);
      setIsViewMode(false); // Edit mode for new orders
      setFormData({
        customer_name: "",
        customer_phone: "",
        customer_address: "",
        items: [{ name: "", quantity: 1 }],
        notes: "",
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingOrder(null);
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", quantity: 1 }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length === 1) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof OrderItem,
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Filter out empty items
      const validItems = formData.items.filter(
        (item) => item.name.trim() !== "" && item.quantity > 0,
      );

      if (validItems.length === 0) {
        alert("Please add at least one item");
        setSubmitting(false);
        return;
      }

      const url = editingOrder
        ? `/api/orders/${editingOrder.id}`
        : "/api/orders";
      const method = editingOrder ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone,
          customer_address: formData.customer_address,
          items: validItems,
          notes: formData.notes,
          source: "manual",
          sync_to_sheet: sheetSyncEnabled && sheetConnected,
        }),
      });

      const data = await response.json();

      if (data.success) {
        handleCloseModal();
        fetchOrders();
      } else {
        alert(data.error || "Failed to save order");
      }
    } catch (error) {
      console.error("Error saving order:", error);
      alert("Failed to save order");
    } finally {
      setSubmitting(false);
    }
  };

  // Show confirmation modal before changing status
  const handleStatusChange = (order: Order, newStatus: string) => {
    // Don't show confirmation if status is the same
    if (order.status === newStatus) return;
    setPendingStatusChange({ order, newStatus });
  };

  // Cancel status change
  const cancelStatusChange = () => {
    setPendingStatusChange(null);
  };

  // Confirm and execute status change
  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;

    const { order, newStatus } = pendingStatusChange;
    const previousStatus = order.status;

    // Close confirmation modal
    setPendingStatusChange(null);

    // Optimistic update - update UI immediately
    setUpdatingStatus((prev) => new Set(prev).add(order.id));

    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: newStatus as Order["status"],
              updated_at: new Date().toISOString(),
            }
          : o,
      ),
    );

    // Create abort controller for timeout (10 seconds max)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Revert on error
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? { ...o, status: previousStatus, updated_at: order.updated_at }
              : o,
          ),
        );
        console.error(`Failed to update order status: ${response.status}`);
        alert("Failed to update order status. Please try again.");
      }
      // Success! The optimistic update is already applied.
      // Realtime subscription may send a confirmation, but we don't depend on it.
      // Refresh the Order Updates usage counter so the UI reflects the new count.
      refreshNotifUsage();
    } catch (error) {
      clearTimeout(timeoutId);

      // Check if this was a timeout abort
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const errorMessage = isTimeout
        ? "Request timed out. Please check your connection."
        : "Failed to update order status. Please try again.";

      console.error("Error updating status:", error);

      // Revert on error
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: previousStatus, updated_at: order.updated_at }
            : o,
        ),
      );
      alert(errorMessage);
    } finally {
      // CRITICAL: Always clear loading state regardless of success/failure
      // This guarantees the UI never gets stuck in an infinite loading state
      setUpdatingStatus((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Show delete confirmation popup
  const handleCancelOrder = (order: Order) => {
    setOrderToDelete(order);
  };

  const cancelDeleteOrder = () => {
    setOrderToDelete(null);
  };

  const confirmDeleteOrder = async () => {
    const order = orderToDelete;
    if (!order) return;
    setOrderToDelete(null);

    // Store original order for revert on error
    const originalOrders = [...orders];

    // Optimistic removal from UI
    setOrders((prev) => prev.filter((o) => o.id !== order.id));

    // Create abort controller for timeout (10 seconds max)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Revert on error - add order back
        setOrders(originalOrders);
        console.error(`Failed to delete order: ${response.status}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Error deleting order:", error);
      // Revert on error - add order back
      setOrders(originalOrders);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className={styles.ordersView}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.ordersView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div className={styles.headerActions}>
          {/* Google Sheets Button - hidden for Basic plan */}
          {canAccessSheets && (
            <button
              className={`${styles.secondaryBtn} ${
                sheetConnected ? styles.sheetConnected : ""
              }`}
              onClick={() => setShowSheetModal(true)}
              title={
                sheetConnected
                  ? "Google Sheet connected"
                  : "Connect Google Sheet"
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line x1="3" y1="9" x2="21" y2="9" strokeLinecap="round" />
                <line x1="3" y1="15" x2="21" y2="15" strokeLinecap="round" />
                <line x1="9" y1="3" x2="9" y2="21" strokeLinecap="round" />
              </svg>
              {sheetConnected ? "Sheet Connected" : "Connect Sheet"}
              {sheetConnected && <span className={styles.connectedDot}></span>}
            </button>
          )}
          {/* <button
            className={styles.secondaryBtn}
            onClick={() => fetchOrders()}
            title="Refresh orders"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 3v5h-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Refresh
          </button> */}
          <button
            className={styles.primaryBtn}
            onClick={() => handleOpenModal()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
              <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
            </svg>
            New Order
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Image
              src="/icons/orders/Pending.svg"
              alt="Pending"
              width={32}
              height={32}
            />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.pending}</div>
            <div className={`${styles.statLabel} ${styles.pendingLabel}`}>
              Pending
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Image
              src="/icons/orders/confirmed.svg"
              alt="Confirmed"
              width={32}
              height={32}
            />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.confirmed}</div>
            <div className={`${styles.statLabel} ${styles.confirmedLabel}`}>
              Confirmed
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Image
              src="/icons/orders/processing.svg"
              alt="Processing"
              width={32}
              height={32}
            />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.processing}</div>
            <div className={`${styles.statLabel} ${styles.processingLabel}`}>
              Processing
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Image
              src="/icons/orders/completed.svg"
              alt="Completed"
              width={32}
              height={32}
            />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.completed}</div>
            <div className={`${styles.statLabel} ${styles.completedLabel}`}>
              Completed
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Image
              src="/icons/orders/total.svg"
              alt="Total"
              width={32}
              height={32}
            />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>Total</div>
          </div>
        </div>
      </div>

      {/* Usage Limits Row */}
      {!usageLoading && (notifUsage?.limit !== null || invoiceUsage?.limit !== null) && (
        <div className={styles.usageLimitsRow}>
          {notifUsage && notifUsage.limit !== null && (
            <div className={styles.usageLimitCard}>
              <div className={styles.usageLimitHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={styles.usageLimitTitle}>Order Updates</span>
              </div>
              <div className={styles.usageLimitValues}>
                <span className={styles.usageLimitCount}>
                  {notifUsage.used} / {notifUsage.limit}
                </span>
                <span className={styles.usageLimitRemaining}>
                  {notifUsage.allowed
                    ? `${notifUsage.limit - notifUsage.used} remaining`
                    : "Limit reached"}
                </span>
              </div>
              <div className={styles.usageLimitBar}>
                <div
                  className={styles.usageLimitBarFill}
                  style={{
                    width: `${Math.min(100, (notifUsage.used / notifUsage.limit) * 100)}%`,
                    backgroundColor:
                      notifUsage.used >= notifUsage.limit
                        ? "#ef4444"
                        : notifUsage.used >= notifUsage.limit * 0.8
                          ? "#f59e0b"
                          : "#22c15a",
                  }}
                />
              </div>
            </div>
          )}
          {invoiceUsage && invoiceUsage.limit !== null && (
            <div className={styles.usageLimitCard}>
              <div className={styles.usageLimitHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/>
                  <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/>
                </svg>
                <span className={styles.usageLimitTitle}>Email Invoices</span>
              </div>
              <div className={styles.usageLimitValues}>
                <span className={styles.usageLimitCount}>
                  {invoiceUsage.used} / {invoiceUsage.limit}
                </span>
                <span className={styles.usageLimitRemaining}>
                  {invoiceUsage.allowed
                    ? `${invoiceUsage.limit - invoiceUsage.used} remaining`
                    : "Limit reached"}
                </span>
              </div>
              <div className={styles.usageLimitBar}>
                <div
                  className={styles.usageLimitBarFill}
                  style={{
                    width: `${Math.min(100, (invoiceUsage.used / invoiceUsage.limit) * 100)}%`,
                    backgroundColor:
                      invoiceUsage.used >= invoiceUsage.limit
                        ? "#ef4444"
                        : invoiceUsage.used >= invoiceUsage.limit * 0.8
                          ? "#f59e0b"
                          : "#22c15a",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Orders Section */}
      <div className={styles.ordersSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>All Orders</h2>

          {/* Mobile Filter Dropdown - Hidden on Desktop */}
          <div className={styles.mobileFilterDropdown}>
            <Dropdown
              options={[
                { value: "all", label: "All Orders" },
                { value: "pending", label: "Pending" },
                { value: "confirmed", label: "Confirmed" },
                { value: "processing", label: "Processing" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              value={filter}
              onChange={(value) => setFilter(value)}
              className={styles.filterDropdownBtn}
            />
          </div>

          {/* Desktop Filter Tabs - Hidden on Mobile */}
          <div className={styles.filterTabs}>
            {[
              "all",
              "pending",
              "confirmed",
              "processing",
              "completed",
              "cancelled",
            ].map((status) => (
              <button
                key={status}
                className={`${styles.filterTab} ${
                  filter === status ? styles.filterTabActive : ""
                }`}
                onClick={() => setFilter(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📦</div>
            <h3 className={styles.emptyTitle}>No orders found</h3>
            <p className={styles.emptyText}>
              {filter === "all"
                ? "Create your first order or wait for AI to book one."
                : `No ${filter} orders at the moment.`}
            </p>
            <button
              className={styles.primaryBtn}
              onClick={() => handleOpenModal()}
            >
              Create Order
            </button>
          </div>
        ) : (
          <>
            <table className={styles.ordersTable}>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} onClick={() => handleOpenModal(order)}>
                    <td>
                      <span className={styles.orderId}>
                        {order.order_id || order.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={styles.customerName}>
                        {order.customer_name}
                      </span>
                    </td>
                    <td>
                      <div className={styles.itemsList}>
                        {order.items.slice(0, 3).map((item, idx) => (
                          <span key={idx} className={styles.itemName}>
                            {item.name}
                            {idx < Math.min(order.items.length, 3) - 1
                              ? ", "
                              : ""}
                          </span>
                        ))}
                        {order.items.length > 3 && (
                          <span className={styles.moreItems}>
                            +{order.items.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          styles[order.status]
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.sourceBadge} ${
                          styles[order.source]
                        }`}
                      >
                        {order.source === "ai" ? "🤖 AI" : "Manual"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.orderDate}>
                        {formatDate(order.created_at)}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionButtons}>
                        <Dropdown
                          options={STATUS_OPTIONS}
                          value={order.status}
                          onChange={(value) => handleStatusChange(order, value)}
                          disabled={updatingStatus.has(order.id)}
                          className={`${styles.statusDropdown} ${
                            updatingStatus.has(order.id)
                              ? styles.dropdownUpdating
                              : ""
                          }`}
                        />
                        <button
                          className={`${styles.actionBtn} ${styles.danger}`}
                          onClick={() => handleCancelOrder(order)}
                          title="Cancel order"
                          aria-label="Cancel order"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line
                              x1="18"
                              y1="6"
                              x2="6"
                              y2="18"
                              strokeLinecap="round"
                            />
                            <line
                              x1="6"
                              y1="6"
                              x2="18"
                              y2="18"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Order Cards - shown on screens < 768px */}
            <div className={styles.mobileOrderCards}>
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className={styles.orderCard}
                  onClick={() => handleOpenModal(order)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleOpenModal(order);
                    }
                  }}
                >
                  {/* Cancel button - top right corner */}
                  <button
                    className={styles.orderCardCancelBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelOrder(order);
                    }}
                    aria-label="Cancel order"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line
                        x1="18"
                        y1="6"
                        x2="6"
                        y2="18"
                        strokeLinecap="round"
                      />
                      <line
                        x1="6"
                        y1="6"
                        x2="18"
                        y2="18"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  {/* Header - customer name and date stacked */}
                  <div className={styles.orderCardHeader}>
                    <span className={styles.orderCardCustomer}>
                      {order.customer_name}
                    </span>
                    <span className={styles.orderCardDate}>
                      {formatDate(order.created_at)}
                    </span>
                  </div>

                  {/* Items list */}
                  <div className={styles.orderCardItems}>
                    {order.items.map((item, idx) => (
                      <span key={idx}>
                        {item.quantity}× {item.name}
                        {item.size ? ` (${item.size})` : ""}
                        {item.color ? ` - ${item.color}` : ""}
                        {idx < order.items.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>

                  {/* Footer - badges and full-width dropdown */}
                  <div
                    className={styles.orderCardFooter}
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <div className={styles.orderCardBadges}>
                      <span
                        className={`${styles.statusBadge} ${
                          styles[order.status]
                        }`}
                      >
                        {order.status}
                      </span>
                      <span
                        className={`${styles.sourceBadge} ${
                          styles[order.source]
                        }`}
                      >
                        {order.source === "ai" ? "🤖 AI" : "Manual"}
                      </span>
                    </div>
                    <div className={styles.orderCardActions}>
                      <Dropdown
                        options={STATUS_OPTIONS}
                        value={order.status}
                        onChange={(value) => handleStatusChange(order, value)}
                        disabled={updatingStatus.has(order.id)}
                        className={`${styles.statusDropdownMobile} ${
                          updatingStatus.has(order.id)
                            ? styles.dropdownUpdating
                            : ""
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          className={styles.modalOverlay}
          onClick={handleCloseModal}
          role="presentation"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-modal-title"
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleWrapper}>
                <h3 id="order-modal-title" className={styles.modalTitle}>
                  {isViewMode
                    ? "Order Details"
                    : editingOrder
                      ? "Edit Order"
                      : "Create New Order"}
                </h3>
                {isViewMode && editingOrder && (
                  <span className={styles.modalOrderId}>
                    #
                    {editingOrder.order_id ||
                      editingOrder.id.slice(0, 8).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                className={styles.modalClose}
                onClick={handleCloseModal}
                aria-label="Close modal"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                  <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {isViewMode ? (
              <div className={styles.modalBody}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Customer Name</label>
                    <div className={styles.viewField}>
                      {formData.customer_name}
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <div className={styles.viewField}>
                      {formData.customer_phone}
                    </div>
                  </div>
                </div>

                <div className={styles.formGroup} style={{ width: "100%" }}>
                  <label>Delivery Address</label>
                  <div className={styles.viewField}>
                    {formData.customer_address || "No address provided"}
                  </div>
                </div>

                {/* Payment Info */}
                {(() => {
                  const customFields = editingOrder?.custom_fields || {};
                  const paymentInfo = customFields?.payment || {};
                  
                  const notesText = editingOrder?.notes || "";
                  const hasPaymentIdFromNotes = notesText.includes("Payment ID: pay_");
                  const hasPaymentId = !!(paymentInfo.razorpay_payment_id || customFields.razorpay_payment_id || editingOrder?.razorpay_payment_id || hasPaymentIdFromNotes);
                  
                  const rawMethod = paymentInfo.method || customFields.paymentMethod || customFields.payment_method || editingOrder?.payment_method;
                  let method = 'Not specified';
                  if (rawMethod) {
                    method = rawMethod.toLowerCase() === 'cod' ? 'COD' : 'Online Payment';
                  } else if (hasPaymentId) {
                    method = 'Online Payment';
                  }
                  
                  const rawStatus = paymentInfo.status || customFields.paymentStatus || customFields.payment_status || editingOrder?.payment_status;
                  
                  let status = 'Pending';
                  if (hasPaymentId || (rawStatus && rawStatus.toLowerCase() === 'paid')) {
                    status = 'Paid';
                  } else if (rawStatus) {
                    status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
                  } else if (rawMethod && rawMethod.toLowerCase() === 'cod') {
                    status = 'Pending (COD)';
                  }
                  
                  return (
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Payment Method</label>
                        <div className={styles.viewField}>
                          {method}
                        </div>
                      </div>
                      <div className={styles.formGroup}>
                        <label>Payment Status</label>
                        <div className={styles.viewField} style={{ 
                          color: status === 'Paid' ? '#22c55e' : (status.includes('Pending') ? '#f59e0b' : 'inherit'),
                          fontWeight: '500' 
                        }}>
                          {status}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className={styles.itemsSection}>
                  <div className={styles.itemsSectionHeader}>
                    <span className={styles.itemsSectionTitle}>
                      Order Items
                    </span>
                  </div>
                  <div className={styles.viewItemsList}>
                    {formData.items.map((item, index) => {
                      // Get image URL from multiple sources
                      const imageUrl =
                        item.image ||
                        item.imageUrl ||
                        (item.product_id
                          ? productImages[item.product_id]
                          : null);

                      return (
                        <div key={index} className={styles.viewItemRow}>
                          {/* Left: Image */}
                          <div className={styles.viewItemImageWrapper}>
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={item.name}
                                className={styles.viewItemImage}
                                onClick={() => setSelectedImageUrl(imageUrl)}
                                style={{ cursor: "zoom-in" }}
                                title="Click to enlarge"
                                onError={(e) => {
                                  // Fallback to placeholder if image fails to load
                                  e.currentTarget.style.display = "none";
                                  const placeholder = e.currentTarget
                                    .nextElementSibling as HTMLElement;
                                  if (placeholder)
                                    placeholder.style.display = "flex";
                                }}
                              />
                            ) : null}
                            {!imageUrl && (
                              <div className={styles.viewItemImagePlaceholder}>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="3"
                                    y="3"
                                    width="18"
                                    height="18"
                                    rx="2"
                                    ry="2"
                                  ></rect>
                                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                  <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                              </div>
                            )}
                          </div>

                          {/* Middle: Name + Details */}
                          <div className={styles.viewItemContent}>
                            <div className={styles.viewItemName}>
                              {item.name}
                            </div>
                            <div className={styles.viewItemDetails}>
                              {item.size && (
                                <span className={styles.viewItemTag}>
                                  Size: {item.size}
                                </span>
                              )}
                              {item.color && (
                                <span className={styles.viewItemTag}>
                                  Color: {item.color}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Price/Qty */}
                          <div className={styles.viewItemPriceInfo}>
                            <span className={styles.viewItemQtyBadge}>
                              {item.quantity} Qty
                            </span>
                            {item.price && (
                              <span className={styles.viewItemPrice}>
                                ₹{(item.price * item.quantity).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {formData.notes && (
                  <div className={styles.formGroup}>
                    <label>Notes</label>
                    <div className={styles.viewField}>{formData.notes}</div>
                  </div>
                )}

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => setIsViewMode(false)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className={styles.modalBody}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Customer Name *</label>
                      <input
                        type="text"
                        value={formData.customer_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customer_name: e.target.value,
                          })
                        }
                        placeholder="Enter name"
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        value={formData.customer_phone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            customer_phone: e.target.value,
                          })
                        }
                        placeholder="Enter phone"
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup} style={{ width: "100%" }}>
                    <label>Delivery Address</label>
                    <textarea
                      value={formData.customer_address}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customer_address: e.target.value,
                        })
                      }
                      placeholder="Enter full address"
                      rows={3}
                    />
                  </div>

                  <div className={styles.itemsSection}>
                    <div className={styles.itemsSectionHeader}>
                      <span className={styles.itemsSectionTitle}>
                        Order Items *
                      </span>
                      <button
                        type="button"
                        className={styles.addItemBtn}
                        onClick={handleAddItem}
                      >
                        + Add Item
                      </button>
                    </div>
                    {formData.items.map((item, index) => (
                      <div key={index} className={styles.itemEntryRow}>
                        <div className={styles.itemEntryMain}>
                          <input
                            type="text"
                            placeholder="Item name"
                            value={item.name}
                            onChange={(e) =>
                              handleItemChange(index, "name", e.target.value)
                            }
                            className={styles.itemNameInput}
                          />
                          <input
                            type="number"
                            min="1"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity",
                                parseInt(e.target.value) || 1,
                              )
                            }
                            className={styles.itemQtyInput}
                          />
                          <input
                            type="text"
                            placeholder="Size"
                            value={item.size || ""}
                            onChange={(e) =>
                              handleItemChange(index, "size", e.target.value)
                            }
                            className={styles.itemSizeInput}
                          />
                        </div>
                        <div className={styles.itemEntrySecondary}>
                          <input
                            type="text"
                            placeholder="Color"
                            value={item.color || ""}
                            onChange={(e) =>
                              handleItemChange(index, "color", e.target.value)
                            }
                            className={styles.itemColorInput}
                          />
                          <button
                            type="button"
                            className={styles.removeItemBtn}
                            onClick={() => handleRemoveItem(index)}
                            disabled={formData.items.length === 1}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.formGroup}>
                    <label>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submitting}
                  >
                    {submitting
                      ? "Saving..."
                      : editingOrder
                        ? "Update Order"
                        : "Create Order"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Google Sheets Connection Modal - hidden for Basic plan */}
      {canAccessSheets && showSheetModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowSheetModal(false)}
          role="presentation"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-modal-title"
          >
            <div className={styles.modalHeader}>
              <h3 id="sheet-modal-title" className={styles.modalTitle}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#34A853"
                  strokeWidth="2"
                  style={{ marginRight: "8px" }}
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="2"
                    ry="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line x1="3" y1="9" x2="21" y2="9" strokeLinecap="round" />
                  <line x1="3" y1="15" x2="21" y2="15" strokeLinecap="round" />
                  <line x1="9" y1="3" x2="9" y2="21" strokeLinecap="round" />
                </svg>
                Connect Google Sheet
              </h3>
              <button
                className={styles.modalClose}
                onClick={() => setShowSheetModal(false)}
                aria-label="Close modal"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
                  <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              {/* <p className={styles.sheetDescription}>
                Connect a Google Sheet to automatically sync your orders. New
                orders will be appended as rows to your sheet.
              </p> */}

              {/* Service Account Email - Share Instructions */}
              <div className={styles.shareEmailSection}>
                <label>
                  📧 Share your sheet with this email (Editor access):
                </label>
                <div className={styles.emailCopyBox}>
                  <code className={styles.serviceEmail}>
                    flowauxi@flowauxi.iam.gserviceaccount.com{" "}
                  </code>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => {
                      navigator.clipboard.writeText(
                        "flowauxi@flowauxi.iam.gserviceaccount.com",
                      );
                      alert("Email copied to clipboard!");
                    }}
                    title="Copy email"
                  >
                    📋
                  </button>
                </div>
                <span className={styles.fieldHint}>
                  Open your Google Sheet → Click Share → Paste this email → Give
                  Editor access
                </span>
              </div>

              <div className={styles.formGroup}>
                <label>Google Sheet URL</label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <span className={styles.fieldHint}>
                  Paste the full URL of your Google Sheet after sharing it.
                </span>
              </div>

              <div className={styles.toggleRow}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={sheetSyncEnabled}
                    onChange={(e) => setSheetSyncEnabled(e.target.checked)}
                  />
                  <span className={styles.toggleSwitch}></span>
                  <span>Auto-sync new orders to sheet</span>
                </label>
              </div>

              {sheetConnected && (
                <div className={styles.connectedInfo}>
                  <span className={styles.connectedBadge}>
                    <svg
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
                    Connected
                  </span>
                  <button
                    type="button"
                    className={styles.disconnectBtn}
                    onClick={handleDisconnectSheet}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowSheetModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handleSaveSheetSettings}
                disabled={savingSheet}
              >
                {savingSheet ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal for Zoom */}
      {selectedImageUrl && (
        <ImageModal
          isOpen={!!selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
          imageUrl={selectedImageUrl}
        />
      )}

      {/* Status Change Confirmation Modal */}
      {pendingStatusChange && (
        <div
          className={styles.confirmationOverlay}
          onClick={cancelStatusChange}
          role="presentation"
        >
          <div
            className={styles.confirmationModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-status-title"
          >
            <h3 id="confirm-status-title" className={styles.confirmationTitle}>
              Change Order Status?
            </h3>
            <p className={styles.confirmationText}>
              Change status from{" "}
              <span
                className={`${styles.statusBadge} ${styles[pendingStatusChange.order.status]}`}
              >
                {pendingStatusChange.order.status}
              </span>{" "}
              to{" "}
              <span
                className={`${styles.statusBadge} ${styles[pendingStatusChange.newStatus]}`}
              >
                {pendingStatusChange.newStatus}
              </span>
              ?
            </p>
            <div className={styles.confirmationActions}>
              <button
                type="button"
                className={styles.confirmationNoBtn}
                onClick={cancelStatusChange}
              >
                No, Cancel
              </button>
              <button
                type="button"
                className={styles.confirmationYesBtn}
                onClick={confirmStatusChange}
              >
                Yes, Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {orderToDelete && (
        <div
          className={styles.confirmationOverlay}
          onClick={cancelDeleteOrder}
          role="presentation"
        >
          <div
            className={styles.confirmationModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
          >
            <h3 id="confirm-delete-title" className={styles.confirmationTitle}>
              Delete this order?
            </h3>
            <p className={styles.confirmationText}>
              Are you sure you want to delete order from{" "}
              <strong>{orderToDelete.customer_name}</strong>? This action cannot
              be undone.
            </p>
            <div className={styles.confirmationActions}>
              <button
                type="button"
                className={styles.confirmationNoBtn}
                onClick={cancelDeleteOrder}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.confirmationYesBtn} ${styles.confirmationDeleteBtn}`}
                onClick={confirmDeleteOrder}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
