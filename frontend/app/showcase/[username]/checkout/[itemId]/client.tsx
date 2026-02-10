"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./checkout.module.css";
import {
  ArrowLeft,
  CreditCard,
  ShoppingBag,
  MapPin,
  Phone,
  User,
  ShieldCheck,
  Check,
  Package,
  AlertTriangle,
  FileText,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Load Razorpay script dynamically
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface PaymentSettings {
  paymentsEnabled: boolean;
  razorpayKeyId: string | null;
  storeName: string;
  shippingCharges?: string;
  codAvailable?: boolean;
}

interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price?: number;
}

interface CheckoutClientPageProps {
  username: string;
  itemId: string;
}

export default function CheckoutClientPage({
  username,
  itemId,
}: CheckoutClientPageProps) {
  const router = useRouter();
  const [item, setItem] = useState<ShowcaseItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    pincode: "",
    notes: "",
  });

  const [paymentMethod, setPaymentMethod] = useState<"online" | "cod">("cod");
  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [shippingCost, setShippingCost] = useState(0);
  const [wantInvoice, setWantInvoice] = useState(false);
  const [stockError, setStockError] = useState<{
    show: boolean;
    productName: string;
    available: number;
    requested: number;
  } | null>(null);
  const [canonicalSlug, setCanonicalSlug] = useState<string>(""); // ✅ Canonical URL slug

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch showcase data to get the item
        const showcaseRes = await fetch(`/api/showcase/${username}`);
        const showcaseData = await showcaseRes.json();

        if (showcaseData.success) {
          const foundItem = showcaseData.data.items.find(
            (i: any) => i.id === itemId,
          );
          if (foundItem) {
            setItem(foundItem);
            // ✅ Get canonical slug for navigation
            setCanonicalSlug(showcaseData.data.canonicalSlug || username);
          } else {
            const slug = showcaseData.data.canonicalSlug || username;
            router.push(`/showcase/${slug}`);
          }
        }

        // 2. Fetch payment settings
        // username is the user_id (business ID)
        const settingsRes = await fetch(
          `/api/store/${username}/payment-settings`,
        );
        const settingsData = await settingsRes.json();

        if (settingsData.success) {
          setPaymentSettings(settingsData);

          // Default to Online if enabled and preferred, else COD
          // But user wants same as store, usually store defaults to online if enabled
          if (settingsData.paymentsEnabled && settingsData.razorpayKeyId) {
            setPaymentMethod("online");
          } else {
            setPaymentMethod("cod");
          }

          if (settingsData.shippingCharges) {
            const parsed = parseFloat(settingsData.shippingCharges);
            if (!isNaN(parsed)) setShippingCost(parsed);
          }
        }
      } catch (error) {
        console.error("Error fetching checkout data:", error);
      } finally {
        setLoadingData(false);
      }
    }

    if (username && itemId) {
      fetchData();
    }
  }, [username, itemId, router]);

  const subtotal = item?.price || 0;
  const finalTotal = subtotal + shippingCost;

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/\D/g, "");
    setFormData((prev) => ({ ...prev, phone: numericValue }));
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Validate stock availability BEFORE placing order
  const validateStock = async (): Promise<{
    valid: boolean;
    error?: string;
  }> => {
    try {
      console.log(
        "[Stock Check] Starting stock validation for item:",
        item?.id,
        item?.title,
      );

      const response = await fetch(`/api/store/${username}/validate-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: username,
          items: [
            {
              product_id: item?.id,
              name: item?.title,
              quantity: 1,
            },
          ],
        }),
      });

      const result = await response.json();
      console.log("[Stock Check] API Response:", result);

      // Check if result.valid is explicitly false OR if insufficient_items exist
      if (
        result.valid === false ||
        (result.insufficient_items && result.insufficient_items.length > 0)
      ) {
        const insufficientItems = result.insufficient_items || [];
        console.log(
          "[Stock Check] FAILED - Insufficient items:",
          insufficientItems,
        );

        if (insufficientItems.length > 0) {
          const stockItem = insufficientItems[0];
          const errorMsg = `Only ${stockItem.available} units of ${stockItem.name} available. You requested 1.`;
          console.log("[Stock Check] Error message:", errorMsg);
          return {
            valid: false,
            error: errorMsg,
          };
        }
        return { valid: false, error: result.message || "Item out of stock" };
      }

      console.log("[Stock Check] PASSED - Stock is available");
      return { valid: true };
    } catch (error) {
      console.error("[Stock Check] Error:", error);
      // Allow order on network error - backend will validate
      return { valid: true };
    }
  };

  const createBackendOrder = async (
    paymentId?: string,
    source: string = "manual",
  ): Promise<{
    success: boolean;
    orderId?: string;
    error?: string;
    stockError?: boolean;
    data?: any;
  }> => {
    try {
      const fullAddress = `${formData.address}${formData.city ? `, ${formData.city}` : ""}${formData.pincode ? ` - ${formData.pincode}` : ""}`;
      const fullPhoneNumber = `+91${formData.phone}`;

      const orderData = {
        user_id: username,
        customer_name: formData.name,
        customer_phone: fullPhoneNumber,
        customer_address: fullAddress,
        customer_email: formData.email || null,
        want_invoice: wantInvoice,
        items: [
          {
            name: item?.title,
            quantity: 1,
            price: item?.price,
            imageUrl: item?.imageUrl,
            product_id: item?.id,
          },
        ],
        source: source,
        notes: `${formData.notes || ""}${
          paymentId ? `\n\nPayment ID: ${paymentId}` : ""
        }${wantInvoice ? "\n\n📄 Invoice Requested" : ""}`,
      };

      const response = await fetch(`/api/store/${username}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      // Check for stock validation error (HTTP 422)
      if (response.status === 422 && result.insufficient_items) {
        console.error("Stock validation failed:", result.error);
        return { success: false, error: result.error, stockError: true };
      }

      if (!result.success && !result.data?.id) {
        return {
          success: false,
          error: result.error || "Failed to create order",
        };
      }

      return { success: true, orderId: result.data?.id, data: result.data };
    } catch (error) {
      console.error("Error creating order:", error);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const handleCODOrder = async () => {
    if (!formData.name || !formData.phone || !formData.address) {
      alert("Please fill in Name, Phone, and Address");
      return;
    }

    setLoading(true);
    try {
      // 1. Validate stock BEFORE placing order
      const stockCheck = await validateStock();
      if (!stockCheck.valid) {
        const errorMatch = stockCheck.error?.match(
          /Only (\d+) units of (.+?) available/,
        );
        if (errorMatch) {
          setStockError({
            show: true,
            available: parseInt(errorMatch[1]),
            productName: errorMatch[2],
            requested: 1,
          });
        } else {
          alert(stockCheck.error || "Item is out of stock.");
        }
        setLoading(false);
        return;
      }

      // 2. Create order
      const result = await createBackendOrder("COD", "checkout_cod");

      // Handle stock error from backend (double protection)
      if (result.stockError) {
        const errorMatch = result.error?.match(
          /Only (\d+) units of (.+?) available/,
        );
        if (errorMatch) {
          setStockError({
            show: true,
            available: parseInt(errorMatch[1]),
            productName: errorMatch[2],
            requested: 1,
          });
        }
        setLoading(false);
        return;
      }

      if (result.success || result.orderId) {
        setShowSuccess(true);
        setTimeout(() => {
          router.push(`/showcase/${canonicalSlug || username}`);
        }, 3500);
      } else {
        alert(result.error || "Failed to place order.");
      }
    } catch (error) {
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleOnlinePayment = async () => {
    if (!formData.name || !formData.phone || !formData.address) {
      alert("Please fill in Name, Phone, and Address");
      return;
    }

    if (!paymentSettings?.razorpayKeyId) {
      alert("Online payments are not configured.");
      return;
    }

    // Validate amount is greater than 0
    if (!finalTotal || finalTotal <= 0) {
      alert("Invalid order amount. Please try again.");
      console.error(
        "[Checkout] Invalid finalTotal:",
        finalTotal,
        "item.price:",
        item?.price,
      );
      return;
    }

    setLoading(true);
    try {
      // 1. Validate stock BEFORE processing payment (enterprise-grade protection)
      console.log("[Online Payment] Checking stock before payment...");
      const stockCheck = await validateStock();
      console.log("[Online Payment] Stock check result:", stockCheck);

      if (!stockCheck.valid) {
        console.log("[Online Payment] BLOCKING - Stock validation failed!");
        const errorMatch = stockCheck.error?.match(
          /Only (\d+) units of (.+?) available/,
        );
        if (errorMatch) {
          console.log("[Online Payment] Showing stock error modal");
          setStockError({
            show: true,
            available: parseInt(errorMatch[1]),
            productName: errorMatch[2],
            requested: 1,
          });
        } else {
          console.log("[Online Payment] Showing alert:", stockCheck.error);
          alert(stockCheck.error || "Item is out of stock.");
        }
        setLoading(false);
        return; // CRITICAL: Stop here, don't proceed to Razorpay
      }

      console.log(
        "[Online Payment] Stock check passed, proceeding to Razorpay...",
      );

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        alert("Failed to load payment gateway.");
        setLoading(false);
        return;
      }

      const options = {
        key: paymentSettings.razorpayKeyId,
        amount: Math.round(finalTotal * 100), // Ensure integer for Razorpay
        currency: "INR",
        name: paymentSettings.storeName,
        description: `Order for ${item?.title}`,
        prefill: {
          name: formData.name,
          email: formData.email || undefined,
          contact: formData.phone, // Match Store checkout - no country code prefix
        },
        notes: {
          address: `${formData.address}, ${formData.city} - ${formData.pincode}`,
          want_invoice: wantInvoice ? "Yes" : "No",
        },
        theme: { color: "#22c55e" },
        handler: async function (response: any) {
          const paymentId = response.razorpay_payment_id;
          const orderResult = await createBackendOrder(paymentId, "api");

          // Handle rare stock issue after payment
          if (orderResult.stockError) {
            alert(
              `⚠️ Payment received (ID: ${paymentId}), but ${orderResult.error}\n\nPlease contact the store for help.`,
            );
            setLoading(false);
            return;
          }

          if (orderResult.success || orderResult.orderId) {
            setShowSuccess(true);
            setTimeout(() => {
              router.push(`/showcase/${canonicalSlug || username}`);
            }, 3500);
          } else {
            alert(
              `Payment received (ID: ${paymentId}), but order creation failed. Contact store.`,
            );
          }
          setLoading(false);
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      console.log("[Checkout] Opening Razorpay with options:", {
        key: options.key ? "***" : "MISSING",
        amount: options.amount,
        currency: options.currency,
        name: options.name,
      });

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        console.error("[Checkout] Payment failed:", resp.error);
        alert(`Payment failed: ${resp.error.description}`);
        setLoading(false);
      });
      rzp.open();
    } catch (error) {
      console.error("[Checkout] Razorpay error:", error);
      setLoading(false);
      alert("Something went wrong. Please try again.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === "online") {
      handleOnlinePayment();
    } else {
      handleCODOrder();
    }
  };

  if (loadingData) {
    return (
      <div className={styles.checkoutContainer}>
        <div
          className={styles.checkoutContent}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "60vh",
          }}
        >
          <p>Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className={styles.checkoutContainer}>
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            className={styles.successOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={styles.successCard}
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
            >
              <div className={styles.successIconWrapper}>
                <Check size={40} strokeWidth={3} />
              </div>
              <h2 className={styles.successTitle}>Order Placed!</h2>
              <p className={styles.successText}>
                Your order for <strong>{item.title}</strong> has been
                successfully placed. <br />
                Redirecting you...
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* Stock Error Modal */}
        {stockError?.show && (
          <motion.div
            className={styles.successOverlay}
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStockError(null)}
          >
            <motion.div
              className={styles.successCard}
              style={{ borderColor: "#ef4444" }}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={styles.successIconWrapper}
                style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}
              >
                <AlertTriangle size={36} strokeWidth={2.5} />
              </div>
              <h2 className={styles.successTitle} style={{ color: "#dc2626" }}>
                Limited Stock Available
              </h2>
              <p className={styles.successText}>
                Sorry, we only have <strong>{stockError.available}</strong>{" "}
                units of <strong>{stockError.productName}</strong> available.
              </p>
              <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                <button
                  onClick={() => setStockError(null)}
                  className={styles.payButton}
                  style={{ backgroundColor: "#6b7280", flex: 1 }}
                >
                  <ArrowLeft size={18} />
                  Go Back
                </button>
                <button
                  onClick={() => {
                    setStockError(null);
                    router.push(`/showcase/${canonicalSlug || username}`);
                  }}
                  className={styles.payButton}
                  style={{ flex: 1 }}
                >
                  Browse Other Items
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.checkoutHeader}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={20} />
        </button>
        <div className={styles.storeName}>Checkout</div>
      </div>

      <div className={styles.checkoutContent}>
        {/* Left: Summary */}
        <div className={styles.summaryColumn}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              <ShoppingBag size={20} className={styles.cardIcon} /> Order
              Summary
            </h2>
            <div className={styles.summaryItem}>
              <img
                src={item.imageUrl}
                alt={item.title}
                className={styles.itemImage}
              />
              <div className={styles.itemInfo}>
                <div className={styles.itemName}>{item.title}</div>
                <div className={styles.itemPrice}>
                  {formatPrice(item.price || 0)}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  router.push(`/showcase/${canonicalSlug || username}`)
                }
                style={{
                  background: "none",
                  border: "none",
                  padding: "8px",
                  cursor: "pointer",
                  color: "#ef4444",
                  borderRadius: "8px",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#fee2e2")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                title="Remove item"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className={styles.summaryTotal}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Shipping</span>
                <span>
                  {shippingCost === 0 ? "FREE" : formatPrice(shippingCost)}
                </span>
              </div>
              <div className={styles.grandTotal}>
                <div className={styles.totalRow}>
                  <span>Total Amount</span>
                  <span>{formatPrice(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              <ShieldCheck size={20} className={styles.cardIcon} /> Secure
              Checkout
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#414040ff",
                lineHeight: "1.5",
                fontWeight: "500",
              }}
            >
              Your data is safe with us. We use industry-standard encryption to
              protect your personal information.
            </p>
          </div>
        </div>

        {/* Right: Form & Payment */}
        <div className={styles.formColumn}>
          <form onSubmit={handleSubmit}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <User size={20} className={styles.cardIcon} /> Contact Info
              </h2>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Full Name *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    className={styles.input}
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Phone Number *</label>
                  <div className={styles.phoneInputGroup}>
                    <span className={styles.countryCode}>+91</span>
                    <input
                      type="tel"
                      required
                      className={styles.phoneInput}
                      placeholder="98765 43210"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>

              {/* Invoice Checkbox */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "16px",
                  cursor: "pointer",
                }}
                onClick={() => setWantInvoice(!wantInvoice)}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "4px",
                    border: wantInvoice ? "none" : "2px solid #d1d5db",
                    backgroundColor: wantInvoice ? "#22c55e" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                  }}
                >
                  {wantInvoice && (
                    <Check size={12} color="#fff" strokeWidth={3} />
                  )}
                </div>
                <span
                  style={{
                    fontSize: "14px",
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  I want invoice
                </span>
              </div>

              {/* Email Field - Shows when invoice is requested */}
              {wantInvoice && (
                <div style={{ marginTop: "12px" }}>
                  <label className={styles.label}>
                    Email Address (for invoice) *
                  </label>
                  <input
                    type="email"
                    name="email"
                    required={wantInvoice}
                    className={styles.input}
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <MapPin size={20} className={styles.cardIcon} /> Shipping
                Address
              </h2>
              <div className={styles.formGrid}>
                <div className={styles.formGroupFull}>
                  <label className={styles.label}>Complete Address *</label>
                  <textarea
                    name="address"
                    required
                    className={`${styles.input} ${styles.textarea}`}
                    placeholder="House No, Street, Locality"
                    value={formData.address}
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>City *</label>
                  <input
                    type="text"
                    name="city"
                    required
                    className={styles.input}
                    placeholder="Mumbai"
                    value={formData.city}
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Pincode *</label>
                  <input
                    type="text"
                    name="pincode"
                    required
                    className={styles.input}
                    placeholder="400001"
                    value={formData.pincode}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <CreditCard size={20} className={styles.cardIcon} /> Payment
                Method
              </h2>

              {paymentSettings?.paymentsEnabled && (
                <div
                  className={`${styles.paymentOption} ${
                    paymentMethod === "online" ? styles.selected : ""
                  }`}
                  onClick={() => setPaymentMethod("online")}
                >
                  <div className={styles.radio} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Pay Online</div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--showcase-text-muted)",
                      }}
                    >
                      UPI, Cards, Netbanking
                    </div>
                  </div>
                </div>
              )}

              {paymentSettings?.codAvailable !== false && (
                <div
                  className={`${styles.paymentOption} ${
                    paymentMethod === "cod" ? styles.selected : ""
                  }`}
                  onClick={() => setPaymentMethod("cod")}
                >
                  <div className={styles.radio} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Cash on Delivery</div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--showcase-text-muted)",
                      }}
                    >
                      Pay when you receive the order
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={styles.payButton}
              >
                {loading
                  ? "Processing..."
                  : paymentMethod === "online"
                    ? `Pay ${formatPrice(finalTotal)}`
                    : "Place Order"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
