"use client";

import React, { useState, useEffect, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./booking.module.css";
import { loadRazorpayScript } from "@/lib/api/razorpay";

/**
 * Product Booking Page - Enterprise Level
 * Route: /showcase/[username]/view/[itemId]/booking
 *
 * Dynamic Steps based on settings:
 * - Full Day Mode: Shows full month calendar, skips time selection
 * - Advance Payment: Adds Razorpay payment step
 */

interface PageProps {
  params: Promise<{
    username: string;
    itemId: string;
  }>;
}

interface ShowcaseItem {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  category?: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface BookingSettings {
  fullDayMode: boolean;
  requireAdvance: boolean;
  advancePercentage: number;
  oneBookingPerDay: boolean;
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function ProductBookingPage({ params }: PageProps) {
  const { username, itemId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ShowcaseItem | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>();

  // Booking settings from admin
  const [settings, setSettings] = useState<BookingSettings>({
    fullDayMode: false,
    requireAdvance: false,
    advancePercentage: 10,
    oneBookingPerDay: false,
  });

  // Booked dates (for one booking per day feature)
  const [bookedDates, setBookedDates] = useState<string[]>([]);

  // Booking flow state
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showAllSlots, setShowAllSlots] = useState(false);

  // Month navigation for full calendar view
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Week navigation for regular mode
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  // Form state
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // Dynamic steps based on settings
  const STEPS = useMemo(() => {
    const steps = [];

    if (settings.fullDayMode) {
      steps.push({ id: 1, label: "Select Date", key: "date" });
    } else {
      steps.push({ id: 1, label: "Select Date & Time", key: "datetime" });
    }

    steps.push({ id: 2, label: "Personal Details", key: "details" });

    if (settings.requireAdvance) {
      steps.push({ id: 3, label: "Payment", key: "payment" });
      steps.push({ id: 4, label: "Confirmation", key: "confirmation" });
    } else {
      steps.push({ id: 3, label: "Confirmation", key: "confirmation" });
    }

    return steps;
  }, [settings.fullDayMode, settings.requireAdvance]);

  // Get step key for current step
  const getCurrentStepKey = () => {
    const step = STEPS.find((s) => s.id === currentStep);
    return step?.key || "datetime";
  };

  // Calculate advance amount
  const advanceAmount = useMemo(() => {
    if (!settings.requireAdvance || !product?.price) return 0;
    return Math.round(product.price * (settings.advancePercentage / 100));
  }, [settings.requireAdvance, settings.advancePercentage, product?.price]);

  // Fetch product, business data, and settings
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // Fetch showcase data
        const response = await fetch(`/api/showcase/${username}`);
        if (!response.ok) throw new Error("Failed to load showcase");

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        setBusinessName(result.data.businessName);
        setLogoUrl(result.data.logoUrl);

        const item = result.data.items?.find(
          (i: ShowcaseItem) => i.id === itemId,
        );
        if (!item) throw new Error("Product not found");
        setProduct(item);

        // Fetch booking settings
        try {
          const settingsRes = await fetch(
            `/api/showcase/${username}/booking-settings`,
          );
          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data) {
              const newSettings = {
                fullDayMode: settingsData.data.full_day_mode || false,
                requireAdvance: settingsData.data.require_advance || false,
                advancePercentage: settingsData.data.advance_percentage || 10,
                oneBookingPerDay:
                  settingsData.data.one_booking_per_day || false,
              };
              setSettings(newSettings);

              // If one booking per day is enabled, fetch booked dates
              if (newSettings.oneBookingPerDay) {
                try {
                  const bookedRes = await fetch(
                    `/api/showcase/${username}/booked-dates`,
                  );
                  if (bookedRes.ok) {
                    const bookedData = await bookedRes.json();
                    if (bookedData.success) {
                      setBookedDates(bookedData.dates || []);
                    }
                  }
                } catch (err) {
                  console.log("Failed to fetch booked dates");
                }
              }
            }
          }
        } catch (settingsErr) {
          console.log("Using default settings");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [username, itemId]);

  // Format date helper
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Get days in month for full calendar
  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  // Navigate month
  const navigateMonth = (direction: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);

    // Don't allow navigating to past months
    const today = new Date();
    if (
      newMonth.getFullYear() < today.getFullYear() ||
      (newMonth.getFullYear() === today.getFullYear() &&
        newMonth.getMonth() < today.getMonth())
    ) {
      return;
    }

    setCurrentMonth(newMonth);
  };

  // Get week days starting from weekStart
  const getWeekDays = () => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return formatDateLocal(date) === formatDateLocal(today);
  };

  // Check if date is tomorrow
  const isTomorrow = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateLocal(date) === formatDateLocal(tomorrow);
  };

  // Check if date is in the past
  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Check if date is already booked (for one booking per day feature)
  const isDateBooked = (date: Date) => {
    if (!settings.oneBookingPerDay) return false;
    const dateStr = formatDateLocal(date);
    return bookedDates.includes(dateStr);
  };

  // Check if date is unavailable (either past or booked)
  const isDateUnavailable = (date: Date) => {
    return isPastDate(date) || isDateBooked(date);
  };

  // Navigate week
  const navigateWeek = (direction: number) => {
    const newStart = new Date(weekStart);
    newStart.setDate(weekStart.getDate() + direction * 7);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newStart >= today || direction > 0) {
      setWeekStart(newStart);
    }
  };

  // Fetch available time slots
  const fetchTimeSlots = async (date: Date) => {
    if (settings.fullDayMode) return;

    setLoadingSlots(true);
    try {
      const dateStr = formatDateLocal(date);
      const response = await fetch(
        `/api/appointments/availability?userId=${username}&date=${dateStr}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAvailableSlots(data.slots || []);
          return;
        }
      }

      // Generate default time slots
      const defaultSlots: TimeSlot[] = [];
      for (let hour = 7; hour <= 18; hour++) {
        defaultSlots.push({
          time: `${hour.toString().padStart(2, "0")}:00`,
          available: true,
        });
        if (hour < 18) {
          defaultSlots.push({
            time: `${hour.toString().padStart(2, "0")}:15`,
            available: true,
          });
          defaultSlots.push({
            time: `${hour.toString().padStart(2, "0")}:30`,
            available: true,
          });
          defaultSlots.push({
            time: `${hour.toString().padStart(2, "0")}:45`,
            available: true,
          });
        }
      }
      setAvailableSlots(defaultSlots);
    } catch (err) {
      console.error("Error fetching slots:", err);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    if (isDateUnavailable(date)) return;
    setSelectedDate(date);
    setSelectedTime(null);
    setShowAllSlots(false);
    if (!settings.fullDayMode) {
      fetchTimeSlots(date);
    }
  };

  // Handle time selection
  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  // Format time for display
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Check if can proceed to next step
  const canProceed = () => {
    const stepKey = getCurrentStepKey();

    if (stepKey === "date" || stepKey === "datetime") {
      if (!selectedDate) return false;
      if (!settings.fullDayMode && !selectedTime) return false;
      return true;
    }

    if (stepKey === "details") {
      return formData.customerName && formData.customerPhone;
    }

    if (stepKey === "payment") {
      return true;
    }

    return true;
  };

  // Handle Razorpay payment
  const handleRazorpayPayment = async () => {
    if (!product || !advanceAmount) return;

    setPaymentProcessing(true);

    try {
      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Failed to load payment gateway");
      }

      // Create order on backend
      const orderRes = await fetch("/api/booking/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: advanceAmount * 100, // Razorpay expects paise
          currency: "INR",
          receipt: `booking_${Date.now()}`,
          user_id: username, // Business owner ID for Razorpay credentials
          notes: {
            product_name: product.title,
            customer_name: formData.customerName,
            customer_phone: formData.customerPhone,
          },
        }),
      });

      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error(orderData.error || "Failed to create payment order");
      }

      // Open Razorpay checkout
      const razorpayOptions = {
        key: orderData.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: advanceAmount * 100,
        currency: "INR",
        name: businessName,
        description: `Advance for ${product.title}`,
        order_id: orderData.order_id,
        prefill: {
          name: formData.customerName,
          email: formData.customerEmail || "",
          contact: formData.customerPhone,
        },
        theme: {
          color: "#22c15a",
        },
        handler: async (response: any) => {
          // Payment successful, create booking
          await handleSubmit(
            response.razorpay_payment_id,
            response.razorpay_order_id,
          );
        },
        modal: {
          ondismiss: () => {
            setPaymentProcessing(false);
          },
        },
      };

      const razorpay = new (window as any).Razorpay(razorpayOptions);
      razorpay.on("payment.failed", (response: any) => {
        setError(response.error.description || "Payment failed");
        setPaymentProcessing(false);
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setPaymentProcessing(false);
    }
  };

  // Handle step navigation
  const handleNext = () => {
    const stepKey = getCurrentStepKey();
    const maxStep = STEPS.length;

    if (stepKey === "details" && !settings.requireAdvance) {
      handleSubmit();
      return;
    }

    if (stepKey === "payment") {
      handleRazorpayPayment();
      return;
    }

    if (currentStep < maxStep) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle form submission
  const handleSubmit = async (
    razorpayPaymentId?: string,
    razorpayOrderId?: string,
  ) => {
    if (!selectedDate || !product) return;

    setSubmitting(true);
    try {
      const timeToSend = settings.fullDayMode ? "09:00" : selectedTime;

      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: formData.customerName,
          customer_phone: formData.customerPhone,
          customer_email: formData.customerEmail,
          date: formatDateLocal(selectedDate),
          time: timeToSend,
          duration: settings.fullDayMode ? 480 : 60,
          service: product.title,
          notes: formData.notes,
          source: "manual",
          user_id: username,
          advance_paid: settings.requireAdvance ? advanceAmount : 0,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setBookingSuccess(true);
        setPaymentProcessing(false);
        const confirmationStep = STEPS.find((s) => s.key === "confirmation");
        if (confirmationStep) {
          setCurrentStep(confirmationStep.id);
        }
      } else {
        throw new Error(data.error || "Failed to book appointment");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
      setPaymentProcessing(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Get displayed slots
  const displayedSlots = showAllSlots
    ? availableSlots
    : availableSlots.slice(0, 14);
  const remainingSlots = availableSlots.length - 14;

  // Get day label
  const getDayLabel = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return DAYS_SHORT[date.getDay()];
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading booking...</p>
      </div>
    );
  }

  if (error && !bookingSuccess) {
    return (
      <div className={styles.errorContainer}>
        <h2>Unable to load booking</h2>
        <p>{error}</p>
        <Link
          href={`/showcase/${username}/view/${itemId}`}
          className={styles.backLink}
        >
          ← Back to Product
        </Link>
      </div>
    );
  }

  const stepKey = getCurrentStepKey();

  return (
    <div className={styles.bookingPage}>
      {/* Left Sidebar - Steps */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          {logoUrl ? (
            <img src={logoUrl} alt={businessName} className={styles.logo} />
          ) : (
            <div className={styles.logoPlaceholder}>
              <span>{businessName.charAt(0)}</span>
            </div>
          )}
          <h2 className={styles.businessName}>{businessName}</h2>
        </div>

        <nav className={styles.stepsNav}>
          {STEPS.map((step, index) => {
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            const isLast = index === STEPS.length - 1;

            return (
              <div key={step.id} className={styles.stepItem}>
                <div className={styles.stepIndicatorWrapper}>
                  <div
                    className={`${styles.stepCircle} ${isCompleted ? styles.completed : ""} ${isActive ? styles.active : ""}`}
                  >
                    {isCompleted ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <polyline
                          points="20 6 9 17 4 12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={`${styles.stepLine} ${isCompleted ? styles.completedLine : ""}`}
                    />
                  )}
                </div>
                <span
                  className={`${styles.stepLabel} ${isActive ? styles.activeLabel : ""} ${isCompleted ? styles.completedLabel : ""}`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.helpButton}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path
                d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
            </svg>
            Need help with booking?
          </button>
        </div>
      </aside>

      {/* Right Content */}
      <main className={styles.mainContent}>
        {/* Step: Date Selection - Full Calendar for Full Day Mode */}
        {(stepKey === "date" || stepKey === "datetime") && (
          <div className={styles.dateTimeSection}>
            <h1 className={styles.pageTitle}>
              {settings.fullDayMode ? "Select Date" : "Select Date and Time"}
            </h1>

            {/* {settings.fullDayMode && (
              <div className={styles.fullDayBadge}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline
                    points="12 6 12 12 16 14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Full Day Session
              </div>
            )} */}

            {/* Full Day Mode: Month Calendar View */}
            {settings.fullDayMode ? (
              <div className={styles.fullCalendarWrapper}>
                <div className={styles.calendarHeader}>
                  <button
                    onClick={() => navigateMonth(-1)}
                    className={styles.calendarNavBtn}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline
                        points="15 18 9 12 15 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <span className={styles.calendarMonthLabel}>
                    {MONTHS[currentMonth.getMonth()]}{" "}
                    {currentMonth.getFullYear()}
                  </span>
                  <button
                    onClick={() => navigateMonth(1)}
                    className={styles.calendarNavBtn}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline
                        points="9 18 15 12 9 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className={styles.calendarGrid}>
                  {/* Day Headers */}
                  {DAYS_SHORT.map((day) => (
                    <div key={day} className={styles.calendarDayHeader}>
                      {day}
                    </div>
                  ))}

                  {/* Calendar Days */}
                  {getDaysInMonth().map(({ date, isCurrentMonth }, idx) => {
                    const isPast = isPastDate(date);
                    const isBooked = isDateBooked(date);
                    const isUnavailable = isPast || isBooked;
                    const isSelected =
                      selectedDate &&
                      formatDateLocal(date) === formatDateLocal(selectedDate);
                    const isTodayDate = isToday(date);

                    return (
                      <button
                        key={idx}
                        className={`${styles.calendarDay} 
                          ${!isCurrentMonth ? styles.otherMonth : ""} 
                          ${isPast ? styles.pastDay : ""}
                          ${isBooked ? styles.bookedDay : ""}
                          ${isSelected ? styles.selectedCalendarDay : ""}
                          ${isTodayDate ? styles.todayCalendarDay : ""}`}
                        onClick={() =>
                          isCurrentMonth &&
                          !isUnavailable &&
                          handleDateSelect(date)
                        }
                        disabled={!isCurrentMonth || isUnavailable}
                      >
                        <span className={styles.calendarDayNumber}>
                          {date.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* {selectedDate && (
                  <div className={styles.selectedDateDisplay}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>
                      {selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )} */}
              </div>
            ) : (
              /* Regular Mode: Week Strip */
              <>
                {/* Month Navigation */}
                <div className={styles.monthNav}>
                  <button
                    onClick={() => navigateWeek(-1)}
                    className={styles.monthNavBtn}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline
                        points="15 18 9 12 15 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <span className={styles.monthLabel}>
                    {MONTHS[weekStart.getMonth()]}, {weekStart.getFullYear()}
                  </span>
                  <button
                    onClick={() => navigateWeek(1)}
                    className={styles.monthNavBtn}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline
                        points="9 18 15 12 9 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                {/* Week Days */}
                <div className={styles.weekStrip}>
                  <button
                    onClick={() => navigateWeek(-1)}
                    className={styles.weekNavBtn}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline
                        points="15 18 9 12 15 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {getWeekDays().map((date) => {
                    const isPast = isPastDate(date);
                    const isSelected =
                      selectedDate &&
                      formatDateLocal(date) === formatDateLocal(selectedDate);

                    return (
                      <button
                        key={formatDateLocal(date)}
                        className={`${styles.dayButton} ${isSelected ? styles.selectedDay : ""} ${isPast ? styles.pastDay : ""}`}
                        onClick={() => handleDateSelect(date)}
                        disabled={isPast}
                      >
                        <span className={styles.dayLabel}>
                          {getDayLabel(date)}
                        </span>
                        <span className={styles.dayNumber}>
                          {date.getDate()}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    onClick={() => navigateWeek(1)}
                    className={styles.weekNavBtn}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline
                        points="9 18 15 12 9 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                {/* Time Slots */}
                {selectedDate && (
                  <div className={styles.timeSlotsSection}>
                    {loadingSlots ? (
                      <div className={styles.loadingSlots}>
                        Loading available times...
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className={styles.noSlots}>
                        No available times for this date
                      </div>
                    ) : (
                      <>
                        <div className={styles.timeGrid}>
                          {displayedSlots.map((slot) => (
                            <button
                              key={slot.time}
                              className={`${styles.timeSlot} ${selectedTime === slot.time ? styles.selectedTime : ""} ${!slot.available ? styles.unavailableTime : ""}`}
                              onClick={() =>
                                slot.available && handleTimeSelect(slot.time)
                              }
                              disabled={!slot.available}
                            >
                              {formatTime(slot.time)}
                            </button>
                          ))}
                        </div>

                        {!showAllSlots && remainingSlots > 0 && (
                          <button
                            onClick={() => setShowAllSlots(true)}
                            className={styles.showMoreBtn}
                          >
                            Show more slots{" "}
                            <span className={styles.moreCount}>
                              ({remainingSlots} available)
                            </span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step: Personal Details */}
        {stepKey === "details" && (
          <div className={styles.formSection}>
            <h1 className={styles.pageTitle}>Enter Your Details</h1>

            <div className={styles.formSplitLayout}>
              <div className={styles.formColumn}>
                <form
                  className={styles.bookingForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleNext();
                  }}
                >
                  <div className={styles.formGroup}>
                    <label htmlFor="name">Full Name *</label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={formData.customerName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customerName: e.target.value,
                        })
                      }
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="phone">Phone Number *</label>
                    <input
                      id="phone"
                      type="tel"
                      required
                      value={formData.customerPhone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customerPhone: e.target.value,
                        })
                      }
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      value={formData.customerEmail}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customerEmail: e.target.value,
                        })
                      }
                      placeholder="Enter your email (optional)"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="notes">Special Requests</label>
                    <textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      placeholder="Any special requests or notes?"
                      rows={3}
                    />
                  </div>
                </form>
              </div>

              <div className={styles.summaryColumn}>
                <div className={styles.bookingSummaryCard}>
                  <h3>Booking Summary</h3>
                  <div className={styles.summaryRow}>
                    <span>Service:</span>
                    <strong>{product?.title}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Date:</span>
                    <strong>
                      {selectedDate?.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </strong>
                  </div>
                  {!settings.fullDayMode && selectedTime && (
                    <div className={styles.summaryRow}>
                      <span>Time:</span>
                      <strong>{formatTime(selectedTime)}</strong>
                    </div>
                  )}
                  {settings.fullDayMode && (
                    <div className={styles.summaryRow}>
                      <span>Duration:</span>
                      <strong>Full Day</strong>
                    </div>
                  )}
                  {product?.price && (
                    <div className={styles.summaryRow}>
                      <span>Price:</span>
                      <strong>₹{product.price.toLocaleString()}</strong>
                    </div>
                  )}
                  {settings.requireAdvance && advanceAmount > 0 && (
                    <div
                      className={`${styles.summaryRow} ${styles.advanceRow}`}
                    >
                      <span>Advance ({settings.advancePercentage}%):</span>
                      <strong className={styles.advanceAmount}>
                        ₹{advanceAmount.toLocaleString()}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Payment */}
        {stepKey === "payment" && (
          <div className={styles.paymentSection}>
            <h1 className={styles.pageTitle}>Pay Advance</h1>

            <div className={styles.paymentCard}>
              <div className={styles.paymentHeader}>
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect
                    x="1"
                    y="4"
                    width="22"
                    height="16"
                    rx="2"
                    ry="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" />
                </svg>
                <h2>Advance Payment Required</h2>
              </div>

              <div className={styles.paymentDetails}>
                <div className={styles.paymentRow}>
                  <span>Service Total:</span>
                  <strong>₹{product?.price?.toLocaleString() || 0}</strong>
                </div>
                <div className={styles.paymentRow}>
                  <span>Advance ({settings.advancePercentage}%):</span>
                  <strong>₹{advanceAmount.toLocaleString()}</strong>
                </div>
                <div className={styles.paymentDivider}></div>
                <div className={`${styles.paymentRow} ${styles.paymentTotal}`}>
                  <span>Pay Now:</span>
                  <strong>₹{advanceAmount.toLocaleString()}</strong>
                </div>
              </div>

              <p className={styles.paymentNote}>
                The remaining ₹
                {((product?.price || 0) - advanceAmount).toLocaleString()} will
                be collected after the service.
              </p>

              <div className={styles.paymentMethods}>
                <p className={styles.paymentMethodsLabel}>
                  Secure payment via Razorpay
                </p>
                <div className={styles.paymentIcons}>
                  <span>💳 Cards</span>
                  <span>📱 UPI</span>
                  <span>🏦 Net Banking</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Confirmation */}
        {stepKey === "confirmation" && bookingSuccess && (
          <div className={styles.confirmationSection}>
            <div className={styles.confirmationCard}>
              <div className={styles.successIcon}>
                <svg
                  width="60"
                  height="60"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="22 4 12 14.01 9 11.01"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h1 className={styles.confirmTitle}>Booking Confirmed!</h1>
              <p className={styles.confirmMessage}>
                Your appointment has been successfully booked. You will receive
                a confirmation shortly.
              </p>

              <div className={styles.confirmDetails}>
                <div className={styles.confirmRow}>
                  <span>Service</span>
                  <strong>{product?.title}</strong>
                </div>
                <div className={styles.confirmRow}>
                  <span>Date</span>
                  <strong>
                    {selectedDate?.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </strong>
                </div>
                {!settings.fullDayMode && selectedTime && (
                  <div className={styles.confirmRow}>
                    <span>Time</span>
                    <strong>{formatTime(selectedTime)}</strong>
                  </div>
                )}
                {settings.fullDayMode && (
                  <div className={styles.confirmRow}>
                    <span>Duration</span>
                    <strong>Full Day</strong>
                  </div>
                )}
                {settings.requireAdvance && (
                  <div className={styles.confirmRow}>
                    <span>Advance Paid</span>
                    <strong className={styles.advanceAmount}>
                      ₹{advanceAmount.toLocaleString()}
                    </strong>
                  </div>
                )}
              </div>

              <Link
                href={`/showcase/${username}`}
                className={styles.returnButton}
              >
                Return to Showcase
              </Link>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {stepKey !== "confirmation" && (
          <div className={styles.footerActions}>
            <button
              onClick={handleBack}
              className={styles.backBtn}
              disabled={currentStep === 1}
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className={styles.nextBtn}
              disabled={!canProceed() || submitting || paymentProcessing}
            >
              {paymentProcessing
                ? "Processing..."
                : submitting
                  ? "Booking..."
                  : stepKey === "payment"
                    ? `Pay ₹${advanceAmount.toLocaleString()}`
                    : stepKey === "details" && !settings.requireAdvance
                      ? "Confirm Booking"
                      : "Next"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
