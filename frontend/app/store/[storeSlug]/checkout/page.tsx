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
  shippingCharges?: string;
  codAvailable?: boolean;
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

  const [paymentMethod, setPaymentMethod] = useState<
    "online" | "whatsapp" | "cod"
  >("online");
  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [shippingCost, setShippingCost] = useState(0);
  const [wantInvoice, setWantInvoice] = useState(false);

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

            // Parse shipping charges
            if (data.shippingCharges) {
              const parsedShipping = parseFloat(data.shippingCharges);
              if (!isNaN(parsedShipping)) {
                setShippingCost(parsedShipping);
              } else {
                setShippingCost(0);
              }
            } else {
              setShippingCost(0);
            }
          }
        })
        .finally(() => setLoadingSettings(false));
    }
  }, [storeSlug]);

  const finalTotal = cartTotal + shippingCost;

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
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle phone input change - allow numbers only
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    // Remove non-digit characters
    const numericValue = value.replace(/\D/g, "");

    // Limit to 10 digits if needed (optional, keeping it flexible for now or strictly 10)
    // Common Indian mobile number length is 10. Let's not strictly limit to 10 to allow for typos/corrections easily, but we can max length in input.

    setFormData((prev) => ({
      ...prev,
      phone: numericValue,
    }));
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
    source: "manual" | "api" | "cod" = "manual",
  ) => {
    try {
      const fullAddress = `${formData.address}, ${formData.city} - ${formData.pincode}`;

      // Prepend +91 to phone number
      const fullPhoneNumber = `+91${formData.phone}`;

      const orderData = {
        user_id: storeSlug, // storeSlug is the business/user ID
        customer_name: formData.name,
        customer_phone: fullPhoneNumber,
        customer_address: fullAddress,
        customer_email: formData.email || null,
        items: cartItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          imageUrl: item.imageUrl,
          size: item.options?.size || null,
          color: item.options?.color || null,
          notes: `${item.options?.size ? `Size: ${item.options.size}` : ""}${
            item.options?.color ? `, Color: ${item.options.color}` : ""
          }`,
        })),
        source: source,
        notes: `${formData.notes || ""}${
          paymentId ? `\n\nPayment ID: ${paymentId}` : ""
        }`,
      };

      const response = await fetch(`/api/store/${storeSlug}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

    try {
      // 1. Create order in backend first (for tracking)
      const orderId = await createBackendOrder(undefined, "manual");

      // 2. Construct WhatsApp message
      const orderNum = orderId ? `#${orderId.slice(0, 8).toUpperCase()}` : "";
      const header = `*New Order ${orderNum}*`;
      const customerDetails = `\n👤 *Customer:* ${formData.name}\n📞 *Phone:* +91${formData.phone}\n📍 *Address:* ${formData.address}, ${formData.city} - ${formData.pincode}`;

      const itemsList = cartItems
        .map(
          (item) =>
            `- ${item.name} x ${item.quantity} (${formatPrice(
              item.price * item.quantity,
            )}) ${item.options?.size ? `[${item.options.size}]` : ""} ${
              item.options?.color ? `[${item.options.color}]` : ""
            }`,
        )
        .join("\n");

      const totals = `\n💰 *Subtotal:* ${formatPrice(cartTotal)}\n🚚 *Shipping:* ${
        shippingCost === 0 ? "Free" : formatPrice(shippingCost)
      }\n💵 *Total:* ${formatPrice(finalTotal)}`;

      const footer = `\n------------------\nOrdered via Store`;

      const message = encodeURIComponent(
        `${header}\n${customerDetails}\n\n🛒 *Items:*\n${itemsList}\n\n${totals}${footer}`,
      );

      // Default phone number if not set in settings
      const storePhone = "919000000000"; // Replace with actual default or from settings

      // Clear cart
      clearCart();
      setShowSuccess(true);

      // Redirect to WhatsApp
      window.open(`https://wa.me/${storePhone}?text=${message}`, "_blank");
    } catch (error) {
      console.error("Error processing WhatsApp order:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCODOrder = async () => {
    // Validate form
    if (!formData.name || !formData.phone || !formData.address) {
      alert("Please fill in all required fields (Name, Phone, Address)");
      return;
    }

    setLoading(true);

    // 1. Create Order in Backend with source 'cod'
    // We pass "COD" as paymentId just to mark it clearer in notes if needed, or rely on source
    // But duplicate "COD" in notes might be redundant if source is 'cod'.
    // Let's rely on source='cod' in backend.
    await createBackendOrder("COD", "cod");

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
        amount: finalTotal * 100,
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
    } else if (paymentMethod === "cod") {
      handleCODOrder();
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
              {cartItems.map((item) => {
                // Helper function to get available sizes for a specific color
                const getAvailableSizesForColor = (
                  selectedColor: string,
                ): string[] => {
                  if (!item.pricingInfo) return item.availableSizes || [];

                  // Check if this is a base product color
                  const isBaseColor =
                    item.pricingInfo.baseProductColors?.includes(selectedColor);

                  if (isBaseColor) {
                    // For base product colors, use base product sizes
                    if (
                      item.pricingInfo.baseProductSizes &&
                      item.pricingInfo.baseProductSizes.length > 0
                    ) {
                      return item.pricingInfo.baseProductSizes;
                    }
                    return item.availableSizes || [];
                  }

                  // For variant colors, extract sizes from variantSizePrices
                  if (item.pricingInfo.variantSizePrices) {
                    const sizesForColor = new Set<string>();
                    Object.keys(item.pricingInfo.variantSizePrices).forEach(
                      (key) => {
                        const parts = key.split("_");
                        if (parts.length >= 2) {
                          const color = parts[0];
                          const size = parts.slice(1).join("_");
                          if (color === selectedColor && size) {
                            sizesForColor.add(size);
                          }
                        }
                      },
                    );

                    if (sizesForColor.size > 0) {
                      return Array.from(sizesForColor);
                    }
                  }

                  return item.availableSizes || [];
                };

                const currentColor = item.options?.color || "";
                const availableSizesForColor =
                  getAvailableSizesForColor(currentColor);

                // Handle color change - update color and reset size
                const handleColorChange = (newColor: string) => {
                  const newAvailableSizes = getAvailableSizesForColor(newColor);
                  const firstSize =
                    newAvailableSizes[0] || item.options?.size || "";

                  updateItemOptions(item.id, {
                    color: newColor,
                    size: firstSize,
                  });
                };

                return (
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

                      {/* Size/Color Selection for Quick Added Items - only show dropdowns if multiple options */}
                      {item.addedFromDashboard &&
                      ((item.availableColors &&
                        item.availableColors.length > 1) ||
                        availableSizesForColor.length > 1) ? (
                        <div className={styles.itemOptionsDropdowns}>
                          {/* Color dropdown - only show if more than 1 color */}
                          {item.availableColors &&
                            item.availableColors.length > 1 && (
                              <div className={styles.optionSelector}>
                                <label htmlFor={`checkout-color-${item.id}`}>
                                  Color:
                                </label>
                                <select
                                  id={`checkout-color-${item.id}`}
                                  value={item.options?.color || ""}
                                  onChange={(e) =>
                                    handleColorChange(e.target.value)
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
                          {/* Size dropdown - only show if more than 1 size for current color */}
                          {availableSizesForColor.length > 1 && (
                            <div className={styles.optionSelector}>
                              <label htmlFor={`checkout-size-${item.id}`}>
                                Size:
                              </label>
                              <select
                                id={`checkout-size-${item.id}`}
                                value={item.options?.size || ""}
                                onChange={(e) =>
                                  updateItemOptions(item.id, {
                                    size: e.target.value,
                                  })
                                }
                                className={styles.optionSelect}
                              >
                                {availableSizesForColor.map((size) => (
                                  <option key={size} value={size}>
                                    {size}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Static Options for specific variants or single option items */
                        (item.options?.color || item.options?.size) && (
                          <div className={styles.itemVariant}>
                            {item.options?.color && (
                              <span>Color: {item.options.color} </span>
                            )}
                            {item.options?.size && (
                              <span>• Size: {item.options.size}</span>
                            )}
                          </div>
                        )
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
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className={styles.summaryTotal}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Shipping</span>
                <span
                  style={{ color: shippingCost > 0 ? "inherit" : "#22c15a" }}
                >
                  {shippingCost > 0 ? formatPrice(shippingCost) : "Free"}
                </span>
              </div>
              <div className={styles.grandTotal}>
                <div
                  className={styles.totalRow}
                  style={{ marginBottom: 0, color: "inherit" }}
                >
                  <span>Total</span>
                  <span>{formatPrice(finalTotal)}</span>
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
                  <div className={styles.phoneInputGroup}>
                    <div className={styles.countryCode}>+91</div>
                    <input
                      name="phone"
                      required
                      type="tel"
                      className={styles.phoneInput}
                      placeholder="98765 43210"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className={styles.formGroupFull}>
                  <div
                    onClick={() => {
                      setWantInvoice(!wantInvoice);
                      if (wantInvoice) {
                        setFormData((prev) => ({ ...prev, email: "" }));
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "16px",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "6px",
                        border: wantInvoice
                          ? "2px solid #22c15a"
                          : "2px solid #d1d5db",
                        backgroundColor: wantInvoice
                          ? "#22c15a"
                          : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                        flexShrink: 0,
                      }}
                    >
                      {wantInvoice && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{
                            animation: "checkmarkAppear 0.2s ease",
                          }}
                        >
                          <path
                            d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <label
                      style={{
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: "15px",
                        margin: 0,
                        color: "#1f2937",
                      }}
                    >
                      I want invoice
                    </label>
                  </div>
                  {wantInvoice && (
                    <div
                      style={{
                        animation: "slideDown 0.3s ease",
                        overflow: "hidden",
                      }}
                    >
                      <label className={styles.label}>Email *</label>
                      <input
                        name="email"
                        type="email"
                        required
                        className={styles.input}
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={handleInputChange}
                      />
                    </div>
                  )}
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
                    <div style={{ fontWeight: 600 }}>Pay Online</div>
                    <div style={{ fontSize: "13px", color: "gray" }}>
                      UPI, Cards, NetBanking
                    </div>
                  </div>
                </div>
              )}

              {paymentSettings?.codAvailable && (
                <div
                  className={`${styles.paymentOption} ${paymentMethod === "cod" ? styles.selected : ""}`}
                  onClick={() => setPaymentMethod("cod")}
                >
                  <div className={styles.radio} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Cash on Delivery</div>
                    <div style={{ fontSize: "13px", color: "gray" }}>
                      Pay when you receive
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
                  ? `Pay ${formatPrice(finalTotal)}`
                  : paymentMethod === "cod"
                    ? `Place Order (COD)`
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
