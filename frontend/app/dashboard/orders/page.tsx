"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./orders.module.css";
import { useRealtimeOrders } from "@/lib/hooks/useRealtimeOrders";

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  notes?: string;
  size?: string;
  color?: string;
  variant_display?: string;
}

interface Order {
  id: string;
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

  // Google Sheets integration state
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetSyncEnabled, setSheetSyncEnabled] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetConnected, setSheetConnected] = useState(false);

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

  // Check if order feature is enabled and load sheet settings
  useEffect(() => {
    const checkCapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        if (!data.success || !data.data?.order_booking_enabled) {
          router.push("/dashboard/bot-settings");
        } else {
          // Load Google Sheet settings
          if (data.data.order_sheet_url) {
            setSheetUrl(data.data.order_sheet_url);
            setSheetConnected(true);
          }
          if (data.data.order_sheet_sync_enabled) {
            setSheetSyncEnabled(data.data.order_sheet_sync_enabled);
          }
        }
      } catch (error) {
        console.error("Error checking capabilities:", error);
      }
    };
    checkCapabilities();
  }, [router]);

  // Real-time order handlers
  const handleRealtimeInsert = useCallback((newOrder: Order) => {
    setOrders((prev) => {
      if (prev.some((order) => order.id === newOrder.id)) {
        return prev;
      }
      return [newOrder, ...prev];
    });
  }, []);

  const handleRealtimeUpdate = useCallback((updatedOrder: Order) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
  }, []);

  const handleRealtimeDelete = useCallback((deleted: { id: string }) => {
    setOrders((prev) => prev.filter((order) => order.id !== deleted.id));
  }, []);

  // Subscribe to realtime updates
  useRealtimeOrders({
    userId,
    onInsert: handleRealtimeInsert,
    onUpdate: handleRealtimeUpdate,
    onDelete: handleRealtimeDelete,
    enabled: !!userId,
  });

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("status", filter);
      }

      const response = await fetch(`/api/orders?${params}`);
      const data = await response.json();

      if (data.success) {
        setOrders(data.data);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Stats
  const stats = {
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    processing: orders.filter((o) => o.status === "processing").length,
    completed: orders.filter((o) => o.status === "completed").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
    total: orders.length,
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true;
    return order.status === filter;
  });

  // Google Sheets handlers
  const handleSaveSheetSettings = async () => {
    setSavingSheet(true);
    try {
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
        setSheetConnected(!!sheetUrl);
        setShowSheetModal(false);
      } else {
        alert("Failed to save Google Sheet settings");
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
  const handleOpenModal = (order?: Order) => {
    if (order) {
      setEditingOrder(order);
      setFormData({
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address || "",
        items:
          order.items.length > 0 ? order.items : [{ name: "", quantity: 1 }],
        notes: order.notes || "",
      });
    } else {
      setEditingOrder(null);
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
    value: string | number
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Filter out empty items
      const validItems = formData.items.filter(
        (item) => item.name.trim() !== "" && item.quantity > 0
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

  const handleStatusChange = async (order: Order, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchOrders();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (!confirm("Are you sure you want to cancel this order?")) return;

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchOrders();
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
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
          {/* Google Sheets Button */}
          <button
            className={`${styles.secondaryBtn} ${
              sheetConnected ? styles.sheetConnected : ""
            }`}
            onClick={() => setShowSheetModal(true)}
            title={
              sheetConnected ? "Google Sheet connected" : "Connect Google Sheet"
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
          <button
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
          </button>
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
          <div className={styles.statIcon}>📦</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.pending}</div>
            <div className={`${styles.statLabel} ${styles.pendingLabel}`}>
              Pending
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>✓</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.confirmed}</div>
            <div className={`${styles.statLabel} ${styles.confirmedLabel}`}>
              Confirmed
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>⚙️</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.processing}</div>
            <div className={`${styles.statLabel} ${styles.processingLabel}`}>
              Processing
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>✅</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.completed}</div>
            <div className={`${styles.statLabel} ${styles.completedLabel}`}>
              Completed
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>📊</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>Total</div>
          </div>
        </div>
      </div>

      {/* Orders Section */}
      <div className={styles.ordersSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>All Orders</h2>
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
          <table className={styles.ordersTable}>
            <thead>
              <tr>
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
                    <div className={styles.customerInfo}>
                      <span className={styles.customerName}>
                        {order.customer_name}
                      </span>
                      <span className={styles.customerPhone}>
                        {order.customer_phone}
                      </span>
                      {order.customer_address && (
                        <span
                          className={styles.customerAddress}
                          title={order.customer_address}
                        >
                          📍{" "}
                          {order.customer_address.length > 30
                            ? order.customer_address.substring(0, 30) + "..."
                            : order.customer_address}
                        </span>
                      )}
                    </div>
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
                      <select
                        className={styles.statusSelect}
                        value={order.status}
                        onChange={(e) =>
                          handleStatusChange(order, e.target.value)
                        }
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className={`${styles.actionBtn} ${styles.danger}`}
                        onClick={() => handleCancelOrder(order)}
                        title="Cancel order"
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
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingOrder ? "Edit Order" : "Create New Order"}
              </h3>
              <button className={styles.modalClose} onClick={handleCloseModal}>
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

                <div className={styles.formRow}>
                  <div className={styles.formGroup} style={{ width: "100%" }}>
                    <label>Delivery Address</label>
                    <input
                      type="text"
                      value={formData.customer_address}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customer_address: e.target.value,
                        })
                      }
                      placeholder="Enter full address"
                    />
                  </div>
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
                              parseInt(e.target.value) || 1
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
          </div>
        </div>
      )}

      {/* Google Sheets Connection Modal */}
      {showSheetModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowSheetModal(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
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
              <p className={styles.sheetDescription}>
                Connect a Google Sheet to automatically sync your orders. New
                orders will be appended as rows to your sheet.
              </p>

              <div className={styles.formGroup}>
                <label>Google Sheet URL</label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <span className={styles.fieldHint}>
                  Paste the full URL of your Google Sheet. Make sure it&apos;s
                  shared with edit access.
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
    </div>
  );
}
