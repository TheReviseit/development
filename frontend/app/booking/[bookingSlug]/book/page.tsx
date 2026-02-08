"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "../booking.module.css";
import formStyles from "./book.module.css";
import { setBookingPhase } from "@/app/utils/bookingSync";

// ============================================================
// Types
// ============================================================
interface BookFormPageProps {
  params: Promise<{ bookingSlug: string }>;
}

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
  imageUrl?: string;
  paymentMode?: "online" | "cash" | "both";
}

interface BookingFormData {
  name: string;
  phone: string;
  email: string;
}

// Step images
const STEP_IMAGES = [
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
  "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800",
];

// ============================================================
// Main Component
// ============================================================
export default function BookFormPage({ params }: BookFormPageProps) {
  const resolvedParams = React.use(params);
  const { bookingSlug } = resolvedParams;
  const router = useRouter();

  // State for booking selection from localStorage
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState<string | null>(null);
  const [timeStr, setTimeStr] = useState<string | null>(null);

  // Timer for slot reservation
  const [reservationTime, setReservationTime] = useState(5 * 60); // 5 minutes

  // State
  const [service, setService] = useState<Service | null>(null);
  const [businessName, setBusinessName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bookingResult, setBookingResult] = useState<any>(null);

  const [formData, setFormData] = useState<BookingFormData>({
    name: "",
    phone: "",
    email: "",
  });

  // Countdown timer
  useEffect(() => {
    if (reservationTime <= 0) return;
    const timer = setInterval(() => {
      setReservationTime((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Optionally redirect when time expires
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [reservationTime]);

  // Set booking phase to FILLING_FORM to block realtime updates
  useEffect(() => {
    setBookingPhase("FILLING_FORM");
    return () => {
      // Reset when leaving page
      setBookingPhase("BROWSING");
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Load selection from localStorage
  useEffect(() => {
    const storedSelection = localStorage.getItem(`booking_${bookingSlug}`);
    if (storedSelection) {
      try {
        const selection = JSON.parse(storedSelection);
        const thirtyMinutes = 30 * 60 * 1000;
        if (Date.now() - selection.createdAt > thirtyMinutes) {
          localStorage.removeItem(`booking_${bookingSlug}`);
          router.push(`/booking/${bookingSlug}`);
          return;
        }
        setServiceId(selection.serviceId);
        setDateStr(selection.date);
        setTimeStr(selection.time);
        if (selection.serviceName) {
          setService({
            id: selection.serviceId,
            name: selection.serviceName,
            duration: selection.duration || selection.serviceDuration || 60,
            price: selection.price || selection.servicePrice || 0,
            imageUrl: selection.imageUrl,
            paymentMode: "cash",
          });
        }
      } catch (err) {
        console.error("[BookFormPage] Invalid stored selection:", err);
        router.push(`/booking/${bookingSlug}`);
      }
    } else {
      router.push(`/booking/${bookingSlug}`);
    }
  }, [bookingSlug, router]);

  // Fetch service details
  useEffect(() => {
    const fetchService = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/booking/${bookingSlug}`);
        const data = await response.json();

        if (data.success) {
          setBusinessName(data.data.businessName || "");
          if (serviceId && data.data.services) {
            const foundService = data.data.services.find(
              (s: any) => s.id === serviceId,
            );
            if (foundService) {
              setService({
                id: foundService.id,
                name: foundService.name,
                duration: foundService.duration,
                price: foundService.price,
                imageUrl: foundService.imageUrl,
                paymentMode: foundService.paymentMode || "cash",
              });
            }
          }
        }
      } catch (err) {
        console.error("[BookFormPage] Error fetching service:", err);
      } finally {
        setLoading(false);
      }
    };

    if (serviceId) {
      fetchService();
    }
  }, [bookingSlug, serviceId]);

  // Load Razorpay SDK
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (document.getElementById("razorpay-script")) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Handle Razorpay payment
  const initiatePayment = async (bookingId: string, amount: number) => {
    // Set phase to PROCESSING_PAYMENT to block ALL realtime updates
    setBookingPhase("PROCESSING_PAYMENT");

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      throw new Error("Payment gateway failed to load");
    }

    const orderResponse = await fetch(`/api/booking/${bookingSlug}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: bookingId, amount }),
    });

    const orderResult = await orderResponse.json();
    if (!orderResult.success) {
      throw new Error(orderResult.error || "Failed to create payment order");
    }

    return new Promise<void>((resolve, reject) => {
      const options = {
        key: orderResult.key_id,
        amount: orderResult.order.amount,
        currency: orderResult.order.currency,
        name: businessName,
        description: `Booking: ${service?.name || "Appointment"}`,
        order_id: orderResult.order.id,
        prefill: orderResult.prefill,
        handler: async (response: any) => {
          try {
            const verifyResponse = await fetch(
              `/api/booking/${bookingSlug}/payment`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  booking_id: bookingId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              },
            );
            const verifyResult = await verifyResponse.json();
            if (verifyResult.success) {
              resolve();
            } else {
              reject(new Error("Payment verification failed"));
            }
          } catch (err) {
            reject(err);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Payment cancelled")),
        },
        theme: { color: "#ec4899" },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    });
  };

  // Handle form submission
  const handleSubmit = async (
    e: React.FormEvent,
    paymentMethod?: "online" | "cash",
  ) => {
    e.preventDefault();
    if (!service || !dateStr || !timeStr) return;

    setSubmitting(true);
    setError(null);

    try {
      // Build starts_at as ISO datetime from date and time
      const startsAt = `${dateStr.split("T")[0]}T${timeStr}:00`;

      const response = await fetch(`/api/booking/${bookingSlug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: service.id,
          starts_at: startsAt,
          customer: {
            name: formData.name,
            phone: formData.phone,
            email: formData.email || undefined,
          },
          payment_method: paymentMethod || "cash",
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Booking failed");
      }

      // Get booking id (UUID) for payment API - NOT the human-readable booking_id
      const bookingId = result.booking?.id || result.booking?.booking_id;

      if (paymentMethod === "online" && service.price > 0 && bookingId) {
        await initiatePayment(bookingId, service.price);
      }

      localStorage.removeItem(`booking_${bookingSlug}`);
      setBookingResult(result);
      setSuccess(true);
    } catch (err: any) {
      console.error("[BookFormPage] Booking error:", err);
      setError(err.message || "Failed to complete booking");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Parse date for display
  const displayDate = dateStr
    ? new Date(dateStr).toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  // Loading state
  if (loading) {
    return (
      <div className={styles.splitContainer}>
        <div className={styles.leftPanel}>
          <div className={styles.imageContainer}>
            <div className={styles.loadingImage} />
          </div>
        </div>
        <div className={styles.rightPanel}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success && bookingResult) {
    // Determine if this was an online payment (webhook confirms) or cash (immediate)
    const isOnlinePayment =
      service?.paymentMode === "online" ||
      (service?.paymentMode === "both" &&
        bookingResult.payment?.mode === "online");

    return (
      <div className={styles.splitContainer}>
        <div className={styles.leftPanel}>
          <div className={styles.imageContainer}>
            <Image
              src={STEP_IMAGES[0]}
              alt="Booking success"
              fill
              className={styles.stepImage}
              priority
            />
          </div>
        </div>
        <div className={styles.rightPanel}>
          <div className={styles.contentWrapper}>
            <div className={formStyles.successContainer}>
              <div className={formStyles.successIcon}>✓</div>
              {isOnlinePayment ? (
                <>
                  <h1 className={formStyles.successTitle}>Payment Received!</h1>
                  <p className={formStyles.successSubtitle}>
                    Your booking is being confirmed. You'll receive a
                    confirmation shortly.
                  </p>
                </>
              ) : (
                <>
                  <h1 className={formStyles.successTitle}>
                    Booking Confirmed!
                  </h1>
                  <p className={formStyles.successSubtitle}>
                    Your appointment has been scheduled
                  </p>
                </>
              )}

              <div className={formStyles.bookingDetails}>
                <div className={formStyles.detailRow}>
                  <span className={formStyles.detailLabel}>Booking ID</span>
                  <span className={formStyles.detailValue}>
                    {bookingResult.booking?.booking_id ||
                      bookingResult.booking?.id}
                  </span>
                </div>
                <div className={formStyles.detailRow}>
                  <span className={formStyles.detailLabel}>Service</span>
                  <span className={formStyles.detailValue}>
                    {service?.name}
                  </span>
                </div>
                <div className={formStyles.detailRow}>
                  <span className={formStyles.detailLabel}>Date & Time</span>
                  <span className={formStyles.detailValue}>
                    {displayDate} at {timeStr}
                  </span>
                </div>
                {isOnlinePayment && (
                  <div className={formStyles.detailRow}>
                    <span className={formStyles.detailLabel}>Status</span>
                    <span
                      className={formStyles.detailValue}
                      style={{ color: "#f59e0b" }}
                    >
                      ⏳ Confirming...
                    </span>
                  </div>
                )}
              </div>

              <a
                href={`/booking/${bookingSlug}`}
                className={formStyles.backButton}
              >
                Book Another Appointment
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.splitContainer}>
      {/* Left Panel - Booking Summary (No background image) */}
      <div className={formStyles.summaryPanel}>
        <div className={formStyles.summaryCard}>
          {/* Service Image & Name */}
          <div className={formStyles.summaryHeader}>
            {service?.imageUrl && (
              <div className={formStyles.summaryServiceImage}>
                <Image
                  src={service.imageUrl}
                  alt={service.name}
                  fill
                  className={styles.serviceImg}
                />
              </div>
            )}
            <div className={formStyles.summaryServiceInfo}>
              <h3 className={formStyles.summaryServiceName}>{service?.name}</h3>
              <p className={formStyles.summaryServiceDesc}>
                {service?.duration} minutes session
              </p>
            </div>
          </div>

          {/* Booking Details */}
          <div className={formStyles.summaryDetails}>
            <div className={formStyles.summaryRow}>
              <span className={formStyles.summaryLabel}>When</span>
              <span className={formStyles.summaryValue}>
                {timeStr}, {displayDate}
              </span>
            </div>
            <div className={formStyles.summaryRow}>
              <span className={formStyles.summaryLabel}>Duration</span>
              <span className={formStyles.summaryValue}>
                {service?.duration} minutes
              </span>
            </div>
          </div>

          {/* Price */}
          <div className={formStyles.summaryDivider} />
          <div className={formStyles.summaryPriceSection}>
            <div className={formStyles.summaryRow}>
              <span className={formStyles.summaryLabel}>Subtotal</span>
              <span className={formStyles.summaryValue}>
                ₹{service?.price?.toLocaleString()}
              </span>
            </div>
            <div className={formStyles.summaryRow}>
              <span className={formStyles.summaryLabel}>Tax</span>
              <span className={formStyles.summaryValue}>0%</span>
            </div>
            <div className={formStyles.summaryTotalRow}>
              <span className={formStyles.summaryTotalLabel}>Total</span>
              <span className={formStyles.summaryTotalValue}>
                ₹{service?.price?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className={styles.rightPanel}>
        <div className={formStyles.formWrapper}>
          {/* Timer Banner */}
          <div className={formStyles.timerBanner}>
            Your slot will be reserved for{" "}
            <span className={formStyles.timerValue}>
              {formatTime(reservationTime)}
            </span>{" "}
            minutes
          </div>

          {/* Header */}
          <div className={formStyles.formHeader}>
            <button
              className={styles.backBtn}
              onClick={() => router.push(`/booking/${bookingSlug}`)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className={formStyles.formTitle}>Your info</h2>
            <button
              className={formStyles.confirmBtn}
              onClick={(e) =>
                handleSubmit(
                  e,
                  service?.paymentMode === "online" ? "online" : "cash",
                )
              }
              disabled={submitting || !formData.name || !formData.phone}
            >
              {submitting ? "..." : "Confirm"}
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => handleSubmit(e)}
            className={formStyles.bookingForm}
          >
            {/* Name Fields */}
            <div className={formStyles.nameRow}>
              <div className={formStyles.formGroup}>
                <label className={formStyles.label}>
                  Full Name<span className={formStyles.required}>*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Your full name"
                  className={formStyles.input}
                />
              </div>
            </div>

            {/* Email */}
            <div className={formStyles.formGroup}>
              <label className={formStyles.label}>
                Email<span className={formStyles.optional}> (optional)</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your@email.com"
                className={formStyles.input}
              />
            </div>

            {/* Phone Number */}
            <div className={formStyles.formGroup}>
              <label className={formStyles.label}>
                Phone Number<span className={formStyles.required}>*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="+91 98765 43210"
                className={formStyles.input}
              />
            </div>

            {error && <div className={formStyles.errorMessage}>{error}</div>}

            {/* Payment Buttons */}
            <div className={formStyles.paymentSection}>
              {service?.paymentMode === "both" ? (
                <div className={formStyles.paymentButtons}>
                  <button
                    type="button"
                    disabled={submitting || !formData.name || !formData.phone}
                    className={formStyles.payOnlineBtn}
                    onClick={(e) => handleSubmit(e, "online")}
                  >
                    {submitting
                      ? "Processing..."
                      : `Pay Online - ₹${service?.price?.toLocaleString()}`}
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !formData.name || !formData.phone}
                    className={formStyles.payLaterBtn}
                    onClick={(e) => handleSubmit(e, "cash")}
                  >
                    {submitting ? "Booking..." : "Pay at Venue"}
                  </button>
                </div>
              ) : service?.paymentMode === "online" ? (
                <button
                  type="button"
                  disabled={submitting || !formData.name || !formData.phone}
                  className={formStyles.payOnlineBtn}
                  onClick={(e) => handleSubmit(e, "online")}
                >
                  {submitting
                    ? "Processing..."
                    : `Pay Now - ₹${service?.price?.toLocaleString()}`}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting || !formData.name || !formData.phone}
                  className={formStyles.confirmBookingBtn}
                >
                  {submitting ? "Booking..." : "Confirm Booking"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
