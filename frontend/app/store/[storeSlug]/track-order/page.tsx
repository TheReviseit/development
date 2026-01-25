"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./track-order.module.css";
import ImageModal from "@/app/dashboard/components/ImageModal";
import {
  Search,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Phone,
  Calendar,
  ArrowLeft,
  Loader2,
  User,
  MapPin,
  CreditCard,
  FileText,
} from "lucide-react";

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  imageUrl?: string;
  notes?: string;
}

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  total_quantity: number;
  status: "pending" | "confirmed" | "processing" | "completed" | "cancelled";
  source: "ai" | "manual";
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export default function TrackOrderPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;

  const [phoneNumber, setPhoneNumber] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Parse order notes to extract address and payment ID
  const parseOrderDetails = (notes?: string) => {
    const details = {
      address: "",
      paymentId: "",
      otherNotes: "",
    };

    if (!notes) return details;

    // Extract Payment ID
    const paymentIdMatch = notes.match(/Payment ID:\s*([^\n]+)/i);
    if (paymentIdMatch) {
      details.paymentId = paymentIdMatch[1].trim();
    }

    // Extract Address
    const addressMatch = notes.match(/Address:\s*([^\n]+)/i);
    if (addressMatch) {
      details.address = addressMatch[1].trim();
    }

    // Extract other notes (anything that's not payment ID or address)
    let otherNotes = notes;
    if (paymentIdMatch) {
      otherNotes = otherNotes.replace(/Payment ID:\s*[^\n]+/i, "").trim();
    }
    if (addressMatch) {
      otherNotes = otherNotes.replace(/Address:\s*[^\n]+/i, "").trim();
    }
    // Clean up extra newlines and whitespace
    otherNotes = otherNotes.replace(/\n+/g, " ").trim();
    if (otherNotes) {
      details.otherNotes = otherNotes;
    }

    return details;
  };

  const getStatusConfig = (status: Order["status"]) => {
    switch (status) {
      case "pending":
        return {
          label: "Pending",
          icon: Clock,
          color: "#f59e0b",
          bgColor: "#fef3c7",
        };
      case "confirmed":
        return {
          label: "Confirmed",
          icon: CheckCircle2,
          color: "#3b82f6",
          bgColor: "#dbeafe",
        };
      case "processing":
        return {
          label: "Processing",
          icon: Truck,
          color: "#8b5cf6",
          bgColor: "#ede9fe",
        };
      case "completed":
        return {
          label: "Completed",
          icon: CheckCircle2,
          color: "#22c15a",
          bgColor: "#dcfce7",
        };
      case "cancelled":
        return {
          label: "Cancelled",
          icon: XCircle,
          color: "#ef4444",
          bgColor: "#fee2e2",
        };
      default:
        return {
          label: status,
          icon: Clock,
          color: "#6b7280",
          bgColor: "#f3f4f6",
        };
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setError("Please enter a phone number");
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await fetch(
        `/api/orders/track?phone=${encodeURIComponent(phoneNumber)}&storeSlug=${storeSlug}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch orders");
      }

      if (data.success) {
        setOrders(data.data || []);
        if (data.data.length === 0) {
          setError("No orders found for this phone number");
        }
      } else {
        throw new Error(data.error || "Failed to fetch orders");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred. Please try again.",
      );
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = (items: OrderItem[]) => {
    return items.reduce((sum, item) => {
      return sum + (item.price || 0) * item.quantity;
    }, 0);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <button
            className={styles.backButton}
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className={styles.title}>Track Your Order</h1>
          <p className={styles.subtitle}>
            Enter your phone number to view all your orders
          </p>
        </div>

        {/* Search Form */}
        <motion.form
          className={styles.searchForm}
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className={styles.inputWrapper}>
            <Phone className={styles.inputIcon} size={20} />
            <input
              type="tel"
              className={styles.input}
              placeholder="Enter your phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className={styles.searchButton}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className={styles.loaderIcon} size={20} />
                Searching...
              </>
            ) : (
              <>
                <Search size={20} />
                Track Order
              </>
            )}
          </button>
        </motion.form>

        {/* Error Message */}
        <AnimatePresence>
          {error && hasSearched && (
            <motion.div
              className={styles.errorMessage}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <XCircle size={20} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Orders List */}
        <AnimatePresence>
          {orders.length > 0 && (
            <motion.div
              className={styles.ordersList}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h2 className={styles.ordersTitle}>
                Your Orders ({orders.length})
              </h2>

              {orders.map((order, index) => {
                const statusConfig = getStatusConfig(order.status);
                const StatusIcon = statusConfig.icon;
                const total = calculateTotal(order.items);
                const orderDetails = parseOrderDetails(order.notes);

                return (
                  <motion.div
                    key={order.id}
                    className={styles.orderCard}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {/* Order Header */}
                    <div className={styles.orderHeader}>
                      <div className={styles.orderInfo}>
                        <div className={styles.orderId}>
                          <Package size={18} />
                          <span>
                            Order #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                        <div className={styles.orderDate}>
                          <Calendar size={14} />
                          <span>{formatDate(order.created_at)}</span>
                        </div>
                      </div>
                      <div
                        className={styles.statusBadge}
                        style={{
                          backgroundColor: statusConfig.bgColor,
                          color: statusConfig.color,
                        }}
                      >
                        <StatusIcon size={16} />
                        <span>{statusConfig.label}</span>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className={styles.orderItems}>
                      {order.items.map((item, itemIndex) => (
                        <div key={itemIndex} className={styles.orderItem}>
                          {/* Product Image */}
                          <div className={styles.itemImageWrapper}>
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className={styles.itemImage}
                                loading="lazy"
                                onClick={() =>
                                  setSelectedImageUrl(item.imageUrl!)
                                }
                                style={{ cursor: "zoom-in" }}
                                title="Click to enlarge"
                              />
                            ) : (
                              <div className={styles.itemImagePlaceholder}>
                                <Package size={24} />
                              </div>
                            )}
                          </div>

                          {/* Item Info */}
                          <div className={styles.itemContent}>
                            <div className={styles.itemInfo}>
                              <span className={styles.itemName}>
                                {item.name}
                              </span>
                              {item.notes && (
                                <span className={styles.itemNotes}>
                                  {item.notes}
                                </span>
                              )}
                            </div>
                            <div className={styles.itemDetails}>
                              <span className={styles.itemQuantity}>
                                Qty: {item.quantity}
                              </span>
                              {item.price && (
                                <span className={styles.itemPrice}>
                                  {formatPrice(item.price * item.quantity)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Order Footer */}
                    <div className={styles.orderFooter}>
                      <div className={styles.orderTotal}>
                        <span className={styles.totalAmount}>
                          {formatPrice(total)}
                        </span>
                      </div>

                      {/* Customer Details */}
                      <div className={styles.customerDetails}>
                        <div className={styles.detailRow}>
                          <User size={16} className={styles.detailIcon} />
                          <span className={styles.detailLabel}>Name:</span>
                          <span className={styles.detailValue}>
                            {order.customer_name}
                          </span>
                        </div>
                        <div className={styles.detailRow}>
                          <Phone size={16} className={styles.detailIcon} />
                          <span className={styles.detailLabel}>Phone:</span>
                          <span className={styles.detailValue}>
                            {order.customer_phone}
                          </span>
                        </div>
                        {orderDetails.address && (
                          <div className={styles.detailRow}>
                            <MapPin size={16} className={styles.detailIcon} />
                            <span className={styles.detailLabel}>Address:</span>
                            <span className={styles.detailValue}>
                              {orderDetails.address}
                            </span>
                          </div>
                        )}
                        {orderDetails.paymentId && (
                          <div className={styles.detailRow}>
                            <CreditCard
                              size={16}
                              className={styles.detailIcon}
                            />
                            <span className={styles.detailLabel}>
                              Payment ID:
                            </span>
                            <span className={styles.detailValue}>
                              {orderDetails.paymentId}
                            </span>
                          </div>
                        )}
                        {orderDetails.otherNotes && (
                          <div className={styles.detailRow}>
                            <FileText size={16} className={styles.detailIcon} />
                            <span className={styles.detailLabel}>Notes:</span>
                            <span className={styles.detailValue}>
                              {orderDetails.otherNotes}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        <AnimatePresence>
          {hasSearched && orders.length === 0 && !loading && !error && (
            <motion.div
              className={styles.emptyState}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Package size={64} className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>No Orders Found</h3>
              <p className={styles.emptyText}>
                We couldn't find any orders for this phone number. Please check
                the number and try again.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Modal for Zoom */}
        {selectedImageUrl && (
          <ImageModal
            isOpen={!!selectedImageUrl}
            onClose={() => setSelectedImageUrl(null)}
            imageUrl={selectedImageUrl}
          />
        )}
      </div>
    </div>
  );
}
