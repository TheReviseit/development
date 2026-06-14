"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDomainVisibility, type ProductDomain } from "@/lib/domain/config";
import { auth } from "@/src/firebase/firebase";
import styles from "../dashboard.module.css";
import {
  BarChart2,
  Inbox,
  Megaphone,
  Send,
  FileText,
  Users,
  FileEdit,
  Wrench,
  Bot,
  // Play,
  Calendar,
  Briefcase,
  Package,
  Layers,
  Settings,
  LogOut,
  ChevronRight,
  ChevronLeft,
  User,
  LayoutGrid,
  Plus,
  Image as ImageIcon,
  Tag,
  Palette,
  Clock,
  List,
  ExternalLink
} from "lucide-react";

interface SubNavItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  href: string;
  subItems?: SubNavItem[];
  section: "top" | "workspace" | "favorites";
  target?: string;
}

interface AICapabilities {
  appointment_booking_enabled: boolean;
  order_booking_enabled: boolean;
  products_enabled: boolean;
  showcase_enabled: boolean;
}

interface DashboardSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userEmail?: string;
  userName?: string;
  isSidebarOpen?: boolean;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
  productDomain?: ProductDomain;
  storeUsername?: string | null;
}

export default function DashboardSidebar({
  activeSection,
  onSectionChange,
  userEmail,
  userName,
  isSidebarOpen,
  isCollapsed = false,
  setIsCollapsed,
  productDomain = "dashboard",
  storeUsername,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [userCount, setUserCount] = useState<number>(0);
  const currentDomain: ProductDomain = productDomain;
  const [aiCapabilities, setAiCapabilities] = useState<AICapabilities>({
    appointment_booking_enabled: false,
    order_booking_enabled: false,
    products_enabled: false,
    showcase_enabled: false,
  });


  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Section expand/collapse state
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isItemActive = (item: NavItem, allItems: NavItem[]) => {
    const exactMatch = allItems.find((navItem) => pathname === navItem.href);
    if (exactMatch) {
      return pathname === item.href;
    }
    return activeSection === item.id;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const legacyKeys = [
        "hiddenSidebarItems",
        "collapsedSidebarGroups",
        "sidebar-state",
      ];
      legacyKeys.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
    }
  }, [currentDomain]);



  useEffect(() => {
    const fetchAICapabilities = async () => {
      try {
        const response = await fetch("/api/ai-capabilities");
        const data = await response.json();
        if (data.success && data.data) {
          setAiCapabilities(data.data);
        }
      } catch (error) {
        console.error("Error fetching AI capabilities:", error);
      }
    };
    fetchAICapabilities();

    const handleCapabilitiesUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<AICapabilities>;
      if (customEvent.detail) {
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

  const visibility = getDomainVisibility(currentDomain);

  const navItems: NavItem[] = [
    {
      id: "analytics",
      label: "Analytics",
      icon: <BarChart2 size={20} strokeWidth={2.25} />,
      href: "/home",
      section: "top",
    },
    {
      id: "messages",
      label: "Messages",
      icon: <Inbox size={20} strokeWidth={2.25} />,
      badge: userCount > 0 ? userCount : undefined,
      href: "/messages",
      section: "top",
    },

    // Workspace Items
    ...(visibility.campaigns
      ? [
          {
            id: "campaigns",
            label: "Campaigns",
            icon: <Megaphone size={20} strokeWidth={2.25} />,
            href: "/campaigns",
            section: "workspace" as const,
          },
        ]
      : []),
    ...(visibility.bulkMessages
      ? [
          {
            id: "bulk-messages",
            label: "Bulk Messages",
            icon: <Send size={20} strokeWidth={2.25} />,
            href: "/bulk-messages",
            section: "workspace" as const,
          },
        ]
      : []),
    ...(visibility.templates
      ? [
          {
            id: "templates",
            label: "Templates",
            icon: <FileText size={20} strokeWidth={2.25} />,
            href: "/templates",
            section: "workspace" as const,
          },
        ]
      : []),
    ...(visibility.contacts
      ? [
          {
            id: "contacts",
            label: "Contacts",
            icon: <Users size={20} strokeWidth={2.25} />,
            href: "/contacts",
            section: "workspace" as const,
          },
        ]
      : []),
    ...(visibility.forms
      ? [
          {
            id: "forms",
            label: "Forms",
            icon: <FileEdit size={20} strokeWidth={2.25} />,
            href: "/forms",
            section: "workspace" as const,
          },
        ]
      : []),
    ...(visibility.files
      ? [
          {
            id: "files",
            label: "Tools",
            icon: <Wrench size={20} strokeWidth={2.25} />,
            href: "/files",
            section: "workspace" as const,
            subItems: [
              {
                id: "files-text-to-pdf",
                label: "Text to PDF",
                href: "/files/text-to-pdf",
                icon: <FileText size={16} strokeWidth={2.25} />,
              },
              {
                id: "files-history",
                label: "History",
                href: "/files/history",
                icon: <Clock size={16} strokeWidth={2.25} />,
              },
              {
                id: "files-settings",
                label: "Settings",
                href: "/files/settings",
                icon: <Settings size={16} strokeWidth={2.25} />,
              },
            ],
          },
        ]
      : []),

    // Favorites Items
    ...(visibility.products
      ? [
          {
            id: "products",
            label: "Products",
            icon: <Tag size={20} strokeWidth={2.25} />,
            href: "/products",
            section: "favorites" as const,
            subItems: [
              {
                id: "products-list",
                label: "Products List",
                href: "/products",
              },
              {
                id: "add-product",
                label: "Add Product",
                href: "/products/add",
              },
              {
                id: "banners",
                label: "Add Banners",
                href: "/products/banners",
              },
              {
                id: "categories",
                label: "Add Category",
                href: "/products/categories",
              },
              {
                id: "options",
                label: "Add Sizes & Colors",
                href: "/products/options",
              },
            ],
          },
        ]
      : []),
    ...(visibility.orders
      ? [
          {
            id: "orders",
            label: "Orders",
            icon: <Briefcase size={20} strokeWidth={2.25} />,
            href: "/orders",
            section: "favorites" as const,
          },
        ]
      : []),

    ...(visibility.appointments && aiCapabilities.appointment_booking_enabled
      ? [
          {
            id: "appointments",
            label: "Appointments",
            icon: <Calendar size={20} strokeWidth={2.25} />,
            href: "/appointments",
            section: "favorites" as const,
          },
          {
            id: "services",
            label: "Services",
            icon: <LayoutGrid size={20} strokeWidth={2.25} />,
            href: "/services",
            section: "favorites" as const,
          },
        ]
      : []),
    ...(visibility.showcase
      ? [
          {
            id: "showcase",
            label: "Showcase",
            icon: <LayoutGrid size={20} strokeWidth={2.25} />,
            href: "/showcase-manager",
            section: "favorites" as const,
            subItems: [
              {
                id: "showcase-products",
                label: "Products",
                href: "/showcase-manager/products",
                icon: <List size={16} strokeWidth={2.25} />,
              },
              {
                id: "showcase-add-product",
                label: "Add Product",
                href: "/showcase-manager/products/add",
                icon: <Plus size={16} strokeWidth={2.25} />,
              },
              {
                id: "showcase-bookings",
                label: "Bookings",
                href: "/showcase-manager/bookings",
                icon: <Calendar size={16} strokeWidth={2.25} />,
              },
            ],
          },
        ]
      : []),
    ...(visibility.aiSettings
      ? [
          {
            id: "bot-settings",
            label: "AI Settings",
            icon: <Bot size={20} strokeWidth={2.25} />,
            href: "/bot-settings",
            section: "favorites" as const,
          },
        ]
      : []),
    /* ...(visibility.previewBot
      ? [
          {
            id: "preview-bot",
            label: "Preview Bot",
            icon: <Play size={20} strokeWidth={2.25} />,
            href: "/preview-bot",
            section: "favorites" as const,
          },
        ]
      : []), */
  ];

  const displayName = userName || userEmail?.split("@")[0] || "User";
  const initials = displayName.substring(0, 2).toUpperCase();

  const renderNavSection = (sectionName: "top" | "workspace" | "favorites") => {
    const items = navItems.filter(
      (item) => item.section === sectionName
    );

    if (items.length === 0) return null;

    return (
      <>
        <div className={styles.sectionItemsWrapper}>
          {items.map((item) => (
            <div key={item.id} className={styles.navItemWrapper}>
              <div className={styles.navItemHeader}>
                {item.subItems && item.subItems.length > 0 ? (
                  <button
                    className={`${styles.navItem} ${
                      isItemActive(item, navItems) && (!expandedItems.includes(item.id) || isCollapsed)
                        ? styles.navItemActive
                        : ""
                    }`}
                    onClick={() => {
                      setExpandedItems((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id]
                      );
                    }}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {!isCollapsed && (
                      <>
                        <span className={styles.navLabel}>{item.label}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    target={item.target}
                    className={`${styles.navItem} ${
                      isItemActive(item, navItems) ? styles.navItemActive : ""
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


              </div>

              {!isCollapsed &&
                item.subItems &&
                expandedItems.includes(item.id) && (
                  <div className={styles.subNavContainer}>
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.id}
                        href={subItem.href}
                        className={`${styles.subNavItem} ${
                          pathname === subItem.href
                            ? styles.subNavItemActive
                            : ""
                        }`}
                      >
                        {subItem.icon && (
                          <span className={styles.navIcon}>
                            {subItem.icon}
                          </span>
                        )}
                        <span className={styles.subNavLabel}>
                          {subItem.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

              {/* Floating sub-menu for collapsed state (visible only on hover when collapsed) */}
              {item.subItems && item.subItems.length > 0 && (
                <div className={styles.collapsedSubMenu}>
                  <div className={styles.collapsedSubMenuHeader}>{item.label}</div>
                  {item.subItems.map((subItem) => (
                    <Link
                      key={subItem.id}
                      href={subItem.href}
                      className={styles.collapsedSubMenuItem}
                    >
                      {subItem.icon && (
                        <span className={styles.collapsedSubMenuIcon}>
                          {subItem.icon}
                        </span>
                      )}
                      <span className={styles.collapsedSubMenuLabel}>
                        {subItem.label}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <aside
      className={`${styles.sidebar} ${
        isCollapsed ? styles.sidebarCollapsed : ""
      } ${isSidebarOpen ? styles.sidebarOpen : ""}`}
    >
      {/* Sidebar Header removed as per user request to remove collapse button */}

      {/* Navigation */}
      <nav className={styles.sidebarNav}>
        {renderNavSection("top")}
        {renderNavSection("workspace")}
        {renderNavSection("favorites")}



        {/* Settings and Logout items directly in side menu */}
        <div className={styles.navItemWrapper}>
          <div className={styles.navItemHeader}>
            <Link
              href="/settings"
              className={`${styles.navItem} ${
                pathname === "/settings" ? styles.navItemActive : ""
              }`}
              title={isCollapsed ? "Settings" : undefined}
            >
              <span className={styles.navIcon}>
                <Settings size={20} strokeWidth={2.25} />
              </span>
              {!isCollapsed && <span className={styles.navLabel}>Settings</span>}
            </Link>
          </div>
        </div>

        <div className={styles.navItemWrapper}>
          <div className={styles.navItemHeader}>
            <button
              className={styles.navItem}
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "include",
                  });
                  try {
                    await auth.signOut();
                  } catch {}
                  window.location.href = "/login";
                } catch (error) {
                  console.error("Logout error:", error);
                }
              }}
              title={isCollapsed ? "Logout" : undefined}
            >
              <span
                className={styles.navIcon}
                style={{ color: "var(--dash-danger)" }}
              >
                <LogOut size={20} strokeWidth={2.25} />
              </span>
              {!isCollapsed && (
                <span
                  className={styles.navLabel}
                  style={{ color: "var(--dash-danger)" }}
                >
                  Logout
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>



      {/* Bottom Section */}
      <div className={styles.sidebarFooter}>
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
        </div>
      </div>
    </aside>
  );
}
