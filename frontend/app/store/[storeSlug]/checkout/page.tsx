"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./checkout.module.css";
import { useCart } from "../context/CartContext";
import {
  ArrowLeft,
  CreditCard,
  ShoppingBag,
  MapPin,
  Phone,
  User,
  ShieldCheck,
  Trash2,
  Check,
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
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  const {
    cartItems,
    cartTotal,
    clearCart,
    isHydrated,
    removeFromCart,
    updateItemOptions,
  } = useCart();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    pincode: "",
    notes: "",
  });

  const [paymentMethod, setPaymentMethod] = useState<"online" | "whatsapp">(
    "online",
  );
  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Fetch payment settings
  useEffect(() => {
    if (storeSlug) {
      fetch(`/api/store/${storeSlug}/payment-settings`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setPaymentSettings(data);
            // Default to WhatsApp if payments are disabled
            if (!data.paymentsEnabled) {
              setPaymentMethod("whatsapp");
            }
          }
        })
        .finally(() => setLoadingSettings(false));
    }
  }, [storeSlug]);

  // Redirect to store if cart is empty AND hydrated AND not showing success
  useEffect(() => {
    if (isHydrated && cartItems.length === 0 && !showSuccess) {
      router.push(`/store/${storeSlug}`);
    }
  }, [cartItems, isHydrated, router, storeSlug, showSuccess]);

  // Lock body scroll when success overlay is shown
  useEffect(() => {
    if (showSuccess) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showSuccess]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const createBackendOrder = async (
    paymentId?: string,
    source: "manual" | "api" = "manual",
  ) => {
    try {
      const orderData = {
        user_id: storeSlug, // storeSlug is the business/user ID
        customer_name: formData.name,
        customer_phone: formData.phone,
        items: cartItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          imageUrl: item.imageUrl,
          notes: `${item.options?.size ? `Size: ${item.options.size}` : ""}${
            item.options?.color ? `, Color: ${item.options.color}` : ""
          }`,
        })),
        source: source,
        notes: `${formData.notes || ""}${
          paymentId ? `\n\nPayment ID: ${paymentId}` : ""
        }\nAddress: ${formData.address}, ${formData.city} - ${formData.pincode}`,
      };

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": storeSlug,
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();
      if (!result.success) {
        console.error("Failed to create order:", result.error);
        // We continue even if API fails, to ensure user experience (WhatsApp opens)
        // But ideally we should show an error or retry logic
      }
      return result.data?.id;
    } catch (error) {
      console.error("Error creating order:", error);
      return null;
    }
  };

  const handleWhatsAppOrder = async () => {
    // Validate form
    if (!formData.name || !formData.phone || !formData.address) {
      alert("Please fill in all required fields (Name, Phone, Address)");
      return;
    }

    setLoading(true);

    // 1. Create Order in Backend
    const orderId = await createBackendOrder(undefined, "manual");

    const orderLines = cartItems.map(
      (item) =>
        `• ${item.name}${item.options?.size ? ` (${item.options.size})` : ""}${
          item.options?.color ? ` - ${item.options.color}` : ""
        } x${item.quantity} = ${formatPrice(item.price * item.quantity)}`,
    );

    const customerDetails = `
👤 *Customer Details:*
Name: ${formData.name}
Phone: ${formData.phone}
Address: ${formData.address}, ${formData.city} - ${formData.pincode}
${formData.notes ? `Notes: ${formData.notes}` : ""}
`;

    // Add Order ID to message if available
    const orderRef = orderId ? `\n🆔 *Order ID:* #${orderId.slice(0, 8)}` : "";

    const message = `🛒 *New Order Request*${orderRef}\n${customerDetails}\n📦 *Order Items:*\n${orderLines.join(
      "\n",
    )}\n\n*Total Order Value: ${formatPrice(cartTotal)}*\n\nPlease confirm my order!`;

    const encodedMessage = encodeURIComponent(message);

    // Open WhatsApp
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");

    // Show success animation
    setShowSuccess(true);
    setLoading(false);
    clearCart();

    // Redirect after delay
    setTimeout(() => {
      router.push(`/store/${storeSlug}`);
    }, 3500);
  };

  const handleOnlinePayment = async () => {
    // Validate form
    if (!formData.name || !formData.phone || !formData.address) {
      alert("Please fill in all required fields");
      return;
    }

    if (!paymentSettings?.razorpayKeyId) {
      alert("Online payments are not configured correctly.");
      return;
    }

    setLoading(true);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        alert("Failed to load payment gateway. Please try again.");
        setLoading(false);
        return;
      }

      const options = {
        key: paymentSettings.razorpayKeyId,
        amount: cartTotal * 100,
        currency: "INR",
        name: paymentSettings.storeName,
        description: "Order Payment",
        prefill: {
          name: formData.name,
          email: formData.email,
          contact: formData.phone,
        },
        notes: {
          address: `${formData.address}, ${formData.city} - ${formData.pincode}`,
          items: JSON.stringify(
            cartItems.map((i) => ({ id: i.id, q: i.quantity })),
          ),
        },
        theme: {
          color: "#22c15a",
        },
        handler: async function (response: any) {
          // Payment Successful
          const paymentId = response.razorpay_payment_id;

          // Create Order in Backend with API source
          await createBackendOrder(paymentId, "api");

          // Show success animation
          setShowSuccess(true);
          setLoading(false);
          clearCart();

          // Redirect after delay
          setTimeout(() => {
            router.push(`/store/${storeSlug}`);
          }, 3500);
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.on("payment.failed", function (response: any) {
        alert(`Payment failed: ${response.error.description}`);
        setLoading(false);
      });
      razorpay.open();
    } catch (error) {
      console.error(error);
      setLoading(false);
      alert("Something went wrong");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === "online") {
      handleOnlinePayment();
    } else {
      handleWhatsAppOrder();
    }
  };

  if (cartItems.length === 0 && !showSuccess) return null;

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
              transition={{ type: "spring", damping: 15 }}
            >
              <div className={styles.successIconWrapper}>
                <Check size={40} strokeWidth={3} />
              </div>
              <h2 className={styles.successTitle}>Order Placed!</h2>
              <p className={styles.successText}>
                Your order has been successfully placed. <br />
                Redirecting you to the store...
              </p>
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
        {/* Left Column: Summary (Previously Right) */}
        <div className={styles.summaryColumn}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>
              <ShoppingBag size={20} className={styles.cardIcon} /> Order
              Summary
            </h2>

            <div className={styles.cartItems}>
              {cartItems.map((item) => (
                <div key={item.id} className={styles.summaryItem}>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className={styles.itemImage}
                    />
                  )}
                  <div className={styles.itemInfo}>
                    <div className={styles.itemName}>{item.name}</div>

                    {/* Size/Color Selection for Quick Added Items */}
                    {item.addedFromDashboard &&
                    (item.availableSizes?.length ||
                      item.availableColors?.length) ? (
                      <div className={styles.itemOptionsDropdowns}>
                        {item.availableSizes &&
                          item.availableSizes.length > 0 && (
                            <div className={styles.optionSelector}>
                              <label>Size:</label>
                              <select
                                value={item.options?.size || ""}
                                onChange={(e) =>
                                  updateItemOptions(item.id, {
                                    size: e.target.value,
                                  })
                                }
                                className={styles.optionSelect}
                              >
                                {item.availableSizes.map((size) => (
                                  <option key={size} value={size}>
                                    {size}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        {item.availableColors &&
                          item.availableColors.length > 0 && (
                            <div className={styles.optionSelector}>
                              <label>Color:</label>
                              <select
                                value={item.options?.color || ""}
                                onChange={(e) =>
                                  updateItemOptions(item.id, {
                                    color: e.target.value,
                                  })
                                }
                                className={styles.optionSelect}
                              >
                                {item.availableColors.map((color) => (
                                  <option key={color} value={color}>
                                    {color}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                      </div>
                    ) : (
                      /* Static Options for specific variants */
                      <div className={styles.itemVariant}>
                        {item.options?.size && (
                          <span>Size: {item.options.size} </span>
                        )}
                        {item.options?.color && (
                          <span>• {item.options.color}</span>
                        )}
                      </div>
                    )}

                    <div className={styles.itemMeta}>
                      <span>Qty: {item.quantity}</span>
                      <span>{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className={styles.removeButton}
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.summaryTotal}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Shipping</span>
                <span style={{ color: "#22c15a" }}>Free</span>
              </div>
              <div className={styles.grandTotal}>
                <div
                  className={styles.totalRow}
                  style={{ marginBottom: 0, color: "inherit" }}
                >
                  <span>Total</span>
                  <span>{formatPrice(cartTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Form (Previously Left) */}
        <div className={styles.detailsColumn}>
          <form onSubmit={handleSubmit}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <User size={20} className={styles.cardIcon} /> Contact Info
              </h2>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Full Name *</label>
                  <input
                    name="name"
                    required
                    className={styles.input}
                    placeholder="John Doe"
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Phone Number *</label>
                  <input
                    name="phone"
                    required
                    type="tel"
                    className={styles.input}
                    placeholder="+91 98765 43210"
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroupFull}>
                  <label className={styles.label}>Email (Optional)</label>
                  <input
                    name="email"
                    type="email"
                    className={styles.input}
                    placeholder="john@example.com"
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <MapPin size={20} className={styles.cardIcon} /> Delivery
                Address
              </h2>
              <div className={styles.formGrid}>
                <div className={styles.formGroupFull}>
                  <label className={styles.label}>Street Address *</label>
                  <textarea
                    name="address"
                    required
                    className={`${styles.input} ${styles.textarea}`}
                    placeholder="House No, Street, Area"
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>City *</label>
                  <input
                    name="city"
                    required
                    className={styles.input}
                    placeholder="City"
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Pincode *</label>
                  <input
                    name="pincode"
                    required
                    className={styles.input}
                    placeholder="123456"
                    onChange={handleInputChange}
                  />
                </div>
                <div className={styles.formGroupFull}>
                  <label className={styles.label}>Order Notes (Optional)</label>
                  <input
                    name="notes"
                    className={styles.input}
                    placeholder="Special instructions for delivery"
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
                  className={`${styles.paymentOption} ${paymentMethod === "online" ? styles.selected : ""}`}
                  onClick={() => setPaymentMethod("online")}
                >
                  <div className={styles.radio} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Pay Online (Razorpay)</div>
                    <div style={{ fontSize: "13px", color: "gray" }}>
                      UPI, Cards, NetBanking
                    </div>
                  </div>
                </div>
              )}

              {/* <div
                className={`${styles.paymentOption} ${paymentMethod === "whatsapp" ? styles.selected : ""}`}
                onClick={() => setPaymentMethod("whatsapp")}
              >
                <div className={styles.radio} />
                <div>
                  <div style={{ fontWeight: 600 }}>Order via WhatsApp</div>
                  <div style={{ fontSize: "13px", color: "gray" }}>
                    Pay directly to seller
                  </div>
                </div>
              </div> */}
            </div>

            <button
              type="submit"
              className={`${styles.payButton} ${paymentMethod === "whatsapp" ? styles.whatsappButton : ""}`}
              disabled={loading}
            >
              {loading
                ? "Processing..."
                : paymentMethod === "online"
                  ? `Pay ${formatPrice(cartTotal)}`
                  : `Place Order on WhatsApp`}
            </button>

            <div
              style={{
                textAlign: "center",
                marginTop: "16px",
                fontSize: "12px",
                color: "gray",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <ShieldCheck size={14} /> Secure Checkout
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
