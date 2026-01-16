"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";
import DashboardSidebar from "./components/DashboardSidebar";
import { AuthProvider } from "@/app/components/auth/AuthProvider";
import styles from "./dashboard.module.css";

type Section =
  | "analytics"
  | "messages"
  | "bulk-messages"
  | "templates"
  | "contacts"
  | "campaigns"
  | "appointments"
  | "orders"
  | "bot-settings"
  | "preview-bot"
  | "settings";

const sectionLabels: Record<Section, string> = {
  analytics: "Analytics",
  messages: "Messages",
  "bulk-messages": "Bulk Messages",
  templates: "Templates",
  contacts: "Contacts",
  campaigns: "Campaigns",
  appointments: "Appointments",
  orders: "Orders",
  "bot-settings": "AI Settings",
  "preview-bot": "Preview Bot",
  settings: "Settings",
};

// Map pathname to section
const getActiveSection = (pathname: string): Section => {
  if (pathname.includes("/bulk-messages")) return "bulk-messages";
  if (pathname.includes("/messages")) return "messages";
  if (pathname.includes("/templates")) return "templates";
  if (pathname.includes("/contacts")) return "contacts";
  if (pathname.includes("/campaigns")) return "campaigns";
  if (pathname.includes("/appointments")) return "appointments";
  if (pathname.includes("/orders")) return "orders";
  if (pathname.includes("/bot-settings")) return "bot-settings";
  if (pathname.includes("/preview-bot")) return "preview-bot";
  if (pathname.includes("/settings")) return "settings";
  return "analytics";
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [appointmentBookingEnabled, setAppointmentBookingEnabled] =
    useState(false);
  const [orderBookingEnabled, setOrderBookingEnabled] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const activeSection = getActiveSection(pathname);

  // Fetch AI capabilities for mobile menu
  useEffect(() => {
    const fetchCapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        if (data.success && data.data) {
          setAppointmentBookingEnabled(
            data.data.appointment_booking_enabled || false
          );
          setOrderBookingEnabled(data.data.order_booking_enabled || false);
        }
      } catch (error) {
        console.log("Error fetching AI capabilities");
      }
    };
    fetchCapabilities();

    // Listen for capability updates
    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        appointment_booking_enabled: boolean;
        order_booking_enabled?: boolean;
      }>;
      if (customEvent.detail) {
        setAppointmentBookingEnabled(
          customEvent.detail.appointment_booking_enabled
        );
        if (customEvent.detail.order_booking_enabled !== undefined) {
          setOrderBookingEnabled(customEvent.detail.order_booking_enabled);
        }
      } else {
        fetchCapabilities();
      }
    };
    window.addEventListener(
      "ai-capabilities-updated",
      handleUpdate as EventListener
    );
    return () =>
      window.removeEventListener(
        "ai-capabilities-updated",
        handleUpdate as EventListener
      );
  }, []);

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const response = await fetch("/api/onboarding/check");

          if (response.status === 401) {
            router.push("/login");
            return;
          }

          const data = await response.json();

          if (!data.onboardingCompleted) {
            router.push("/onboarding");
            return;
          }

          setUser(currentUser);
          setLoading(false);
        } catch (error) {
          console.error("Error checking onboarding:", error);
          setUser(currentUser);
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Close mobile menu when route changes
  useEffect(() => {
    setShowMobileMenu(false);
    if (isMobile) setIsSidebarOpen(false);
  }, [pathname, isMobile]);

  if (loading) {
    return <SpaceshipLoader text="Loading dashboard..." />;
  }

  const handleSectionChange = (section: Section) => {
    setShowMobileMenu(false);
    if (isMobile) setIsSidebarOpen(false);

    // Navigate to the appropriate route
    if (section === "analytics") {
      router.push("/dashboard");
    } else {
      router.push(`/dashboard/${section}`);
    }
  };

  return (
    <AuthProvider>
      <div className={styles.dashboardContainer}>
        {/* Mobile Overlay */}
        {isMobile && (
          <div
            className={`${styles.sidebarOverlay} ${
              isSidebarOpen ? styles.sidebarOverlayVisible : ""
            }`}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <DashboardSidebar
          activeSection={activeSection}
          onSectionChange={(section) => handleSectionChange(section as Section)}
          userEmail={user?.email || undefined}
          userName={user?.displayName || undefined}
          isSidebarOpen={isSidebarOpen}
        />

        <main className={styles.mainContent}>
          {/* Mobile Header for all views */}
          {isMobile && (
            <div className={styles.mobileHeader}>
              <div className={styles.mobileHeaderRow}>
                <div className={styles.logoWithTitle}>
                  <img
                    src="/logo.png"
                    alt="Flowauxi"
                    className={styles.headerLogo}
                  />
                  <h2 className={styles.mobileHeaderTitle}>
                    {sectionLabels[activeSection]}
                  </h2>
                </div>
                <button
                  className={styles.mobileMenuBtn}
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                >
                  <svg
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {showMobileMenu ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>
              </div>

              {/* Mobile Dropdown Menu */}
              {showMobileMenu && (
                <>
                  {/* Overlay to close menu when clicking outside */}
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 99,
                    }}
                    onClick={() => setShowMobileMenu(false)}
                  />
                  <div
                    className={styles.mobileMenuDropdown}
                    style={{ zIndex: 100 }}
                  >
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "analytics"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("analytics")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 20V10M12 20V4M6 20v-6"
                        />
                      </svg>
                      <span>Analytics</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "messages"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("messages")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                        />
                      </svg>
                      <span>Messages</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "bulk-messages"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("bulk-messages")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                        />
                        <path
                          d="M8 12h8"
                          strokeLinecap="round"
                          strokeWidth={2}
                        />
                        <path
                          d="M8 8h8"
                          strokeLinecap="round"
                          strokeWidth={2}
                        />
                        <path
                          d="M8 16h4"
                          strokeLinecap="round"
                          strokeWidth={2}
                        />
                      </svg>
                      <span>Bulk Messages</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "templates"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("templates")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                        />
                        <polyline
                          points="14 2 14 8 20 8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Templates</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "contacts"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("contacts")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                        />
                        <circle
                          cx="9"
                          cy="7"
                          r="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Contacts</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "campaigns"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("campaigns")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <polygon
                          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                      <span>Campaigns</span>
                    </button>
                    {appointmentBookingEnabled && (
                      <button
                        className={`${styles.mobileNavLink} ${
                          activeSection === "appointments"
                            ? styles.mobileNavLinkActive
                            : ""
                        }`}
                        onClick={() => handleSectionChange("appointments")}
                      >
                        <svg
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
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
                            strokeWidth={2}
                          />
                          <line
                            x1="16"
                            y1="2"
                            x2="16"
                            y2="6"
                            strokeLinecap="round"
                            strokeWidth={2}
                          />
                          <line
                            x1="8"
                            y1="2"
                            x2="8"
                            y2="6"
                            strokeLinecap="round"
                            strokeWidth={2}
                          />
                          <line
                            x1="3"
                            y1="10"
                            x2="21"
                            y2="10"
                            strokeLinecap="round"
                            strokeWidth={2}
                          />
                        </svg>
                        <span>Appointments</span>
                      </button>
                    )}
                    {orderBookingEnabled && (
                      <button
                        className={`${styles.mobileNavLink} ${
                          activeSection === "orders"
                            ? styles.mobileNavLinkActive
                            : ""
                        }`}
                        onClick={() => handleSectionChange("orders")}
                      >
                        <svg
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                          <path
                            d="M3.27 6.96L12 12.01l8.73-5.05"
                            strokeLinecap="round"
                            strokeWidth={2}
                          />
                          <path
                            d="M12 22.08V12"
                            strokeLinecap="round"
                            strokeWidth={2}
                          />
                        </svg>
                        <span>Orders</span>
                      </button>
                    )}
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "bot-settings"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("bot-settings")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="3"
                          y="11"
                          width="18"
                          height="10"
                          rx="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                        <circle
                          cx="12"
                          cy="5"
                          r="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                        <path
                          d="M12 7v4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                      <span>AI Settings</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "preview-bot"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("preview-bot")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                        <circle cx="9" cy="10" r="2" strokeWidth={2} />
                        <circle cx="15" cy="10" r="2" strokeWidth={2} />
                        <path
                          d="M8 16C8 16 9.5 18 12 18C14.5 18 16 16 16 16"
                          strokeLinecap="round"
                          strokeWidth={2}
                        />
                      </svg>
                      <span>Preview Bot</span>
                    </button>
                    <button
                      className={`${styles.mobileNavLink} ${
                        activeSection === "settings"
                          ? styles.mobileNavLinkActive
                          : ""
                      }`}
                      onClick={() => handleSectionChange("settings")}
                    >
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                        />
                      </svg>
                      <span>Settings</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {isMobile ? (
            <div className={styles.mobileContent}>{children}</div>
          ) : (
            children
          )}
        </main>
      </div>
    </AuthProvider>
  );
}
