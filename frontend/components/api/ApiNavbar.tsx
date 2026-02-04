"use client";

/**
 * API Product Navbar
 * Dark themed navigation for api.flowauxi.com
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  external?: boolean;
}

const navItems: NavItem[] = [
  { label: "Overview", href: "/apis" },
  { label: "Documentation", href: "/docs" },
  { label: "Console", href: "/console" },
  { label: "Pricing", href: "/apis/pricing" },
  { label: "Status", href: "https://status.flowauxi.com", external: true },
];

export function ApiNavbar() {
  const pathname = usePathname();

  return (
    <header className="api-product-navbar">
      <div className="api-product-navbar-inner">
        {/* Logo */}
        <Link href="/apis" className="api-product-logo">
          <img src="/logo.png" alt="Flowauxi" />
          <span className="api-product-logo-text">
            Flowauxi <span className="api-product-logo-badge">API</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="api-product-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`api-product-nav-link ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`}
              {...(item.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {item.label}
              {item.external && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  style={{ marginLeft: 4 }}
                >
                  <path d="M3.5 3a.5.5 0 0 0 0 1h3.793L3.146 8.146a.5.5 0 1 0 .708.708L8 4.707V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5z" />
                </svg>
              )}
            </Link>
          ))}

          {/* Status Badge */}
          <div className="api-status-badge">All Systems Operational</div>

          {/* CTA */}
          <Link href="/console/signup" className="api-product-nav-cta">
            Get API Key
          </Link>
        </nav>
      </div>

      {/* Cross-domain link to Dashboard */}
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "8px 0 12px",
          borderTop: "1px solid var(--api-border)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <a
          href="https://flowauxi.com/dashboard"
          className="api-product-cross-link"
        >
          ← Go to Dashboard
          <svg viewBox="0 0 12 12" fill="currentColor">
            <path d="M3.5 3a.5.5 0 0 0 0 1h3.793L3.146 8.146a.5.5 0 1 0 .708.708L8 4.707V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
