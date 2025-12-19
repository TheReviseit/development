"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./Sidebar.module.css";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
  subItems?: NavItem[];
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "📊",
      path: "/dashboard",
    },
    {
      id: "conversations",
      label: "Conversations",
      icon: "💬",
      path: "/dashboard/conversations",
      badge: 12,
    },
    {
      id: "messages",
      label: "Messages",
      icon: "📨",
      path: "/dashboard/messages",
      subItems: [
        {
          id: "quick-replies",
          label: "Quick Replies",
          icon: "⚡",
          path: "/dashboard/messages/quick-replies",
        },
        {
          id: "templates",
          label: "Templates",
          icon: "📝",
          path: "/dashboard/messages/templates",
        },
      ],
    },
    {
      id: "automation",
      label: "Automation",
      icon: "🤖",
      path: "/dashboard/automation",
      subItems: [
        {
          id: "workflows",
          label: "Workflows",
          icon: "🔄",
          path: "/dashboard/automation/workflows",
        },
        {
          id: "chatbots",
          label: "Chatbots",
          icon: "🤖",
          path: "/dashboard/automation/chatbots",
        },
        {
          id: "triggers",
          label: "Triggers",
          icon: "⚡",
          path: "/dashboard/automation/triggers",
        },
      ],
    },
    {
      id: "campaigns",
      label: "Campaigns",
      icon: "📢",
      path: "/dashboard/campaigns",
      subItems: [
        {
          id: "broadcast",
          label: "Broadcast",
          icon: "📡",
          path: "/dashboard/campaigns/broadcast",
        },
        {
          id: "scheduled",
          label: "Scheduled",
          icon: "⏰",
          path: "/dashboard/campaigns/scheduled",
        },
        {
          id: "drip",
          label: "Drip Campaigns",
          icon: "💧",
          path: "/dashboard/campaigns/drip",
        },
      ],
    },
    {
      id: "contacts",
      label: "Contacts",
      icon: "👥",
      path: "/dashboard/contacts",
      subItems: [
        {
          id: "all-contacts",
          label: "All Contacts",
          icon: "📋",
          path: "/dashboard/contacts/all",
        },
        {
          id: "segments",
          label: "Segments",
          icon: "🏷️",
          path: "/dashboard/contacts/segments",
        },
        {
          id: "import",
          label: "Import",
          icon: "📥",
          path: "/dashboard/contacts/import",
        },
      ],
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: "📈",
      path: "/dashboard/analytics",
      subItems: [
        {
          id: "overview",
          label: "Overview",
          icon: "📊",
          path: "/dashboard/analytics/overview",
        },
        {
          id: "messages-stats",
          label: "Messages",
          icon: "💬",
          path: "/dashboard/analytics/messages",
        },
        {
          id: "campaigns-stats",
          label: "Campaigns",
          icon: "📢",
          path: "/dashboard/analytics/campaigns",
        },
      ],
    },
    {
      id: "integrations",
      label: "Integrations",
      icon: "🔌",
      path: "/dashboard/integrations",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "⚙️",
      path: "/dashboard/settings",
      subItems: [
        {
          id: "profile",
          label: "Profile",
          icon: "👤",
          path: "/dashboard/settings/profile",
        },
        {
          id: "whatsapp",
          label: "WhatsApp",
          icon: "📱",
          path: "/dashboard/settings/whatsapp",
        },
        {
          id: "team",
          label: "Team",
          icon: "👥",
          path: "/dashboard/settings/team",
        },
        {
          id: "billing",
          label: "Billing",
          icon: "💳",
          path: "/dashboard/settings/billing",
        },
      ],
    },
  ];

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + "/");
  };

  const handleNavigation = (item: NavItem) => {
    if (item.subItems) {
      toggleExpand(item.id);
    } else {
      router.push(item.path);
    }
  };

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ""}`}
    >
      {/* Sidebar Header */}
      <div className={styles.sidebarHeader}>
        <div className={styles.logo}>
          <img src="/logo.png" alt="ReviseIt" width="32" height="32" />
          {!isCollapsed && <span className={styles.logoText}>ReviseIt</span>}
        </div>
        <button
          className={styles.collapseBtn}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? "→" : "←"}
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <div key={item.id} className={styles.navItemWrapper}>
            <div
              className={`${styles.navItem} ${
                isActive(item.path) ? styles.active : ""
              }`}
              onClick={() => handleNavigation(item)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!isCollapsed && (
                <>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge && (
                    <span className={styles.badge}>{item.badge}</span>
                  )}
                  {item.subItems && (
                    <span className={styles.expandIcon}>
                      {expandedItems.includes(item.id) ? "▼" : "▶"}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Sub Items */}
            {item.subItems &&
              expandedItems.includes(item.id) &&
              !isCollapsed && (
                <div className={styles.subItems}>
                  {item.subItems.map((subItem) => (
                    <div
                      key={subItem.id}
                      className={`${styles.subItem} ${
                        isActive(subItem.path) ? styles.active : ""
                      }`}
                      onClick={() => router.push(subItem.path)}
                    >
                      <span className={styles.subIcon}>{subItem.icon}</span>
                      <span className={styles.subLabel}>{subItem.label}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className={styles.sidebarFooter}>
        <div className={styles.helpCard}>
          <span className={styles.helpIcon}>💡</span>
          {!isCollapsed && (
            <>
              <div className={styles.helpContent}>
                <h4 className={styles.helpTitle}>Need Help?</h4>
                <p className={styles.helpText}>
                  Check our documentation or contact support
                </p>
              </div>
              <button className={styles.helpBtn}>Get Help</button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
