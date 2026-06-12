"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./settings.module.css";

const StoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const PaymentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);

const InvoiceIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [planSlug, setPlanSlug] = useState<string | null>(null);

  useEffect(() => {
    async function checkPlan() {
      try {
        const res = await fetch("/api/subscription/check-domain?domain=dashboard");
        if (res.ok) {
          const data = await res.json();
          setPlanSlug(data.subscription?.planSlug || null);
        }
      } catch (err) {
        console.error("Failed to check plan:", err);
      }
    }
    checkPlan();
  }, []);

  const navItems = [
    {
      label: "Store Profile",
      href: "/settings",
      icon: <StoreIcon />,
    },
    {
      label: "Payment Gateway",
      href: "/settings/payment",
      icon: <PaymentIcon />,
    },
    {
      label: "Invoice",
      href: "/settings/invoice",
      icon: <InvoiceIcon />,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            Manage your store configuration and billing details
          </p>
        </div>
        {planSlug && planSlug !== "free" && planSlug !== "starter" ? (
          <div className={`${styles.upgradeButton} ${styles.proPlanBadge}`}>
            <svg
              style={{ width: "16px", height: "16px", marginRight: "8px" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Pro Plan
          </div>
        ) : (
          <a href="/upgrade" className={styles.upgradeButton}>
            <svg
              style={{ width: "16px", height: "16px", marginRight: "8px" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            Upgrade Plan
          </a>
        )}
      </div>

      <div className={styles.layoutWrapper}>
        <nav className={styles.tabsNav}>
          {navItems.map((item) => {
            const isActive = item.href === '/settings' 
              ? pathname === item.href 
              : (pathname === item.href || pathname.startsWith(item.href + '/'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <main className={styles.contentArea}>
          {children}
        </main>
      </div>
    </div>
  );
}
