"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import styles from "./booking.module.css";
import {
  BookingHeader,
  ServiceCategoryNav,
  ServiceGrid,
  ServiceDetailModal,
  Service,
} from "./components";
import {
  subscribeToServiceUpdates,
  onConnectionStatusChange,
  setBookingPhase,
  ConnectionStatus,
} from "@/app/utils/bookingSync";

// ============================================================
// Types
// ============================================================
interface BookingPageProps {
  params: Promise<{ bookingSlug: string }>;
}

interface SocialLinks {
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
}

interface BusinessHours {
  start: string | null;
  end: string | null;
  enabled: boolean;
}

interface BookingData {
  id: string;
  businessName: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  timezone: string;
  contact?: {
    phone?: string;
    email?: string;
    whatsapp?: string;
  };
  location?: {
    address?: string;
    city?: string;
    state?: string;
  };
  social?: SocialLinks;
  services: Service[];
  hours: Record<string, BusinessHours>;
  slotDuration: number;
  bufferMinutes: number;
  advanceDays: number;
}

interface TimeSlot {
  time: string;
  available: boolean;
  capacity?: number;
  totalStaff?: number;
}

// ============================================================
// Helper Functions
// ============================================================
function formatSlugToName(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPrice(price: number, currency: string = "INR"): string {
  if (price === 0) return "FREE";
  if (currency === "INR") return `₹${price}`;
  return `$${price}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}MIN`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}H ${mins}MIN` : `${hours}H`;
}

// ============================================================
// Main Component
// ============================================================
export default function BookingPage({ params }: BookingPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookingSlug, setBookingSlug] = useState<string>("");
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI State
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<ConnectionStatus>("disconnected");
  const [serviceDisabledToast, setServiceDisabledToast] = useState<
    string | null
  >(null);

  // Date/Time Selection State (for booking flow)
  const [currentView, setCurrentView] = useState<
    "services" | "datetime" | "form"
  >("services");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fromServiceId, setFromServiceId] = useState<string | null>(null); // Track if came from view page

  // Initialize params and load category from URL
  useEffect(() => {
    params.then((p) => {
      setBookingSlug(p.bookingSlug);
    });
  }, [params]);

  // Persist category in URL
  useEffect(() => {
    const urlCategory = searchParams.get("category");
    if (urlCategory && urlCategory !== activeCategory) {
      setActiveCategory(urlCategory);
    }
  }, [searchParams]);

  // Handle selectService param from view page (Book Now button)
  useEffect(() => {
    const selectServiceId = searchParams.get("selectService");
    if (selectServiceId && bookingData?.services) {
      const serviceToSelect = bookingData.services.find(
        (s) => s.id === selectServiceId,
      );
      if (serviceToSelect) {
        console.log(
          "[BookingPage] Auto-selecting service from URL:",
          serviceToSelect.name,
        );
        setSelectedService(serviceToSelect);
        setFromServiceId(selectServiceId); // Track origin for back navigation
        setCurrentView("datetime");
        setBookingPhase("SELECTING_SLOT");
        // Clear the URL param to prevent re-triggering
        const url = new URL(window.location.href);
        url.searchParams.delete("selectService");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [searchParams, bookingData?.services]);

  // Update URL when category changes
  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    const url = new URL(window.location.href);
    if (category === "All") {
      url.searchParams.delete("category");
    } else {
      url.searchParams.set("category", category);
    }
    window.history.replaceState({}, "", url.toString());
  };

  // Fetch booking data
  const fetchBookingData = useCallback(
    async (isRefresh = false) => {
      if (!bookingSlug) return;

      try {
        if (!isRefresh) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        const response = await fetch(`/api/booking/${bookingSlug}`, {
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok) {
          if (response.status === 404) {
            setError("not_found");
          } else {
            setError(result.error || "Failed to load booking page");
          }
          return;
        }

        if (result.success) {
          setBookingData(result.data);

          if (isRefresh) {
            console.log("[BookingPage] 🔄 Data refreshed in real-time!");
          }
        }
      } catch (err) {
        console.error("[BookingPage] Fetch error:", err);
        if (!isRefresh) {
          setError("Failed to load booking page");
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [bookingSlug],
  );

  // Initial fetch
  useEffect(() => {
    if (bookingSlug) {
      fetchBookingData(false);
    }
  }, [bookingSlug, fetchBookingData]);

  // Real-time sync: Subscribe to updates
  useEffect(() => {
    if (!bookingSlug || !bookingData?.id) return;

    // Set phase to BROWSING when viewing services
    setBookingPhase("BROWSING");

    const unsubscribe = subscribeToServiceUpdates(
      bookingData.id,
      (event) => {
        console.log("[BookingPage] 📡 Received real-time update:", event);
        fetchBookingData(true);
      },
      (serviceId, serviceName) => {
        // Handle service disabled mid-flow
        setServiceDisabledToast(
          `"${serviceName}" is no longer available. Please choose another service.`,
        );
        setTimeout(() => setServiceDisabledToast(null), 5000);
      },
    );

    // Connection status
    const unsubscribeStatus = onConnectionStatusChange((status) => {
      setRealtimeStatus(status);
    });

    return () => {
      unsubscribe();
      unsubscribeStatus();
    };
  }, [bookingSlug, bookingData?.id, fetchBookingData]);

  // Fallback polling every 30 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        currentView === "services"
      ) {
        fetchBookingData(true);
      }
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [fetchBookingData, currentView]);

  // Handle 404
  if (error === "not_found") {
    notFound();
  }

  // Services with filtering
  const services = useMemo(() => {
    if (!bookingData || bookingData.services.length === 0) {
      return [];
    }
    return bookingData.services;
  }, [bookingData]);

  // Derive categories with counts
  const categoriesWithCounts = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    services.forEach((s) => {
      const cat = s.category || "Other";
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    return Object.entries(categoryMap).map(([name, count]) => ({
      name,
      count,
    }));
  }, [services]);

  // Filter services by category
  const filteredServices = useMemo(() => {
    if (activeCategory === "All") return services;
    return services.filter((s) => s.category === activeCategory);
  }, [services, activeCategory]);

  const businessName =
    bookingData?.businessName || formatSlugToName(bookingSlug);

  // Handlers
  const handleServiceClick = (service: Service) => {
    // Navigate to dedicated service view page
    router.push(`/booking/${bookingSlug}/view/${service.id}`);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedService(null);
  };

  const handleBookNow = (service: Service) => {
    // Close modal and switch to datetime selection view
    setIsModalOpen(false);
    setSelectedService(service);
    setCurrentView("datetime");

    // Set phase to SELECTING_SLOT to block realtime updates
    setBookingPhase("SELECTING_SLOT");
  };

  // Fetch slots when date is selected
  useEffect(() => {
    if (!selectedService || !selectedDate || currentView !== "datetime") return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const dateStr = selectedDate.toISOString().split("T")[0];
        const response = await fetch(
          `/api/booking/${bookingSlug}/availability?date=${dateStr}&service_id=${selectedService.id}`,
        );
        const result = await response.json();

        if (result.success) {
          setAvailableSlots(result.slots || []);
        }
      } catch (err) {
        console.error("[BookingPage] Error fetching slots:", err);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [bookingSlug, selectedService, selectedDate, currentView]);

  // Generate available dates
  const availableDates = useMemo(() => {
    const days = bookingData?.advanceDays || 30;
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [bookingData?.advanceDays]);

  // Handle continue to booking form
  const handleContinueToForm = () => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    // Store selection in localStorage
    const selection = {
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      price: selectedService.price,
      duration: selectedService.duration,
      imageUrl: selectedService.imageUrl,
      date: selectedDate.toISOString(),
      time: selectedTime,
      createdAt: Date.now(),
    };
    localStorage.setItem(`booking_${bookingSlug}`, JSON.stringify(selection));

    router.push(`/booking/${bookingSlug}/book`);
  };

  // Back to services
  const handleBackToServices = () => {
    setCurrentView("services");
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setBookingPhase("BROWSING");
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.bookingContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
          <p>Loading services...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && error !== "not_found") {
    return (
      <div className={styles.bookingContainer}>
        <div className={styles.errorContainer}>
          <h2>Oops!</h2>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.primaryBtn}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ========================================
  // DATETIME SELECTION VIEW
  // ========================================
  if (currentView === "datetime" && selectedService) {
    return (
      <div className={styles.bookingContainer}>
        <BookingHeader
          businessName={businessName}
          logoUrl={bookingData?.logoUrl}
          showBack={true}
          onBackClick={handleBackToServices}
        />

        <main className={styles.bookingContent}>
          {/* Selected Service Summary */}
          <div className={styles.selectedServiceCard}>
            <h2>{selectedService.name}</h2>
            <div className={styles.selectedServiceMeta}>
              <span>{formatDuration(selectedService.duration)}</span>
              <span>•</span>
              <span>{formatPrice(selectedService.price)}</span>
            </div>
          </div>

          {/* Date Selection */}
          <section className={styles.dateSection}>
            <h3 className={styles.sectionTitle}>Choose a date</h3>
            <div className={styles.dateScroller}>
              {availableDates.slice(0, 14).map((date) => {
                const isSelected =
                  selectedDate?.toDateString() === date.toDateString();
                const dayName = date
                  .toLocaleDateString("en-US", { weekday: "short" })
                  .toUpperCase();
                const dayNum = date.getDate();
                const month = date.toLocaleDateString("en-US", {
                  month: "short",
                });

                return (
                  <button
                    key={date.toISOString()}
                    className={`${styles.dateCard} ${
                      isSelected ? styles.dateSelected : ""
                    }`}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedTime(null);
                    }}
                  >
                    <span className={styles.dateDayName}>{dayName}</span>
                    <span className={styles.dateDayNum}>{dayNum}</span>
                    <span className={styles.dateMonth}>{month}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Time Selection */}
          {selectedDate && (
            <section className={styles.timeSection}>
              <h3 className={styles.sectionTitle}>Choose a time</h3>
              {loadingSlots ? (
                <div className={styles.loadingSlots}>
                  <div className={styles.loadingSpinner} />
                </div>
              ) : availableSlots.length > 0 ? (
                <div className={styles.timeSlotsGrid}>
                  {availableSlots.map((slot) => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        className={`${styles.timeSlotCard} ${
                          isSelected ? styles.timeSelected : ""
                        } ${!slot.available ? styles.timeUnavailable : ""}`}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                      >
                        <span className={styles.timeSlotTime}>{slot.time}</span>
                        {slot.available && slot.capacity && (
                          <span className={styles.timeSlotCapacity}>
                            {slot.capacity === 1
                              ? "Last slot"
                              : `${slot.capacity} spots`}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.noSlots}>
                  <p>No available slots for this date.</p>
                </div>
              )}
            </section>
          )}

          {/* Continue Button */}
          {selectedTime && (
            <div className={styles.continueWrapper}>
              <button
                className={styles.primaryBtn}
                onClick={handleContinueToForm}
              >
                Continue
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ========================================
  // SERVICES BROWSING VIEW (Store-like)
  // ========================================
  return (
    <div className={styles.bookingContainer}>
      {/* Header */}
      <BookingHeader
        businessName={businessName}
        logoUrl={bookingData?.logoUrl}
      />

      {/* Main Content */}
      <main className={styles.bookingContent}>
        {/* Business Description (optional) */}
        {bookingData?.description && (
          <p className={styles.businessDescription}>
            {bookingData.description}
          </p>
        )}

        {/* Category Navigation */}
        {categoriesWithCounts.length > 0 && (
          <ServiceCategoryNav
            categories={categoriesWithCounts}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
            totalServices={services.length}
          />
        )}

        {/* Services Grid */}
        <ServiceGrid
          services={filteredServices}
          onServiceClick={handleServiceClick}
        />

        {/* Connection Status (subtle indicator) */}
        {realtimeStatus === "connected" && (
          <div className={styles.realtimeIndicator}>
            <span className={styles.realtimeDot} />
            Live updates
          </div>
        )}

        {/* Refresh indicator */}
        {isRefreshing && (
          <div className={styles.refreshIndicator}>
            <div className={styles.refreshSpinner} />
          </div>
        )}
      </main>

      {/* Service Detail Modal */}
      <ServiceDetailModal
        service={selectedService}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onBookNow={handleBookNow}
      />

      {/* Toast for disabled services */}
      {serviceDisabledToast && (
        <div className={styles.toast}>
          <span className={styles.toastIcon}>⚠️</span>
          {serviceDisabledToast}
        </div>
      )}
    </div>
  );
}
