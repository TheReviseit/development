"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import SpaceshipLoader from "@/app/components/loading/SpaceshipLoader";
import DashboardSidebar from "./components/DashboardSidebar";
import { AuthProvider } from "@/app/components/auth/AuthProvider";
import { DashboardAuthGuard } from "./components/DashboardAuthGuard";
import { getDomainVisibility, type ProductDomain } from "@/lib/domain/config";
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import { auth } from "@/src/firebase/firebase";
import SoftLimitBanner from "./components/SoftLimitBanner";
import SubscriptionGateOverlay from "./components/SubscriptionGateOverlay";
import BillingLockScreen, {
  type BillingLockReason,
} from "./components/BillingLockScreen";
import {
  SubscriptionProvider,
  useSubscriptionContext,
} from "./components/SubscriptionProvider";
import { Bell, Search, Store } from "lucide-react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { useUiState } from "@/app/components/auth/UiStateProvider";
import styles from "./dashboard.module.css";
import CommandPalette from "./components/CommandPalette";

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
  | "showcase-manager"
  | "forms"
  | "files"
  | "bot-settings"
  | "preview-bot"
  | "settings"
  | "profile";

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
  "showcase-manager": "Showcase", // ✅ Added showcase
  forms: "Forms", // ✅ Added forms
  files: "Tools",
  "bot-settings": "AI Settings",
  "preview-bot": "Preview Bot",
  settings: "Settings",
  profile: "Store Settings",
};

// Map pathname to section
const getActiveSection = (pathname: string): Section => {
  // Check profile first to avoid defaulting to analytics on profile pages
  if (pathname.includes("/profile")) return "profile";
  if (pathname.includes("/forms")) return "forms";

  if (pathname.includes("/bulk-messages")) return "bulk-messages";
  if (pathname.includes("/messages")) return "messages";
  if (pathname.includes("/templates")) return "templates";
  if (pathname.includes("/contacts")) return "contacts";
  if (pathname.includes("/campaigns")) return "campaigns";
  if (pathname.includes("/services")) return "services";
  if (pathname.includes("/appointments")) return "appointments";
  if (pathname.includes("/orders")) return "orders";
  if (pathname.includes("/products")) return "products";
  if (pathname.includes("/showcase-manager")) return "showcase-manager";
  if (pathname.includes("/files")) return "files";
  if (pathname.includes("/bot-settings")) return "bot-settings";
  if (pathname.includes("/preview-bot")) return "preview-bot";
  if (pathname.includes("/settings")) return "settings";
  return "analytics";
};

const getMobileHeaderTitle = (pathname: string, activeSection: Section) => {
  if (pathname.includes('/products/add')) return 'Add Product';
  if (pathname.includes('/products/banners')) return 'Store Banners';
  if (pathname.includes('/products/categories')) return 'Categories';
  if (pathname.includes('/products/options')) return 'Sizes & Colors';
  if (pathname.includes('/products/') && !pathname.endsWith('/products')) return 'Edit Product';
  return sectionLabels[activeSection] || 'Dashboard';
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any | null>(null); // Local user state for backward compatibility
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [expandedMobileItems, setExpandedMobileItems] = useState<string[]>([]);
  // Product domain is resolved from the middleware-set cookie
  // This replaces the hardcoded "dashboard" that was causing feature leakage
  const [currentDomain, setCurrentDomain] =
    useState<ProductDomain>("dashboard");
  const [appointmentBookingEnabled, setAppointmentBookingEnabled] =
    useState(false);
  const [orderBookingEnabled, setOrderBookingEnabled] = useState(false);
  const [productsEnabled, setProductsEnabled] = useState(false);
  const [showcaseEnabled, setShowcaseEnabled] = useState(false);
  // Mobile menu hide feature state
  const mobileHideMode = false;
  const setMobileHideMode = (_val: boolean) => {};
  const mobileHiddenItems: string[] = [];
  const setMobileHiddenItems = (_val: any) => {};
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const LONG_PRESS_DURATION = 500; // ms
  // Items that cannot be hidden (essential navigation)
  const NON_HIDEABLE_ITEMS = ["analytics", "messages"];
  const [upgradeStatus, setUpgradeStatus] = useState<
    "idle" | "verifying" | "success" | "error"
  >("idle");
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
  const upgradeVerifiedRef = useRef(false);
  // ── Domain Subscription Gate ──────────────────────────────────────
  const [subscribedDomains, setSubscribedDomains] = useState<string[]>([
    "dashboard",
    "files",
  ]);
  const [domainAccessLoaded, setDomainAccessLoaded] = useState(false);
  // ── Billing Status Gate ───────────────────────────────────────────
  // NOW HANDLED BY SubscriptionProvider + useSubscription() hook
  // Uses React Query with 30s staleTime, retry, timeout, bounded fail-open
  const router = useRouter();
  const pathname = usePathname();

  const activeSection = getActiveSection(pathname);

  // ── Upgrade Payment Verification ─────────────────────────────────────
  // Triggered when `user` state is set (auth complete + onboarding verified).
  // Checks URL for ?upgrade=success OR sessionStorage flag, then calls
  // verify-payment. The backend finds the pending upgrade by user_id alone.
  useEffect(() => {
    if (!user || upgradeVerifiedRef.current) return;

    // Check both URL params and sessionStorage (Razorpay handler is unreliable)
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("upgrade") === "success";
    const fromStorage =
      sessionStorage.getItem("flowauxi_upgrade_pending") === "1";

    if (!fromUrl && !fromStorage) return;

    upgradeVerifiedRef.current = true;
    sessionStorage.removeItem("flowauxi_upgrade_pending");
    setUpgradeStatus("verifying");

    const verifyPayment = async () => {
      try {
        const { auth } = await import("@/src/firebase/firebase");
        const firebaseUser = auth.currentUser;

        if (!firebaseUser) {
          setUpgradeStatus("error");
          setUpgradeMessage("Not authenticated. Please refresh and try again.");
          return;
        }

        console.log(
          "[Upgrade] Calling verify-payment for user",
          firebaseUser.uid,
        );

        const idToken = await firebaseUser.getIdToken();
        const currentDomain = getProductDomainFromBrowser();
        const res = await fetch("/api/upgrade/verify-payment", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ domain: currentDomain }),
        });

        const result = await res.json();
        console.log("[Upgrade] verify-payment response:", result);

        if (res.ok && result.success) {
          setUpgradeStatus("success");
          setUpgradeMessage("Plan upgraded successfully!");
          // Clean up URL params
          window.history.replaceState({}, "", window.location.pathname);
          // Force refetch of subscription/entitlement data
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("subscription-updated"));
            router.refresh();
          }, 1500);
        } else {
          setUpgradeStatus("error");
          setUpgradeMessage(
            result.message ||
              "Upgrade verification failed. Your payment was received — it will activate shortly via webhook.",
          );
        }
      } catch (err) {
        console.error("[Upgrade] verify error:", err);
        setUpgradeStatus("error");
        setUpgradeMessage(
          "Could not verify upgrade. Your payment was received — it will activate shortly.",
        );
      }
    };

    verifyPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Read product domain using resolveDomain() — same function as middleware
  useEffect(() => {
    const domain = getProductDomainFromBrowser();
    setCurrentDomain(domain);
  }, []);

  // ── Billing Status Gate ─────────────────────────────────────────────────────
  // NOW HANDLED BY SubscriptionProvider (React Query cached)
  // - 30s staleTime (prevents hammering /billing-status)
  // - Refetch on window focus (catch real-time trial expiry)
  // - 2 retries with exponential backoff
  // - 3s timeout per request
  // - Bounded fail-open (30s grace, then lock)
  // - Listens for 'subscription-updated' event → invalidate cache

  useEffect(() => {
    setDomainAccessLoaded(false);

    if (loading || !user) {
      return;
    }

    if (currentDomain === "dashboard" || currentDomain === "files") {
      setSubscribedDomains((prev) =>
        prev.includes(currentDomain) ? prev : [...prev, currentDomain],
      );
      setDomainAccessLoaded(true);
      return;
    }

    const checkDomainAccess = async () => {
      try {
        const res = await fetch(
          `/api/subscription/check-domain?domain=${currentDomain}`,
          { credentials: "include" },
        );

        if (res.ok) {
          const data = await res.json();
          if (data.hasAccess) {
            // User has access to this domain
            setSubscribedDomains((prev) =>
              prev.includes(currentDomain) ? prev : [...prev, currentDomain],
            );
          }
        }
      } catch (err) {
        // Fail-safe: don't block access on network errors
        console.warn("[Dashboard] Failed to check domain access:", err);
        setSubscribedDomains((prev) =>
          prev.includes(currentDomain) ? prev : [...prev, currentDomain],
        );
      } finally {
        setDomainAccessLoaded(true);
      }
    };

    checkDomainAccess();
  }, [currentDomain, loading, user]);

  // Get visibility rules for current domain (re-computed when domain is resolved)
  const visibility = getDomainVisibility(currentDomain);

  // Fetch AI capabilities for mobile menu
  useEffect(() => {
    if (loading || !user) {
      return;
    }

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
  }, [loading, user]);

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

    // Auto-collapse sidebar on specific pages like Form Builder
    if (!isMobile) {
      if (pathname.includes("/forms/builder")) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
      }
    }
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

      setMobileHiddenItems((prev: string[]) => {
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
      router.push("/home");
    } else {
      router.push(`/${section}`);
    }
  };

  // ════════════════════════════════════════════════════════════════════
  // BILLING SUSPENSION GATE — Full dashboard lock
  // ════════════════════════════════════════════════════════════════════
  // NOW USES SubscriptionProvider (React Query cached) for billing state.
  // This gate wraps everything in SubscriptionProvider first, then uses
  // BillingGateInner to read state and conditionally early-return.
  // ════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════
  // DOMAIN ACCESS GATE — Production-grade: NO dashboard content renders
  // ════════════════════════════════════════════════════════════════════
  // If the user doesn't have access to this product domain, we EARLY
  // RETURN with only the gate page. The entire dashboard (sidebar,
  // mobile menu, children, API calls) is never mounted in the DOM.
  // This cannot be bypassed via DevTools — there's nothing to delete.
  if (loading || !user) {
    return (
      <AuthProvider>
        <DashboardAuthGuard
          setUser={setUser}
          setLoading={setLoading}
          user={user}
        />
        <SpaceshipLoader text="Loading dashboard..." />
      </AuthProvider>
    );
  }

  const isDomainGated =
    domainAccessLoaded &&
    currentDomain !== "dashboard" &&
    currentDomain !== "files" &&
    !subscribedDomains.includes(currentDomain);

  if (isDomainGated) {
    return (
      <AuthProvider>
        <DashboardAuthGuard
          setUser={setUser}
          setLoading={setLoading}
          user={user}
        />
        <SubscriptionGateOverlay
          currentDomain={currentDomain}
          userEmail={user?.email}
        />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <DashboardAuthGuard
        setUser={setUser}
        setLoading={setLoading}
        user={user}
      />
      <SubscriptionProvider>
        <BillingGateInner
          loading={loading}
          user={user}
          setUser={setUser}
          setLoading={setLoading}
        >
          {loading ? (
            <SpaceshipLoader text="Loading dashboard..." />
          ) : (
            <div className={styles.appContainer}>
              {/* Desktop Top Header (Shopify Style) */}
              {!isMobile && (
                <header className={styles.topHeader}>
                  <div className={styles.topHeaderLeft}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src="/logo.png" alt="Flowauxi" className={styles.headerLogo} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                      <span style={{ color: '#ffffff', fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.5px' }}>Flowauxi</span>
                    </div>
                  </div>
                  <div className={styles.topHeaderCenter}>
                    <div 
                      className={styles.searchBar}
                      onClick={() => setIsCommandPaletteOpen(true)}
                    >
                      <div className={styles.searchBarLeft}>
                        <Search size={16} className={styles.searchIcon} strokeWidth={2} />
                        <input 
                          ref={searchInputRef}
                          type="text" 
                          placeholder="Search" 
                          className={styles.searchInput}
                          readOnly
                          style={{ cursor: "pointer" }}
                        />
                      </div>
                      <div className={styles.searchShortcut}>
                        <kbd>CTRL</kbd>
                        <kbd>K</kbd>
                      </div>
                    </div>
                  </div>
                  <div className={styles.topHeaderRight}>
                    <StoreIconRenderer />
                    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} className="hover:opacity-80 transition-opacity">
                      <Bell size={20} color="#ffffff" strokeWidth={2.25} />
                    </div>
                  </div>
                </header>
              )}
              
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
                    userName={user?.full_name || user?.displayName || undefined}
                    isSidebarOpen={isSidebarOpen}
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                    productDomain={currentDomain}
                  />
              )}

              <main className={`${styles.mainContent} ${activeSection === 'messages' ? styles.messagesMainContent : ''}`}>
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
                          {getMobileHeaderTitle(pathname, activeSection)}
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
                          {/* Bulk Messages - Domain-based visibility */}
                          {visibility.bulkMessages &&
                            (mobileHideMode ||
                              !mobileHiddenItems.includes("bulk-messages")) && (
                              <div className={styles.mobileNavItemWrapper}>
                                {mobileHideMode &&
                                  canHideItem("bulk-messages") && (
                                    <button
                                      className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("bulk-messages") ? styles.mobileHideCheckboxChecked : ""}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMobileHideItem("bulk-messages");
                                      }}
                                    >
                                      {mobileHiddenItems.includes(
                                        "bulk-messages",
                                      ) && (
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
                          {/* Templates - Domain-based visibility */}
                          {visibility.templates &&
                            (mobileHideMode ||
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
                                    {mobileHiddenItems.includes(
                                      "templates",
                                    ) && (
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
                                    !mobileHideMode &&
                                    handleSectionChange("templates")
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
                          {/* Forms - Domain-based visibility */}
                          {visibility.forms &&
                            (mobileHideMode ||
                              !mobileHiddenItems.includes("forms")) && (
                              <div className={styles.mobileNavItemWrapper}>
                                {mobileHideMode && canHideItem("forms") && (
                                  <button
                                    className={`${styles.mobileHideCheckbox} ${mobileHiddenItems.includes("forms") ? styles.mobileHideCheckboxChecked : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleMobileHideItem("forms");
                                    }}
                                  >
                                    {mobileHiddenItems.includes("forms") && (
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
                                  className={`${styles.mobileNavLink} ${activeSection === "forms" ? styles.mobileNavLinkActive : ""} ${mobileHiddenItems.includes("forms") ? styles.mobileNavLinkHidden : ""}`}
                                  onClick={() =>
                                    !mobileHideMode &&
                                    handleSectionChange("forms")
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
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                    />
                                  </svg>
                                  <span>Forms</span>
                                </button>
                              </div>
                            )}
                          {/* Contacts - Domain-based visibility */}
                          {visibility.contacts &&
                            (mobileHideMode ||
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
                                    !mobileHideMode &&
                                    handleSectionChange("contacts")
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
                          {/* Campaigns - Domain-based visibility */}
                          {visibility.campaigns &&
                            (mobileHideMode ||
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
                                    {mobileHiddenItems.includes(
                                      "campaigns",
                                    ) && (
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
                                    !mobileHideMode &&
                                    handleSectionChange("campaigns")
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
                          {/* Appointments - domain-aware only */}
                          {visibility.appointments && (
                            <button
                              className={`${styles.mobileNavLink} ${
                                activeSection === "appointments"
                                  ? styles.mobileNavLinkActive
                                  : ""
                              }`}
                              onClick={() =>
                                handleSectionChange("appointments")
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

                          <StoreIconMobileRenderer closeMenu={() => { setShowMobileMenu(false); }} />
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
                                      pathname === "/products"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push("/products");
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Product
                                  </button>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname === "/products/add"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push("/products/add");
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Add Product
                                  </button>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname === "/products/banners"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push("/products/banners");
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Add Banners
                                  </button>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname ===
                                      "/products/categories"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push(
                                        "/products/categories",
                                      );
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Add Category
                                  </button>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname === "/products/options"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push(
                                        "/products/options",
                                      );
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
                                  activeSection === "showcase-manager" ||
                                  expandedMobileItems.includes("showcase-manager")
                                    ? styles.mobileNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setExpandedMobileItems((prev) =>
                                    prev.includes("showcase-manager")
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
                                    expandedMobileItems.includes("showcase-manager")
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

                              {expandedMobileItems.includes("showcase-manager") && (
                                <div className={styles.mobileSubNavContainer}>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname ===
                                      "/showcase-manager/products"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push(
                                        "/showcase-manager/products",
                                      );
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Products
                                  </button>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname ===
                                      "/showcase-manager/products/add"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push(
                                        "/showcase-manager/products/add",
                                      );
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Add Product
                                  </button>
                                  <button
                                    className={`${styles.mobileSubNavLink} ${
                                      pathname ===
                                      "/showcase-manager/bookings"
                                        ? styles.mobileSubNavLinkActive
                                        : ""
                                    }`}
                                    onClick={() => {
                                      router.push(
                                        "/showcase-manager/bookings",
                                      );
                                      setShowMobileMenu(false);
                                    }}
                                  >
                                    Bookings
                                  </button>
                                  {/* Pages Settings - hidden for now */}
                                  {/* <button
                                className={`${styles.mobileSubNavLink} ${
                                  pathname === "/showcase-manager/settings"
                                    ? styles.mobileSubNavLinkActive
                                    : ""
                                }`}
                                onClick={() => {
                                  router.push("/showcase-manager/settings");
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
                          {/* (mobileHideMode ||
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
                                  {mobileHiddenItems.includes(
                                    "preview-bot",
                                  ) && (
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
                                  <circle
                                    cx="9"
                                    cy="10"
                                    r="2"
                                    strokeWidth={2}
                                  />
                                  <circle
                                    cx="15"
                                    cy="10"
                                    r="2"
                                    strokeWidth={2}
                                  />
                                  <path
                                    d="M8 16C8 16 9.5 18 12 18C14.5 18 16 16 16 16"
                                    strokeLinecap="round"
                                    strokeWidth={2}
                                  />
                                </svg>
                                <span>Preview Bot</span>
                              </button>
                            </div>
                          ) */}

                          <button
                            className={styles.mobileNavLink}
                            onClick={() => {
                              setShowMobileMenu(false);
                              router.push("/profile");
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
                                await fetch("/api/auth/logout", {
                                  method: "POST",
                                  credentials: "include",
                                });
                                // CRITICAL: also sign out from Firebase client.
                                // Otherwise Firebase persistence keeps the user logged-in
                                // and /login auto-redirects back to dashboard.
                                try {
                                  await auth.signOut();
                                } catch {}
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

                {/* Upgrade Verification Banner */}
                {upgradeStatus !== "idle" && (
                  <div
                    style={{
                      padding: "12px 20px",
                      margin: "0 0 8px 0",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      backgroundColor:
                        upgradeStatus === "verifying"
                          ? "#FFF8E1"
                          : upgradeStatus === "success"
                            ? "#E8F5E9"
                            : "#FFF3E0",
                      color:
                        upgradeStatus === "verifying"
                          ? "#F57F17"
                          : upgradeStatus === "success"
                            ? "#2E7D32"
                            : "#E65100",
                      border: `1px solid ${
                        upgradeStatus === "verifying"
                          ? "#FFE082"
                          : upgradeStatus === "success"
                            ? "#A5D6A7"
                            : "#FFCC80"
                      }`,
                    }}
                  >
                    {upgradeStatus === "verifying" && (
                      <>
                        <svg
                          className="animate-spin"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                            opacity="0.3"
                          />
                          <path
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            fill="currentColor"
                            opacity="0.75"
                          />
                        </svg>
                        Verifying your upgrade payment...
                      </>
                    )}
                    {upgradeStatus === "success" && (
                      <>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M5 13l4 4L19 7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {upgradeMessage}
                      </>
                    )}
                    {upgradeStatus === "error" && (
                      <>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {upgradeMessage}
                      </>
                    )}
                    {upgradeStatus !== "verifying" && (
                      <button
                        onClick={() => setUpgradeStatus("idle")}
                        style={{
                          marginLeft: "auto",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "16px",
                          color: "inherit",
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>
                )}

                {/* Soft-Limit Warning Banner - appears on all dashboard pages */}
                <SoftLimitBanner />

                {isMobile ? (
                  <div className={styles.mobileContent}>{children}</div>
                ) : (
                  children
                )}
              </main>
            </div>
          </div>
          )}
          <CommandPalette open={isCommandPaletteOpen} onOpenChange={setIsCommandPaletteOpen} />
        </BillingGateInner>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

// =============================================================================
// BillingGateInner — Uses SubscriptionProvider context for billing lock
// =============================================================================
// This is a separate component because useSubscriptionContext() must be called
// inside SubscriptionProvider. The layout function itself can't call the hook
// because SubscriptionProvider is rendered inside it.
//
// Architecture: If billing is locked, this replaces ALL children with
// BillingLockScreen (early-return = zero dashboard DOM = zero bypass).
// ═══════════════════════════════════════════════════════════════════════════════
// StoreIconRenderer — FAANG-Grade O(1) Store Icon
//
// Architecture:
//   1. UiStateProvider (root layout) reads the flowauxi_ui_state cookie at
//      SSR time for O(1) rendering — zero API calls, zero DB queries.
//   2. On the client, we reconcile with useAuth() via a one-way merge:
//      if auth says configured=true, we update UiStateProvider; we never
//      overwrite true with false (protects against stale auth sync cache).
//   3. updateUser() in AuthProvider also writes to the cookie, so the
//      icon appears instantly after save AND survives page refreshes.
//   4. Cross-tab BroadcastChannel also syncs the cookie, so new tabs
//      opened after save see the icon without any network request.
// ═══════════════════════════════════════════════════════════════════════════════
function StoreIconRenderer() {
  const { user } = useAuth();
  const { uiState, mergeUiState } = useUiState();

  // One-way reconciliation: auth -> UiState (never the reverse).
  // Protects against stale auth sync in-memory cache (60s TTL).
  useEffect(() => {
    if (user?.ai_settings_configured === true) {
      mergeUiState({
        ai_settings_configured: true,
        store_slug: user.store_slug || null,
      });
    }
  }, [user, mergeUiState]);

  // Show icon if EITHER source says configured.
  // Cookie is set by the server on login/save; auth context is the
  // secondary source that reconciles after the sync API resolves.
  const showStore = uiState.ai_settings_configured || user?.ai_settings_configured === true;
  if (!showStore) return null;

  const storeUrl = user?.store_slug || uiState.store_slug
    ? `/store/${user?.store_slug || uiState.store_slug}`
    : `/store`;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginRight: '24px' }}
      className="hover:opacity-80 transition-opacity"
      onClick={() => window.open(storeUrl, "_blank")}
      title="View Store"
    >
      <Store size={20} color="#ffffff" strokeWidth={2.25} />
    </div>
  );
}

function StoreIconMobileRenderer({ closeMenu }: { closeMenu: () => void }) {
  const { user } = useAuth();
  const { uiState, mergeUiState } = useUiState();

  useEffect(() => {
    if (user?.ai_settings_configured === true) {
      mergeUiState({
        ai_settings_configured: true,
        store_slug: user.store_slug || null,
      });
    }
  }, [user, mergeUiState]);

  const showStore = uiState.ai_settings_configured || user?.ai_settings_configured === true;
  if (!showStore) return null;

  const storeUrl = user?.store_slug || uiState.store_slug
    ? `/store/${user?.store_slug || uiState.store_slug}`
    : `/store`;

  return (
    <button
      className={styles.mobileNavLink}
      onClick={() => {
        closeMenu();
        window.open(storeUrl, "_blank");
      }}
    >
      <svg
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ strokeWidth: 2.25 }}
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span>View Store</span>
    </button>
  );
}

function BillingGateInner({
  loading,
  user,
  children,
}: {
  loading: boolean;
  user: any;
  setUser: (user: any) => void;
  setLoading: (loading: boolean) => void;
  children: React.ReactNode;
}) {
  const {
    isLocked,
    lockReason,
    trial,
    isLoading: subLoading,
  } = useSubscriptionContext();

  // Wait for auth to resolve first
  if (loading) return <>{children}</>;

  // Wait for subscription status to load (avoid content flash/bypass)
  if (subLoading) return <SpaceshipLoader />;

  // BILLING LOCK: Replace entire dashboard with BillingLockScreen
  // If the client is locked but has no explicit reason, fail closed with "unknown".
  if (isLocked) {
    return (
      <BillingLockScreen
        reason={lockReason ?? "unknown"}
        userEmail={user?.email}
        trial={trial}
      />
    );
  }
  return <>{children}</>;
}
