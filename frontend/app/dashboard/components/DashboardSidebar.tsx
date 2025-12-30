"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../dashboard.module.css";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  href: string;
}

interface AICapabilities {
  appointment_booking_enabled: boolean;
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
  });

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
      handleCapabilitiesUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        "ai-capabilities-updated",
        handleCapabilitiesUpdate as EventListener
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
    {
      id: "bot-settings",
      label: "AI Settings",
      icon: <BotIcon />,
      href: "/dashboard/bot-settings",
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
            alt="ReviseIt"
            className={styles.logoImage}
            width={36}
            height={36}
          />
          {!isCollapsed && <span className={styles.logoText}>ReviseIt</span>}
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
        {navItems.map((item) => (
          <Link
            key={item.id}
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
              <span className={styles.navBadgeCollapsed}>{item.badge}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className={styles.sidebarFooter}>
        <Link
          href="/dashboard/settings"
          className={`${styles.navItem} ${
            activeSection === "settings" ? styles.navItemActive : ""
          }`}
          title={isCollapsed ? "Settings" : undefined}
        >
          <span className={styles.navIcon}>
            <SettingsIcon />
          </span>
          {!isCollapsed && <span className={styles.navLabel}>Settings</span>}
        </Link>

        {/* User Profile */}
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
    </aside>
  );
}
