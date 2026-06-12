"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./Sidebar.module.css";
import {
  TrendingUp,
  Inbox,
  Megaphone,
  Send,
  FileText,
  Users,
  FileEdit,
  Wrench,
  Bot,
  Play,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  Package,
  Layers,
  LayoutGrid
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
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
      icon: <TrendingUp size={18} />,
      path: "/home",
    },
    {
      id: "conversations",
      label: "Conversations",
      icon: <Inbox size={18} />,
      path: "/conversations",
      badge: 12,
    },
    {
      id: "messages",
      label: "Messages",
      icon: <Send size={18} />,
      path: "/messages",
      subItems: [
        {
          id: "quick-replies",
          label: "Quick Replies",
          icon: <FileText size={16} />,
          path: "/messages/quick-replies",
        },
        {
          id: "templates",
          label: "Templates",
          icon: <FileText size={16} />,
          path: "/messages/templates",
        },
      ],
    },
    {
      id: "automation",
      label: "Automation",
      icon: <Bot size={18} />,
      path: "/automation",
      subItems: [
        {
          id: "workflows",
          label: "Workflows",
          icon: <Play size={16} />,
          path: "/automation/workflows",
        },
        {
          id: "chatbots",
          label: "Chatbots",
          icon: <Bot size={16} />,
          path: "/automation/chatbots",
        },
        {
          id: "triggers",
          label: "Triggers",
          icon: <Play size={16} />,
          path: "/automation/triggers",
        },
      ],
    },
    {
      id: "campaigns",
      label: "Campaigns",
      icon: <Megaphone size={18} />,
      path: "/campaigns",
      subItems: [
        {
          id: "broadcast",
          label: "Broadcast",
          icon: <Send size={16} />,
          path: "/campaigns/broadcast",
        },
        {
          id: "scheduled",
          label: "Scheduled",
          icon: <Play size={16} />,
          path: "/campaigns/scheduled",
        },
        {
          id: "drip",
          label: "Drip Campaigns",
          icon: <Layers size={16} />,
          path: "/campaigns/drip",
        },
      ],
    },
    {
      id: "contacts",
      label: "Contacts",
      icon: <Users size={18} />,
      path: "/contacts",
      subItems: [
        {
          id: "all-contacts",
          label: "All Contacts",
          icon: <Users size={16} />,
          path: "/contacts/all",
        },
        {
          id: "segments",
          label: "Segments",
          icon: <Layers size={16} />,
          path: "/contacts/segments",
        },
        {
          id: "import",
          label: "Import",
          icon: <FileEdit size={16} />,
          path: "/contacts/import",
        },
      ],
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: <TrendingUp size={18} />,
      path: "/analytics",
      subItems: [
        {
          id: "overview",
          label: "Overview",
          icon: <TrendingUp size={16} />,
          path: "/analytics/overview",
        },
        {
          id: "messages-stats",
          label: "Messages",
          icon: <Send size={16} />,
          path: "/analytics/messages",
        },
        {
          id: "campaigns-stats",
          label: "Campaigns",
          icon: <Megaphone size={16} />,
          path: "/analytics/campaigns",
        },
      ],
    },
    {
      id: "integrations",
      label: "Integrations",
      icon: <LayoutGrid size={18} />,
      path: "/integrations",
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings size={18} />,
      path: "/settings",
      subItems: [
        {
          id: "profile",
          label: "Profile",
          icon: <Users size={16} />,
          path: "/settings/profile",
        },
        {
          id: "whatsapp",
          label: "WhatsApp",
          icon: <Send size={16} />,
          path: "/settings/whatsapp",
        },
        {
          id: "team",
          label: "Team",
          icon: <Users size={16} />,
          path: "/settings/team",
        },
        {
          id: "billing",
          label: "Billing",
          icon: <Package size={16} />,
          path: "/settings/billing",
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
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
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
                      <ChevronDown
                        size={14}
                        style={{
                          transform: expandedItems.includes(item.id)
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                          transition: "transform 0.2s ease",
                        }}
                      />
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
