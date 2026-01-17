"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../dashboard.module.css";

interface SubNavItem {
  id: string;
  label: string;
  href: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  href: string;
  subItems?: SubNavItem[];
}

interface AICapabilities {
  appointment_booking_enabled: boolean;
  order_booking_enabled: boolean;
  products_enabled: boolean;
}

interface DashboardSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userEmail?: string;
  userName?: string;
  isSidebarOpen?: boolean;
}

// SVG Icons as components
const AnalyticsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M18 20V10M12 20V4M6 20v-6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MessagesIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TemplatesIcon = () => (
  <svg
    width="20"
    height="20"
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
    <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" />
    <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" />
  </svg>
);

const ContactsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CampaignsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BulkMessagesIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 12h8" strokeLinecap="round" />
    <path d="M8 8h8" strokeLinecap="round" />
    <path d="M8 16h4" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle
      cx="12"
      cy="12"
      r="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BotIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect
      x="3"
      y="11"
      width="18"
      height="10"
      rx="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="5" r="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7v4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8" cy="16" r="1" fill="currentColor" />
    <circle cx="16" cy="16" r="1" fill="currentColor" />
  </svg>
);

// Preview Bot icon - robot face matching the AI Settings preview icon
const PreviewBotIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="9" cy="10" r="2" />
    <circle cx="15" cy="10" r="2" />
    <path
      d="M8 16C8 16 9.5 18 12 18C14.5 18 16 16 16 16"
      strokeLinecap="round"
    />
  </svg>
);

// Calendar icon for Appointments - matches existing icon style
const AppointmentsIcon = () => (
  <svg
    width="20"
    height="20"
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
    <path d="M8 14h.01" strokeLinecap="round" />
    <path d="M12 14h.01" strokeLinecap="round" />
    <path d="M16 14h.01" strokeLinecap="round" />
    <path d="M8 18h.01" strokeLinecap="round" />
    <path d="M12 18h.01" strokeLinecap="round" />
  </svg>
);

// Package icon for Orders
const OrdersIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.27 6.96L12 12.01l8.73-5.05"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Shopping bag icon for Products
const ProductsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path
      d="M16 10a4 4 0 0 1-8 0"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    {collapsed ? (
      <polyline
        points="9 18 15 12 9 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <polyline
        points="15 18 9 12 15 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

export default function DashboardSidebar({
  activeSection,
  onSectionChange,
  userEmail,
  userName,
  isSidebarOpen,
}: DashboardSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userCount, setUserCount] = useState<number>(0);
  const [aiCapabilities, setAiCapabilities] = useState<AICapabilities>({
    appointment_booking_enabled: false,
    order_booking_enabled: false,
    products_enabled: false,
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [showHiddenMenu, setShowHiddenMenu] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(["products"]);

  // Load hidden items from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-hidden-items");
    if (stored) {
      try {
        setHiddenItems(JSON.parse(stored));
      } catch {
        setHiddenItems([]);
      }
    }
  }, []);

  // Items that cannot be hidden (essential navigation)
  const NON_HIDEABLE_ITEMS = ["analytics", "messages", "bot-settings"];

  // Save hidden items to localStorage
  const toggleHideItem = (itemId: string) => {
    // Prevent hiding essential items
    if (NON_HIDEABLE_ITEMS.includes(itemId)) return;

    const newHiddenItems = hiddenItems.includes(itemId)
      ? hiddenItems.filter((id) => id !== itemId)
      : [...hiddenItems, itemId];
    setHiddenItems(newHiddenItems);
    localStorage.setItem(
      "sidebar-hidden-items",
      JSON.stringify(newHiddenItems),
    );
  };

  // Check if an item can be hidden
  const canHideItem = (itemId: string) => !NON_HIDEABLE_ITEMS.includes(itemId);

  // Fetch AI capabilities to determine which features to show
  useEffect(() => {
    const fetchAICapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        console.log("Sidebar: Fetched AI capabilities:", data);
        if (data.success && data.data) {
          setAiCapabilities(data.data);
        }
      } catch (error) {
        console.error("Error fetching AI capabilities:", error);
      }
    };
    fetchAICapabilities();

    // Listen for capability updates from AI Settings page
    // The event can include the new state directly to avoid re-fetching
    const handleCapabilitiesUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        appointment_booking_enabled: boolean;
        order_booking_enabled: boolean;
        products_enabled: boolean;
      }>;
      if (customEvent.detail) {
        console.log("Sidebar: Received capability update:", customEvent.detail);
        setAiCapabilities(customEvent.detail);
      } else {
        fetchAICapabilities();
      }
    };
    window.addEventListener(
      "ai-capabilities-updated",
      handleCapabilitiesUpdate as EventListener,
    );

    return () => {
      window.removeEventListener(
        "ai-capabilities-updated",
        handleCapabilitiesUpdate as EventListener,
      );
    };
  }, []);

  // Fetch the actual user/conversation count
  useEffect(() => {
    const fetchUserCount = async () => {
      try {
        const response = await fetch("/api/whatsapp/conversations?filter=all");
        const data = await response.json();
        if (data.success) {
          setUserCount(data.data.length);
        }
      } catch (error) {
        console.error("Error fetching user count:", error);
      }
    };
    fetchUserCount();
  }, []);

  // Build nav items dynamically based on AI capabilities
  const navItems: NavItem[] = [
    {
      id: "analytics",
      label: "Analytics",
      icon: <AnalyticsIcon />,
      href: "/dashboard",
    },
    {
      id: "messages",
      label: "Messages",
      icon: <MessagesIcon />,
      badge: userCount > 0 ? userCount : undefined,
      href: "/dashboard/messages",
    },
    {
      id: "bulk-messages",
      label: "Bulk Messages",
      icon: <BulkMessagesIcon />,
      href: "/dashboard/bulk-messages",
    },
    {
      id: "templates",
      label: "Templates",
      icon: <TemplatesIcon />,
      href: "/dashboard/templates",
    },
    {
      id: "contacts",
      label: "Contacts",
      icon: <ContactsIcon />,
      href: "/dashboard/contacts",
    },
    {
      id: "campaigns",
      label: "Campaigns",
      icon: <CampaignsIcon />,
      href: "/dashboard/campaigns",
    },
    // Appointments - only show when toggle is enabled
    ...(aiCapabilities.appointment_booking_enabled
      ? [
          {
            id: "appointments",
            label: "Appointments",
            icon: <AppointmentsIcon />,
            href: "/dashboard/appointments",
          },
        ]
      : []),
    // Orders - only show when toggle is enabled
    ...(aiCapabilities.order_booking_enabled
      ? [
          {
            id: "orders",
            label: "Orders",
            icon: <OrdersIcon />,
            href: "/dashboard/orders",
          },
        ]
      : []),
    // Products - only show when toggle is enabled
    ...(aiCapabilities.products_enabled
      ? [
          {
            id: "products",
            label: "Products",
            icon: <ProductsIcon />,
            href: "/dashboard/products",
            subItems: [
              {
                id: "products-list",
                label: "Product",
                href: "/dashboard/products",
              },
              {
                id: "add-product",
                label: "Add Product",
                href: "/dashboard/products/add",
              },
              {
                id: "categories",
                label: "Add Category",
                href: "/dashboard/products/categories",
              },
              {
                id: "options",
                label: "Add Size and Colors",
                href: "/dashboard/products/options",
              },
            ],
          },
        ]
      : []),
    {
      id: "bot-settings",
      label: "AI Settings",
      icon: <BotIcon />,
      href: "/dashboard/bot-settings",
    },
    {
      id: "preview-bot",
      label: "Preview Bot",
      icon: <PreviewBotIcon />,
      href: "/dashboard/preview-bot",
    },
  ];

  const displayName = userName || userEmail?.split("@")[0] || "User";
  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <aside
      className={`${styles.sidebar} ${
        isCollapsed ? styles.sidebarCollapsed : ""
      } ${isSidebarOpen ? styles.sidebarOpen : ""}`}
    >
      {/* Logo Section */}
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogo}>
          <img
            src="/logo.png"
            alt="Flowauxi"
            className={styles.logoImage}
            width={36}
            height={36}
          />
          {!isCollapsed && <span className={styles.logoText}>Flowauxi</span>}
        </div>
        <button
          className={styles.collapseBtn}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <CollapseIcon collapsed={isCollapsed} />
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.sidebarNav}>
        {navItems
          .filter((item) => !hiddenItems.includes(item.id))
          .map((item) => (
            <div key={item.id} className={styles.navItemWrapper}>
              {/* Header area - contains parent link/button and optional hide button */}
              <div className={styles.navItemHeader}>
                {/* Parent item - with or without sub-items */}
                {item.subItems && item.subItems.length > 0 ? (
                  // Expandable parent with sub-items
                  <button
                    className={`${styles.navItem} ${
                      activeSection === item.id ||
                      expandedItems.includes(item.id)
                        ? styles.navItemActive
                        : ""
                    }`}
                    onClick={() => {
                      setExpandedItems((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id],
                      );
                    }}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {!isCollapsed && (
                      <>
                        <span className={styles.navLabel}>{item.label}</span>
                        <svg
                          className={styles.expandChevron}
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{
                            transform: expandedItems.includes(item.id)
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          <polyline
                            points="6 9 12 15 18 9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </>
                    )}
                  </button>
                ) : (
                  // Regular nav item
                  <Link
                    href={item.href}
                    className={`${styles.navItem} ${
                      activeSection === item.id ? styles.navItemActive : ""
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {!isCollapsed && (
                      <>
                        <span className={styles.navLabel}>{item.label}</span>
                        {item.badge && (
                          <span className={styles.navBadge}>{item.badge}</span>
                        )}
                      </>
                    )}
                    {isCollapsed && item.badge && (
                      <span className={styles.navBadgeCollapsed}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )}

                {/* Hide button - only visible on hover when not collapsed and item can be hidden */}
                {!isCollapsed && canHideItem(item.id) && !item.subItems && (
                  <button
                    className={styles.hideItemBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleHideItem(item.id);
                    }}
                    title="Hide from sidebar"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Sub-navigation items */}
              {!isCollapsed &&
                item.subItems &&
                expandedItems.includes(item.id) && (
                  <div className={styles.subNavContainer}>
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.id}
                        href={subItem.href}
                        className={`${styles.subNavItem} ${
                          activeSection === subItem.id
                            ? styles.subNavItemActive
                            : ""
                        }`}
                      >
                        <span className={styles.subNavLabel}>
                          {subItem.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
            </div>
          ))}
      </nav>

      {/* Hidden Items Dropdown - Above Footer */}
      {hiddenItems.length > 0 && !isCollapsed && (
        <div className={styles.hiddenItemsContainer}>
          <button
            className={styles.hiddenItemsToggle}
            onClick={() => setShowHiddenMenu(!showHiddenMenu)}
            title="Show hidden items"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span>Hidden ({hiddenItems.length})</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: showHiddenMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>

          {showHiddenMenu && (
            <>
              <div
                className={styles.hiddenMenuOverlay}
                onClick={() => setShowHiddenMenu(false)}
              />
              <div className={styles.hiddenItemsDropdown}>
                {navItems
                  .filter((item) => hiddenItems.includes(item.id))
                  .map((item) => (
                    <div key={item.id} className={styles.hiddenItemRow}>
                      <Link
                        href={item.href}
                        className={styles.hiddenItemLink}
                        onClick={() => setShowHiddenMenu(false)}
                      >
                        <span className={styles.navIcon}>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                      <button
                        className={styles.unhideItemBtn}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleHideItem(item.id);
                        }}
                        title="Show in sidebar"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom Section */}
      <div className={styles.sidebarFooter}>
        {/* User Profile with Settings Menu */}
        <div className={styles.userProfileRow}>
          <div className={styles.userProfile}>
            <div className={styles.userAvatar}>{initials}</div>
            {!isCollapsed && (
              <div className={styles.userInfo}>
                <span className={styles.userName}>{displayName}</span>
                <span className={styles.userEmail}>{userEmail}</span>
              </div>
            )}
          </div>

          {/* Settings Button (3-dots) with Dropdown */}
          {!isCollapsed && (
            <div className={styles.profileMenuContainer}>
              <button
                className={styles.settingsDotsBtn}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                title="Menu"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className={styles.profileMenuOverlay}
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className={styles.profileMenu}>
                    <Link
                      href="/dashboard/profile"
                      className={styles.profileMenuItem}
                      onClick={() => setShowProfileMenu(false)}
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
                      <span>Profile</span>
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      className={styles.profileMenuItem}
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Settings</span>
                    </Link>
                    <div className={styles.profileMenuDivider} />
                    <button
                      className={`${styles.profileMenuItem} ${styles.profileMenuItemDanger}`}
                      onClick={async () => {
                        setShowProfileMenu(false);
                        try {
                          await fetch("/api/auth/logout", { method: "POST" });
                          window.location.href = "/login";
                        } catch (error) {
                          console.error("Logout error:", error);
                        }
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
                          d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points="16 17 21 12 16 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <line
                          x1="21"
                          y1="12"
                          x2="9"
                          y2="12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Logout</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
