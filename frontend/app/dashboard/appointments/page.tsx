"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./appointments.module.css";

interface Appointment {
  id: string;
  customer_name: string;
  customer_phone: string;
  date: string;
  time: string;
  duration: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  source: "ai" | "manual";
  service?: string;
  notes?: string;
  created_at: string;
}

interface AppointmentFormData {
  customer_name: string;
  customer_phone: string;
  date: string;
  time: string;
  duration: number;
  service: string;
  notes: string;
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

export default function AppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [formData, setFormData] = useState<AppointmentFormData>({
    customer_name: "",
    customer_phone: "",
    date: "",
    time: "09:00",
    duration: 60,
    service: "",
    notes: "",
  });

  // Check if appointment feature is enabled
  useEffect(() => {
    const checkCapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        if (!data.success || !data.data?.appointment_booking_enabled) {
          router.push("/dashboard/bot-settings");
        }
      } catch (error) {
        console.error("Error checking capabilities:", error);
      }
    };
    checkCapabilities();
  }, [router]);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );
      const endDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      );

      const params = new URLSearchParams({
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      });

      const response = await fetch(`/api/appointments?${params}`);
      const data = await response.json();

      if (data.success) {
        setAppointments(data.data);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

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

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return appointments.filter((apt) => apt.date === dateStr);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Stats
  const stats = {
    pending: appointments.filter((a) => a.status === "pending").length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
    total: appointments.length,
  };

  // Filter appointments for sidebar
  const filteredAppointments = appointments.filter((apt) => {
    if (selectedDate && apt.date !== selectedDate) return false;
    if (filter === "all") return true;
    return apt.status === filter;
  });

  // Navigation
  const navigateMonth = (direction: number) => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1)
    );
  };

  // Form handlers
  const handleOpenModal = (appointment?: Appointment) => {
    if (appointment) {
      setEditingAppointment(appointment);
      setFormData({
        customer_name: appointment.customer_name,
        customer_phone: appointment.customer_phone,
        date: appointment.date,
        time: appointment.time,
        duration: appointment.duration,
        service: appointment.service || "",
        notes: appointment.notes || "",
      });
    } else {
      setEditingAppointment(null);
      setFormData({
        customer_name: "",
        customer_phone: "",
        date: selectedDate || new Date().toISOString().split("T")[0],
        time: "09:00",
        duration: 60,
        service: "",
        notes: "",
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAppointment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingAppointment
        ? `/api/appointments/${editingAppointment.id}`
        : "/api/appointments";
      const method = editingAppointment ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          source: "manual",
        }),
      });

      const data = await response.json();

      if (data.success) {
        handleCloseModal();
        fetchAppointments();
      } else {
        alert(data.error || "Failed to save appointment");
      }
    } catch (error) {
      console.error("Error saving appointment:", error);
      alert("Failed to save appointment");
    }
  };

  const handleStatusChange = async (
    appointment: Appointment,
    newStatus: string
  ) => {
    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchAppointments();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleCancel = async (appointment: Appointment) => {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;

    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchAppointments();
      }
    } catch (error) {
      console.error("Error cancelling appointment:", error);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className={styles.appointmentsView}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading appointments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.appointmentsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div className={styles.headerInfo}>
          <h1 className={styles.viewTitle}>📅 Appointments</h1>
          <p className={styles.viewSubtitle}>
            Manage bookings from AI and manual entries
          </p>
        </div>
        <div className={styles.headerActions}>
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
            New Appointment
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.pending}`}>⏳</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.pending}</div>
            <div className={styles.statLabel}>Pending</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.confirmed}`}>✓</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.confirmed}</div>
            <div className={styles.statLabel}>Confirmed</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.cancelled}`}>✕</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.cancelled}</div>
            <div className={styles.statLabel}>Cancelled</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.total}`}>📊</div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>This Month</div>
          </div>
        </div>
      </div>

      {/* Calendar Section */}
      <div className={styles.calendarSection}>
        {/* Calendar */}
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <div className={styles.calendarNav}>
              <button
                className={styles.navBtn}
                onClick={() => navigateMonth(-1)}
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
              <span className={styles.currentMonth}>
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <button
                className={styles.navBtn}
                onClick={() => navigateMonth(1)}
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
            <div className={styles.viewTabs}>
              <button
                className={`${styles.viewTab} ${
                  viewMode === "month" ? styles.viewTabActive : ""
                }`}
                onClick={() => setViewMode("month")}
              >
                Month
              </button>
              <button
                className={`${styles.viewTab} ${
                  viewMode === "week" ? styles.viewTabActive : ""
                }`}
                onClick={() => setViewMode("week")}
              >
                Week
              </button>
              <button
                className={`${styles.viewTab} ${
                  viewMode === "day" ? styles.viewTabActive : ""
                }`}
                onClick={() => setViewMode("day")}
              >
                Day
              </button>
            </div>
          </div>

          <div className={styles.calendarGrid}>
            {/* Day headers */}
            {DAYS.map((day) => (
              <div key={day} className={styles.calendarDayHeader}>
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {getDaysInMonth(currentDate).map(
              ({ date, isCurrentMonth }, index) => {
                const dateStr = date.toISOString().split("T")[0];
                const dayAppointments = getAppointmentsForDate(date);
                const isSelected = selectedDate === dateStr;

                return (
                  <div
                    key={index}
                    className={`${styles.calendarDay} ${
                      !isCurrentMonth ? styles.calendarDayOther : ""
                    } ${isToday(date) ? styles.calendarDayToday : ""} ${
                      isSelected ? styles.calendarDaySelected : ""
                    }`}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  >
                    <div className={styles.dayNumber}>{date.getDate()}</div>
                    <div className={styles.dayAppointments}>
                      {dayAppointments.slice(0, 3).map((apt) => (
                        <div
                          key={apt.id}
                          className={`${styles.appointmentDot} ${
                            styles[apt.status]
                          }`}
                          title={`${apt.customer_name} - ${formatTime(
                            apt.time
                          )}`}
                        />
                      ))}
                      {dayAppointments.length > 3 && (
                        <span className={styles.moreAppointments}>
                          +{dayAppointments.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Appointments List */}
        <div className={styles.appointmentsList}>
          <div className={styles.listHeader}>
            <h3 className={styles.listTitle}>
              {selectedDate
                ? new Date(selectedDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "All Appointments"}
            </h3>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {filteredAppointments.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📅</div>
              <h4 className={styles.emptyTitle}>No appointments</h4>
              <p className={styles.emptyText}>
                {selectedDate
                  ? "No appointments on this date"
                  : "No appointments found for this month"}
              </p>
              <button
                className={styles.primaryBtn}
                onClick={() => handleOpenModal()}
              >
                Add Appointment
              </button>
            </div>
          ) : (
            filteredAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className={styles.appointmentCard}
                onClick={() => handleOpenModal(appointment)}
              >
                <div className={styles.appointmentCardHeader}>
                  <span className={styles.customerName}>
                    {appointment.customer_name}
                  </span>
                  <span
                    className={`${styles.statusBadge} ${
                      styles[appointment.status]
                    }`}
                  >
                    {appointment.status}
                  </span>
                </div>
                <div className={styles.appointmentDetails}>
                  <div className={styles.detailRow}>
                    <svg
                      className={styles.detailIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {formatTime(appointment.time)} ({appointment.duration} min)
                  </div>
                  <div className={styles.detailRow}>
                    <svg
                      className={styles.detailIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
                    </svg>
                    {appointment.customer_phone}
                  </div>
                  {appointment.service && (
                    <div className={styles.detailRow}>
                      <svg
                        className={styles.detailIcon}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      {appointment.service}
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <span
                      className={`${styles.sourceBadge} ${
                        styles[appointment.source]
                      }`}
                    >
                      {appointment.source === "ai" ? "🤖 AI" : "✏️ Manual"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingAppointment ? "Edit Appointment" : "New Appointment"}
              </h3>
              <button className={styles.modalClose} onClick={handleCloseModal}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Customer Name *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.customer_name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customer_name: e.target.value,
                      })
                    }
                    placeholder="Enter customer name"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone Number *</label>
                  <input
                    type="tel"
                    className={styles.formInput}
                    value={formData.customer_phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customer_phone: e.target.value,
                      })
                    }
                    placeholder="e.g., 919876543210"
                    required
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date *</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={formData.date}
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Time *</label>
                    <input
                      type="time"
                      className={styles.formInput}
                      value={formData.time}
                      onChange={(e) =>
                        setFormData({ ...formData, time: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Duration (minutes)
                    </label>
                    <select
                      className={styles.formInput}
                      value={formData.duration}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          duration: parseInt(e.target.value),
                        })
                      }
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Service</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={formData.service}
                      onChange={(e) =>
                        setFormData({ ...formData, service: e.target.value })
                      }
                      placeholder="e.g., Consultation"
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Notes</label>
                  <textarea
                    className={styles.formTextarea}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Additional notes..."
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                {editingAppointment &&
                  editingAppointment.status !== "cancelled" && (
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => {
                        handleCancel(editingAppointment);
                        handleCloseModal();
                      }}
                      style={{
                        marginRight: "auto",
                        color: "#ff4444",
                        borderColor: "#ff4444",
                      }}
                    >
                      Cancel Appointment
                    </button>
                  )}
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleCloseModal}
                >
                  Close
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  {editingAppointment ? "Save Changes" : "Create Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
