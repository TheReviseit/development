"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./bookings.module.css";

/**
 * Booking interface - represents a showcase booking
 */
interface Booking {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  date: string;
  time: string;
  duration: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  service_name?: string;
  product_name?: string;
  service?: string;
  notes?: string;
  created_at: string;
  advance_paid?: number;
  service_price?: number;
}

/**
 * Booking Settings interface
 */
interface BookingSettings {
  fullDayMode: boolean;
  requireAdvance: boolean;
  advancePercentage: number;
  oneBookingPerDay: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

/**
 * ShowcaseBookingsPage - Enterprise-level admin bookings calendar
 *
 * Features:
 * - Month/Week/Day views
 * - Color-coded booking status
 * - Quick status updates
 * - Booking Settings (Full Day Mode, Advance Payment)
 * - Responsive design
 */
export default function ShowcaseBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [filter, setFilter] = useState<string>("all");

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<BookingSettings>({
    fullDayMode: false,
    requireAdvance: false,
    advancePercentage: 10,
    oneBookingPerDay: false,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Booking Detail Modal State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Open booking detail modal
  const openBookingDetail = (booking: Booking) => {
    setSelectedBooking(booking);
    setShowBookingModal(true);
  };

  // Close booking detail modal
  const closeBookingDetail = () => {
    setShowBookingModal(false);
    setSelectedBooking(null);
  };

  // Format date as YYYY-MM-DD in local timezone
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Fetch bookings from API
  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const endDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );

      const params = new URLSearchParams({
        startDate: formatDateLocal(startDate),
        endDate: formatDateLocal(endDate),
      });

      const response = await fetch(`/api/appointments?${params}`);
      const data = await response.json();

      if (data.success) {
        setBookings(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  // Fetch booking settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/showcase/booking-settings");
      const data = await response.json();
      if (data.success && data.data) {
        setSettings({
          fullDayMode: data.data.full_day_mode || false,
          requireAdvance: data.data.require_advance || false,
          advancePercentage: data.data.advance_percentage || 10,
          oneBookingPerDay: data.data.one_booking_per_day || false,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchSettings();
  }, [fetchBookings, fetchSettings]);

  // Save settings
  const saveSettings = async (newSettings: BookingSettings) => {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/showcase/booking-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_day_mode: newSettings.fullDayMode,
          require_advance: newSettings.requireAdvance,
          advance_percentage: newSettings.advancePercentage,
          one_booking_per_day: newSettings.oneBookingPerDay,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSettings(newSettings);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle toggle changes with auto-save
  const handleSettingChange = (
    key: keyof BookingSettings,
    value: boolean | number,
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
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

  const getBookingsForDate = (date: Date) => {
    const dateStr = formatDateLocal(date);
    return bookings.filter((b) => b.date === dateStr);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Navigation
  const navigateMonth = (direction: number) => {
    setCurrentDate(
      new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + direction,
        1,
      ),
    );
  };

  const navigateWeek = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction * 7);
    setCurrentDate(newDate);
  };

  const navigateDay = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  const navigate = (direction: number) => {
    if (viewMode === "month") navigateMonth(direction);
    else if (viewMode === "week") navigateWeek(direction);
    else navigateDay(direction);
  };

  // Week view helpers
  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  };

  // Time slots for week/day view
  const TIME_SLOTS = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
  ];

  const getBookingsForTimeSlot = (date: Date, timeSlot: string) => {
    const dateStr = formatDateLocal(date);
    return bookings.filter(
      (b) => b.date === dateStr && b.time.startsWith(timeSlot.split(":")[0]),
    );
  };

  // View title
  const getViewTitle = () => {
    if (viewMode === "month") {
      return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (viewMode === "week") {
      const weekDays = getWeekDays(currentDate);
      const startDate = weekDays[0];
      const endDate = weekDays[6];
      if (startDate.getMonth() === endDate.getMonth()) {
        return `${MONTHS[startDate.getMonth()].slice(0, 3)} ${startDate.getDate()} - ${endDate.getDate()}, ${startDate.getFullYear()}`;
      }
      return `${MONTHS[startDate.getMonth()].slice(0, 3)} ${startDate.getDate()} - ${MONTHS[endDate.getMonth()].slice(0, 3)} ${endDate.getDate()}`;
    } else {
      return currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  };

  // Stats
  const stats = {
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    total: bookings.length,
  };

  // Format time for display
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Handle date click
  const handleDateClick = (date: Date) => {
    const dateStr = formatDateLocal(date);
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
  };

  // Status change handler
  const handleStatusChange = async (booking: Booking, newStatus: string) => {
    try {
      const response = await fetch(`/api/appointments/${booking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchBookings();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  // Filter bookings for selected date
  const filteredBookings = bookings.filter((b) => {
    if (selectedDate && b.date !== selectedDate) return false;
    if (filter === "all") return true;
    return b.status === filter;
  });

  if (loading) {
    return (
      <div className={styles.bookingsView}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading bookings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bookingsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div className={styles.headerInfo}>
          <h1 className={styles.viewTitle}>Showcase Bookings</h1>
          <p className={styles.viewSubtitle}>
            Manage your photography & makeup appointments
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryBtn}
            onClick={() => fetchBookings()}
            title="Refresh bookings"
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
            className={styles.settingsBtn}
            onClick={() => setShowSettingsModal(true)}
            title="Booking Settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Settings
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.pending}`}>
            <svg
              width="24"
              height="24"
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
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.pending}</div>
            <div className={`${styles.statLabel} ${styles.pendingLabel}`}>
              Pending
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.confirmed}`}>
            <svg
              width="24"
              height="24"
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
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.confirmed}</div>
            <div className={`${styles.statLabel} ${styles.confirmedLabel}`}>
              Confirmed
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.cancelled}`}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line
                x1="15"
                y1="9"
                x2="9"
                y2="15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="9"
                y1="9"
                x2="15"
                y2="15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.cancelled}</div>
            <div className={`${styles.statLabel} ${styles.cancelledLabel}`}>
              Cancelled
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.total}`}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect
                x="3"
                y="4"
                width="18"
                height="18"
                rx="2"
                ry="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
              <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
              <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>This Month</div>
          </div>
        </div>
      </div>

      {/* Calendar Section */}
      <div className={styles.calendarSection}>
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <div className={styles.calendarNav}>
              <button className={styles.navBtn} onClick={() => navigate(-1)}>
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
              <span className={styles.currentMonth}>{getViewTitle()}</span>
              <button className={styles.navBtn} onClick={() => navigate(1)}>
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
            <div className={styles.viewTabs}>
              <button
                className={`${styles.viewTab} ${viewMode === "month" ? styles.viewTabActive : ""}`}
                onClick={() => setViewMode("month")}
              >
                Month
              </button>
              <button
                className={`${styles.viewTab} ${viewMode === "week" ? styles.viewTabActive : ""}`}
                onClick={() => setViewMode("week")}
              >
                Week
              </button>
              <button
                className={`${styles.viewTab} ${viewMode === "day" ? styles.viewTabActive : ""}`}
                onClick={() => setViewMode("day")}
              >
                Day
              </button>
            </div>
          </div>

          {/* Month View */}
          {viewMode === "month" && (
            <div className={styles.calendarGrid}>
              {DAYS.map((day) => (
                <div key={day} className={styles.calendarDayHeader}>
                  {day}
                </div>
              ))}
              {getDaysInMonth(currentDate).map(
                ({ date, isCurrentMonth }, idx) => {
                  const dayBookings = getBookingsForDate(date);
                  const dateStr = formatDateLocal(date);
                  const isSelected = selectedDate === dateStr;

                  return (
                    <div
                      key={idx}
                      className={`${styles.calendarDay} 
                      ${!isCurrentMonth ? styles.calendarDayOther : ""} 
                      ${isToday(date) ? styles.calendarDayToday : ""}
                      ${isSelected ? styles.calendarDaySelected : ""}`}
                      onClick={() => handleDateClick(date)}
                    >
                      <span className={styles.dayNumber}>{date.getDate()}</span>
                      <div className={styles.dayBookings}>
                        {dayBookings.slice(0, 3).map((booking) => (
                          <div
                            key={booking.id}
                            className={`${styles.bookingBar} ${styles[`bar_${booking.status}`]}`}
                          >
                            <span className={styles.bookingTime}>
                              {formatTime(booking.time)}
                            </span>
                          </div>
                        ))}
                        {dayBookings.length > 3 && (
                          <div className={styles.moreBookings}>
                            +{dayBookings.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}

          {/* Week View */}
          {viewMode === "week" && (
            <div className={styles.weekViewContainer}>
              <div className={styles.weekHeader}>
                <div className={styles.timeGutter}></div>
                {getWeekDays(currentDate).map((date) => (
                  <div
                    key={date.toISOString()}
                    className={`${styles.weekDayHeader} ${isToday(date) ? styles.weekDayToday : ""}`}
                  >
                    <span className={styles.weekDayName}>
                      {DAYS[date.getDay()]}
                    </span>
                    <span className={styles.weekDayNum}>{date.getDate()}</span>
                  </div>
                ))}
              </div>
              <div className={styles.weekBody}>
                {TIME_SLOTS.map((timeSlot) => (
                  <div key={timeSlot} className={styles.timeRow}>
                    <div className={styles.timeLabel}>
                      {formatTime(timeSlot)}
                    </div>
                    {getWeekDays(currentDate).map((date) => {
                      const slotBookings = getBookingsForTimeSlot(
                        date,
                        timeSlot,
                      );
                      return (
                        <div
                          key={date.toISOString()}
                          className={styles.timeSlotCell}
                        >
                          {slotBookings.map((booking) => (
                            <div
                              key={booking.id}
                              className={`${styles.slotBooking} ${styles[`slot_${booking.status}`]}`}
                            >
                              <span className={styles.slotCustomer}>
                                {booking.customer_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day View */}
          {viewMode === "day" && (
            <div className={styles.dayViewContainer}>
              {TIME_SLOTS.map((timeSlot) => {
                const slotBookings = getBookingsForTimeSlot(
                  currentDate,
                  timeSlot,
                );
                return (
                  <div key={timeSlot} className={styles.dayTimeRow}>
                    <div className={styles.dayTimeLabel}>
                      {formatTime(timeSlot)}
                    </div>
                    <div className={styles.dayTimeSlotContent}>
                      {slotBookings.length === 0 ? (
                        <div className={styles.emptySlot}>Available</div>
                      ) : (
                        slotBookings.map((booking) => (
                          <div
                            key={booking.id}
                            className={`${styles.dayBookingCard} ${styles[`day_${booking.status}`]}`}
                          >
                            <div className={styles.dayBookingHeader}>
                              <span className={styles.dayBookingCustomer}>
                                {booking.customer_name}
                              </span>
                              <span
                                className={`${styles.statusBadge} ${styles[booking.status]}`}
                              >
                                {booking.status}
                              </span>
                            </div>
                            <div className={styles.dayBookingDetails}>
                              <span>{booking.customer_phone}</span>
                              {booking.service_name && (
                                <span>• {booking.service_name}</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Panel - Selected Date Bookings */}
        {selectedDate && (
          <div className={styles.bookingsSidePanel}>
            <div className={styles.sidePanelHeader}>
              <h3 className={styles.sidePanelTitle}>
                {new Date(selectedDate).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              <button
                className={styles.sidePanelClose}
                onClick={() => setSelectedDate(null)}
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
                    strokeLinejoin="round"
                  />
                  <line
                    x1="6"
                    y1="6"
                    x2="18"
                    y2="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div className={styles.sidePanelContent}>
              {filteredBookings.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No bookings for this date</p>
                </div>
              ) : (
                filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className={styles.bookingCard}
                    onClick={() => openBookingDetail(booking)}
                  >
                    <div
                      className={`${styles.statusDot} ${styles[`dot_${booking.status}`]}`}
                    ></div>
                    <div className={styles.bookingCardLayout}>
                      <div className={styles.bookingTimeBlock}>
                        <span className={styles.timeValue}>
                          {formatTime(booking.time).split(" ")[0]}
                        </span>
                        <span className={styles.timePeriod}>
                          {formatTime(booking.time).split(" ")[1]}
                        </span>
                      </div>
                      <div className={styles.bookingInfo}>
                        <span className={styles.customerName}>
                          {booking.customer_name}
                        </span>
                        <div className={styles.bookingMeta}>
                          <span>{booking.customer_phone}</span>
                          {booking.service_name && (
                            <span>• {booking.service_name}</span>
                          )}
                        </div>
                        <div className={styles.bookingFooter}>
                          <span className={styles.duration}>
                            {booking.duration} min
                          </span>
                          <select
                            className={styles.statusSelect}
                            value={booking.status}
                            onChange={(e) =>
                              handleStatusChange(booking, e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="completed">Completed</option>
                            <option value="no_show">No Show</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className={styles.settingsModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Booking Settings</h2>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowSettingsModal(false)}
              >
                <svg
                  width="20"
                  height="20"
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
                    strokeLinejoin="round"
                  />
                  <line
                    x1="6"
                    y1="6"
                    x2="18"
                    y2="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className={styles.modalContent}>
              {/* Full Day Mode Toggle */}
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <h3 className={styles.settingLabel}>Full Day Work</h3>
                  <p className={styles.settingDesc}>
                    When enabled, customers will only select a date without
                    specific time slots. Ideal for full-day photography or
                    makeup sessions.
                  </p>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={settings.fullDayMode}
                    onChange={(e) =>
                      handleSettingChange("fullDayMode", e.target.checked)
                    }
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>

              <div className={styles.settingDivider}></div>

              {/* Get Advance Toggle */}
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <h3 className={styles.settingLabel}>Get Advance Payment</h3>
                  <p className={styles.settingDesc}>
                    When enabled, customers must pay an advance percentage
                    before booking confirmation. A payment step will be added to
                    the booking flow.
                  </p>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={settings.requireAdvance}
                    onChange={(e) =>
                      handleSettingChange("requireAdvance", e.target.checked)
                    }
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>

              {/* Advance Percentage Input - Show only when advance is enabled */}
              {settings.requireAdvance && (
                <div className={styles.percentageSection}>
                  <label className={styles.percentageLabel}>
                    Advance Percentage
                  </label>
                  <div className={styles.percentageInputGroup}>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={settings.advancePercentage}
                      onChange={(e) =>
                        handleSettingChange(
                          "advancePercentage",
                          parseInt(e.target.value) || 10,
                        )
                      }
                      className={styles.percentageInput}
                    />
                    <span className={styles.percentageSymbol}>%</span>
                  </div>
                  <p className={styles.percentageHint}>
                    Example: 10% on ₹10,000 = ₹1,000 advance payment
                  </p>
                </div>
              )}

              <div className={styles.settingDivider}></div>

              {/* One Booking Per Day Toggle */}
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <h3 className={styles.settingLabel}>One Booking Per Day</h3>
                  <p className={styles.settingDesc}>
                    When enabled, only one booking per day is allowed. Once a
                    date has a booking, it will be disabled for other customers.
                  </p>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={settings.oneBookingPerDay}
                    onChange={(e) =>
                      handleSettingChange("oneBookingPerDay", e.target.checked)
                    }
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              {savingSettings && (
                <span className={styles.savingIndicator}>
                  <span className={styles.savingDot}></span>
                  Saving...
                </span>
              )}
              <button
                className={styles.modalDoneBtn}
                onClick={() => setShowSettingsModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Detail Modal */}
      {showBookingModal && selectedBooking && (
        <div className={styles.modalOverlay} onClick={closeBookingDetail}>
          <div
            className={styles.bookingDetailModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Booking Details</h2>
              <button
                className={styles.modalCloseBtn}
                onClick={closeBookingDetail}
              >
                <svg
                  width="20"
                  height="20"
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
                    strokeLinejoin="round"
                  />
                  <line
                    x1="6"
                    y1="6"
                    x2="18"
                    y2="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className={styles.bookingDetailContent}>
              {/* Status Badge */}
              <div className={styles.detailStatusRow}>
                <span
                  className={`${styles.detailStatusBadge} ${styles[`status_${selectedBooking.status}`]}`}
                >
                  {selectedBooking.status.charAt(0).toUpperCase() +
                    selectedBooking.status.slice(1).replace("_", " ")}
                </span>
              </div>

              {/* Customer Info */}
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="7"
                      r="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Customer
                </h3>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Name</span>
                  <span className={styles.detailValue}>
                    {selectedBooking.customer_name}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Phone</span>
                  <a
                    href={`tel:${selectedBooking.customer_phone}`}
                    className={styles.detailValueLink}
                  >
                    {selectedBooking.customer_phone}
                  </a>
                </div>
                {selectedBooking.customer_email && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Email</span>
                    <a
                      href={`mailto:${selectedBooking.customer_email}`}
                      className={styles.detailValueLink}
                    >
                      {selectedBooking.customer_email}
                    </a>
                  </div>
                )}
              </div>

              {/* Booking Info */}
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                      strokeLinecap="round"
                    />
                    <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
                    <line
                      x1="3"
                      y1="10"
                      x2="21"
                      y2="10"
                      strokeLinecap="round"
                    />
                  </svg>
                  Appointment
                </h3>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Date</span>
                  <span className={styles.detailValue}>
                    {new Date(selectedBooking.date).toLocaleDateString(
                      "en-US",
                      {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Time</span>
                  <span className={styles.detailValue}>
                    {formatTime(selectedBooking.time)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Duration</span>
                  <span className={styles.detailValue}>
                    {selectedBooking.duration >= 60
                      ? `${Math.floor(selectedBooking.duration / 60)}h ${selectedBooking.duration % 60 > 0 ? `${selectedBooking.duration % 60}m` : ""}`
                      : `${selectedBooking.duration} min`}
                  </span>
                </div>
                {(selectedBooking.service_name || selectedBooking.service) && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Service</span>
                    <span className={styles.detailValue}>
                      {selectedBooking.service_name || selectedBooking.service}
                    </span>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              {(selectedBooking.service_price ||
                selectedBooking.advance_paid) && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line
                        x1="12"
                        y1="1"
                        x2="12"
                        y2="23"
                        strokeLinecap="round"
                      />
                      <path
                        d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Payment
                  </h3>
                  {selectedBooking.service_price && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Total Price</span>
                      <span className={styles.detailValue}>
                        ₹{selectedBooking.service_price.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedBooking.advance_paid !== undefined &&
                    selectedBooking.advance_paid > 0 && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Advance Paid</span>
                        <span className={styles.detailValueGreen}>
                          ₹{selectedBooking.advance_paid.toLocaleString()}
                        </span>
                      </div>
                    )}
                </div>
              )}

              {/* Notes */}
              {selectedBooking.notes && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <polyline
                        points="14 2 14 8 20 8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <line
                        x1="16"
                        y1="13"
                        x2="8"
                        y2="13"
                        strokeLinecap="round"
                      />
                      <line
                        x1="16"
                        y1="17"
                        x2="8"
                        y2="17"
                        strokeLinecap="round"
                      />
                    </svg>
                    Notes
                  </h3>
                  <p className={styles.detailNotes}>{selectedBooking.notes}</p>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.modalSecondaryBtn}
                onClick={() => {
                  window.open(`tel:${selectedBooking.customer_phone}`, "_self");
                }}
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
                    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Call
              </button>
              <button
                className={styles.modalDoneBtn}
                onClick={closeBookingDetail}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
