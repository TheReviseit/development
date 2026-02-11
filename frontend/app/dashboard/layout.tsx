"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";
import DashboardSidebar from "./components/DashboardSidebar";
import { AuthProvider } from "@/app/components/auth/AuthProvider";
import { DashboardAuthGuard } from "./components/DashboardAuthGuard";
import {
  detectProductDomain,
  getDomainVisibility,
  type ProductDomain,
} from "@/lib/domain-navigation";
import styles from "./dashboard.module.css";

type Section =
  | "analytics"
  | "messages"
  | "bulk-messages"
  | "templates"
  | "contacts"
  | "campaigns"
  | "appointments"
  | "services"
  | "orders"
  | "products"
  | "showcase" // ✅ Added showcase
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
  services: "Services",
  orders: "Orders",
  products: "Products",
  showcase: "Showcase", // ✅ Added showcase
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
  if (pathname.includes("/services")) return "services";
  if (pathname.includes("/appointments")) return "appointments";
  if (pathname.includes("/orders")) return "orders";
  if (pathname.includes("/products")) return "products";
  if (pathname.includes("/showcase")) return "showcase"; // ✅ Added showcase
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
  const [user, setUser] = useState<any | null>(null); // Local user state for backward compatibility
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [expandedMobileItems, setExpandedMobileItems] = useState<string[]>([]);
  const [currentDomain, setCurrentDomain] =
    useState<ProductDomain>("dashboard");
  const [appointmentBookingEnabled, setAppointmentBookingEnabled] =
    useState(false);
  const [orderBookingEnabled, setOrderBookingEnabled] = useState(false);
  const [productsEnabled, setProductsEnabled] = useState(false);
  const [showcaseEnabled, setShowcaseEnabled] = useState(false);
  // Mobile menu hide feature state
  const [mobileHideMode, setMobileHideMode] = useState(false);
  const [mobileHiddenItems, setMobileHiddenItems] = useState<string[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const LONG_PRESS_DURATION = 500; // ms
  // Items that cannot be hidden (essential navigation)
  const NON_HIDEABLE_ITEMS = ["analytics", "messages"];
  const router = useRouter();
  const pathname = usePathname();

  const activeSection = getActiveSection(pathname);

  // Detect current domain on mount (enterprise-grade detection)
  useEffect(() => {
    const domain = detectProductDomain();
    setCurrentDomain(domain);
  }, []);

  // Get visibility rules for current domain
  const visibility = getDomainVisibility(currentDomain);

  // Fetch AI capabilities for mobile menu
  useEffect(() => {
    const fetchCapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        if (data.success && data.data) {
          setAppointmentBookingEnabled(
            data.data.appointment_booking_enabled || false,
          );
          setOrderBookingEnabled(data.data.order_booking_enabled || false);
          setProductsEnabled(data.data.products_enabled || false);
          setShowcaseEnabled(data.data.showcase_enabled || false);
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
        products_enabled?: boolean;
      }>;
      if (customEvent.detail) {
        setAppointmentBookingEnabled(
          customEvent.detail.appointment_booking_enabled,
        );
        if (customEvent.detail.order_booking_enabled !== undefined) {
          setOrderBookingEnabled(customEvent.detail.order_booking_enabled);
        }
        if (customEvent.detail.products_enabled !== undefined) {
          setProductsEnabled(customEvent.detail.products_enabled);
        }
        if ((customEvent.detail as any).showcase_enabled !== undefined) {
          setShowcaseEnabled((customEvent.detail as any).showcase_enabled);
        }
      } else {
        fetchCapabilities();
      }
    };
    window.addEventListener(
      "ai-capabilities-updated",
      handleUpdate as EventListener,
    );
    return () =>
      window.removeEventListener(
        "ai-capabilities-updated",
        handleUpdate as EventListener,
      );
  }, []);

  // Detect mobile screen
  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setShowMobileMenu(false);
    setMobileHideMode(false); // Also exit hide mode when navigating
    if (isMobile) setIsSidebarOpen(false);
  }, [pathname, isMobile]);

  // Load hidden items from localStorage (synced with desktop sidebar)
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-hidden-items");
    if (stored) {
      try {
        setMobileHiddenItems(JSON.parse(stored));
      } catch {
        setMobileHiddenItems([]);
      }
    }
  }, []);

  // Toggle hide item and sync with localStorage
  const toggleMobileHideItem = useCallback(
    (itemId: string) => {
      // Prevent hiding essential items
      if (NON_HIDEABLE_ITEMS.includes(itemId)) return;

      setMobileHiddenItems((prev) => {
        const newHiddenItems = prev.includes(itemId)
          ? prev.filter((id) => id !== itemId)
          : [...prev, itemId];
        localStorage.setItem(
          "sidebar-hidden-items",
          JSON.stringify(newHiddenItems),
        );
        // Dispatch event to notify desktop sidebar
        window.dispatchEvent(new CustomEvent("sidebar-hidden-items-updated"));
        return newHiddenItems;
      });
    },
    [NON_HIDEABLE_ITEMS],
  );

  // Long-press handlers for mobile menu
  const handleLongPressStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setMobileHideMode(true);
    }, LONG_PRESS_DURATION);
  }, [LONG_PRESS_DURATION]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Check if an item can be hidden
  const canHideItem = useCallback(
    (itemId: string) => {
      return !NON_HIDEABLE_ITEMS.includes(itemId);
    },
    [NON_HIDEABLE_ITEMS],
  );

  // Confirm hide mode (save and exit)
  const confirmMobileHideMode = useCallback(() => {
    setMobileHideMode(false);
  }, []);

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
      <DashboardAuthGuard
        setUser={setUser}
        setLoading={setLoading}
        user={user}
      />
      {loading ? (
        <SpaceshipLoader text="Loading dashboard..." />
      ) : (
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

          {/* Desktop Sidebar - Hidden on mobile */}
          {!isMobile && (
            <DashboardSidebar
              activeSection={activeSection}
              onSectionChange={(section) =>
                handleSectionChange(section as Section)
              }
              userEmail={user?.email || undefined}
              userName={user?.displayName || undefined}
              isSidebarOpen={isSidebarOpen}
            />
          )}

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
                  <div className={styles.mobileHeaderActions}>
                    <button
                      className={`${styles.mobileMenuBtn} ${mobileHideMode ? styles.mobileMenuBtnHideMode : ""}`}
                      onClick={() => {
                        if (mobileHideMode) {
                          confirmMobileHideMode();
                        } else {
                          setShowMobileMenu(!showMobileMenu);
                        }
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {mobileHideMode ? (
                          // Checkmark icon when in hide mode
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        ) : showMobileMenu ? (
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
                      onClick={() => {
                        if (!mobileHideMode) {
                          setShowMobileMenu(false);
                        }
                      }}
                    />
                    <div
                      className={`${styles.mobileMenuDropdown} ${mobileHideMode ? styles.mobileMenuDropdownHideMode : ""}`}
                      style={{ zIndex: 100 }}
                      onTouchStart={handleLongPressStart}
                      onTouchEnd={handleLongPressEnd}
                      onTouchCancel={handleLongPressEnd}
                      onMouseDown={handleLongPressStart}
                      onMouseUp={handleLongPressEnd}
                      onMouseLeave={handleLongPressEnd}
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
                      {/* Bulk Messages - hideable */}
                      {/* Commented out as requested
                    {(mobileHideMode ||
                      !mobileHiddenItems.includes("bulk-messages")) && (
                      <div className={styles.mobileNavItemWrapper}>
                        {mobileHideMode && canHideItem("bulk-messages") && (
                          <button
                            className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("bulk-messages") ? styles.mobileHideCheckboxChecked : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMobileHideItem("bulk-messages");
                            }}
                          >
                            {mobileHiddenItems.includes("bulk-messages") && (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path
                                  d="M5 13l4 4L19 7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          className={`${styles.mobileNavLink} ${
                            activeSection === "bulk-messages"
                              ? styles.mobileNavLinkActive
                              : ""
                          } ${mobileHiddenItems.includes("bulk-messages") ? styles.mobileNavLinkHidden : ""}`}
                          onClick={() =>
                            !mobileHideMode &&
                            handleSectionChange("bulk-messages")
                          }
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
                      </div>
                    )}
                    */}
                      {/* Templates - hideable */}
                      {/* Commented out as requested
                    {(mobileHideMode ||
                      !mobileHiddenItems.includes("templates")) && (
                      <div className={styles.mobileNavItemWrapper}>
                        {mobileHideMode && canHideItem("templates") && (
                          <button
                            className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("templates") ? styles.mobileHideCheckboxChecked : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMobileHideItem("templates");
                            }}
                          >
                            {mobileHiddenItems.includes("templates") && (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path
                                  d="M5 13l4 4L19 7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          className={`${styles.mobileNavLink} ${activeSection === "templates" ? styles.mobileNavLinkActive : ""} ${mobileHiddenItems.includes("templates") ? styles.mobileNavLinkHidden : ""}`}
                          onClick={() =>
                            !mobileHideMode && handleSectionChange("templates")
                          }
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
                      </div>
                    )}
                    */}
                      {/* Contacts - hideable */}
                      {/* Commented out as requested
                    {(mobileHideMode ||
                      !mobileHiddenItems.includes("contacts")) && (
                      <div className={styles.mobileNavItemWrapper}>
                        {mobileHideMode && canHideItem("contacts") && (
                          <button
                            className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("contacts") ? styles.mobileHideCheckboxChecked : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMobileHideItem("contacts");
                            }}
                          >
                            {mobileHiddenItems.includes("contacts") && (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path
                                  d="M5 13l4 4L19 7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          className={`${styles.mobileNavLink} ${activeSection === "contacts" ? styles.mobileNavLinkActive : ""} ${mobileHiddenItems.includes("contacts") ? styles.mobileNavLinkHidden : ""}`}
                          onClick={() =>
                            !mobileHideMode && handleSectionChange("contacts")
                          }
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
                      </div>
                    )}
                    */}
                      {/* Campaigns - hideable */}
                      {/* Commented out as requested
                    {(mobileHideMode ||
                      !mobileHiddenItems.includes("campaigns")) && (
                      <div className={styles.mobileNavItemWrapper}>
                        {mobileHideMode && canHideItem("campaigns") && (
                          <button
                            className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("campaigns") ? styles.mobileHideCheckboxChecked : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMobileHideItem("campaigns");
                            }}
                          >
                            {mobileHiddenItems.includes("campaigns") && (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path
                                  d="M5 13l4 4L19 7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          className={`${styles.mobileNavLink} ${activeSection === "campaigns" ? styles.mobileNavLinkActive : ""} ${mobileHiddenItems.includes("campaigns") ? styles.mobileNavLinkHidden : ""}`}
                          onClick={() =>
                            !mobileHideMode && handleSectionChange("campaigns")
                          }
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
                      </div>
                    )}
                    */}
                      {/* Appointments - domain-aware only */}
                      {visibility.appointments && (
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
                      {/* Services - domain-aware only */}
                      {visibility.services && (
                        <button
                          className={`${styles.mobileNavLink} ${
                            activeSection === "services"
                              ? styles.mobileNavLinkActive
                              : ""
                          }`}
                          onClick={() => handleSectionChange("services")}
                        >
                          <svg
                            width="20"
                            height="20"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <rect
                              x="2"
                              y="7"
                              width="20"
                              height="14"
                              rx="2"
                              ry="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                            />
                            <path
                              d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                            />
                          </svg>
                          <span>Services</span>
                        </button>
                      )}
                      {/* Orders - domain-aware only */}
                      {visibility.orders && (
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
                      {/* Products - domain-aware only */}
                      {visibility.products && (
                        <div className={styles.mobileNavItemWrapper}>
                          <button
                            className={`${styles.mobileNavLink} ${
                              activeSection === "products" ||
                              expandedMobileItems.includes("products")
                                ? styles.mobileNavLinkActive
                                : ""
                            }`}
                            onClick={() => {
                              setExpandedMobileItems((prev) =>
                                prev.includes("products")
                                  ? prev.filter((id) => id !== "products")
                                  : [...prev, "products"],
                              );
                            }}
                          >
                            <svg
                              width="20"
                              height="20"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                              <line
                                x1="3"
                                y1="6"
                                x2="21"
                                y2="6"
                                strokeWidth={2}
                              />
                              <path
                                d="M16 10a4 4 0 0 1-8 0"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                            </svg>
                            <span>Products</span>
                            <svg
                              className={`${styles.mobileChevron} ${
                                expandedMobileItems.includes("products")
                                  ? styles.mobileChevronRotated
                                  : ""
                              }`}
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>

                          {expandedMobileItems.includes("products") && (
                            <div className={styles.mobileSubNavContainer}>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/products"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/products");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Product
                              </button>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/products/add"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/products/add");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Add Product
                              </button>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/products/categories"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/products/categories");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Add Category
                              </button>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/products/options"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/products/options");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Add Size and Colors
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Showcase - domain-aware only */}
                      {visibility.showcase && (
                        <div className={styles.mobileNavItemWrapper}>
                          <button
                            className={`${styles.mobileNavLink} ${
                              activeSection === "showcase" ||
                              expandedMobileItems.includes("showcase")
                                ? styles.mobileNavLinkActive
                                : ""
                            }`}
                            onClick={() => {
                              setExpandedMobileItems((prev) =>
                                prev.includes("showcase")
                                  ? prev.filter((id) => id !== "showcase")
                                  : [...prev, "showcase"],
                              );
                            }}
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
                                width="7"
                                height="7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                              <rect
                                x="14"
                                y="3"
                                width="7"
                                height="7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                              <rect
                                x="14"
                                y="14"
                                width="7"
                                height="7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                              <rect
                                x="3"
                                y="14"
                                width="7"
                                height="7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                              />
                            </svg>
                            <span>Showcase</span>
                            <svg
                              className={`${styles.mobileChevron} ${
                                expandedMobileItems.includes("showcase")
                                  ? styles.mobileChevronRotated
                                  : ""
                              }`}
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>

                          {expandedMobileItems.includes("showcase") && (
                            <div className={styles.mobileSubNavContainer}>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/showcase/products"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/showcase/products");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Products
                              </button>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname ===
                                  "/dashboard/showcase/products/add"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push(
                                    "/dashboard/showcase/products/add",
                                  );
                                  setShowMobileMenu(false);
                                }}
                              >
                                Add Product
                              </button>
                              <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/showcase/bookings"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/showcase/bookings");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Bookings
                              </button>
                              {/* Pages Settings - hidden for now */}
                              {/* <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/dashboard/showcase/settings"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/dashboard/showcase/settings");
                                  setShowMobileMenu(false);
                                }}
                              >
                                Pages Settings
                              </button> */}
                            </div>
                          )}
                        </div>
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
                      {/* Preview Bot - hideable */}
                      {(mobileHideMode ||
                        !mobileHiddenItems.includes("preview-bot")) && (
                        <div className={styles.mobileNavItemWrapper}>
                          {mobileHideMode && canHideItem("preview-bot") && (
                            <button
                              className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("preview-bot") ? styles.mobileHideCheckboxChecked : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMobileHideItem("preview-bot");
                              }}
                            >
                              {mobileHiddenItems.includes("preview-bot") && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <path
                                    d="M5 13l4 4L19 7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </button>
                          )}
                          <button
                            className={`${styles.mobileNavLink} ${activeSection === "preview-bot" ? styles.mobileNavLinkActive : ""} ${mobileHiddenItems.includes("preview-bot") ? styles.mobileNavLinkHidden : ""}`}
                            onClick={() =>
                              !mobileHideMode &&
                              handleSectionChange("preview-bot")
                            }
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
                        </div>
                      )}
                      {/* Settings - hideable */}
                      {(mobileHideMode ||
                        !mobileHiddenItems.includes("settings")) && (
                        <div className={styles.mobileNavItemWrapper}>
                          {mobileHideMode && canHideItem("settings") && (
                            <button
                              className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("settings") ? styles.mobileHideCheckboxChecked : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMobileHideItem("settings");
                              }}
                            >
                              {mobileHiddenItems.includes("settings") && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <path
                                    d="M5 13l4 4L19 7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </button>
                          )}
                          <button
                            className={`${styles.mobileNavLink} ${activeSection === "settings" ? styles.mobileNavLinkActive : ""} ${mobileHiddenItems.includes("settings") ? styles.mobileNavLinkHidden : ""}`}
                            onClick={() =>
                              !mobileHideMode && handleSectionChange("settings")
                            }
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
                      )}
                      <button
                        className={styles.mobileNavLink}
                        onClick={() => {
                          setShowMobileMenu(false);
                          router.push("/dashboard/profile");
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                          <circle
                            cx="12"
                            cy="7"
                            r="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                        </svg>
                        <span>Profile</span>
                      </button>
                      <button
                        className={`${styles.mobileNavLink} ${styles.mobileNavLinkLogout}`}
                        onClick={async () => {
                          setShowMobileMenu(false);
                          try {
                            await fetch("/api/auth/logout", { method: "POST" });
                            window.location.href = "/login";
                          } catch (error) {
                            console.error("Logout error:", error);
                          }
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                          <polyline
                            points="16 17 21 12 16 7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                          <line
                            x1="21"
                            y1="12"
                            x2="9"
                            y2="12"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                        </svg>
                        <span>Logout</span>
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
      )}
    </AuthProvider>
  );
}
