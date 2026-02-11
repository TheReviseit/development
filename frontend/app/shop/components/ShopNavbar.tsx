"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import DemoModal from "./DemoModal";
import styles from "./ShopNavbar.module.css";

const NAV_LINKS = [
  { href: "#features", label: "Products" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * ShopNavbar — reel.ai-inspired clean navigation
 * Company logo | Links center | See Demo + Get Started right
 */
export default function ShopNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.navInner}>
          {/* Company Logo */}
          <Link href="/" className={styles.logoLink}>
            <Image
              src="/logo.png"
              alt="Flowauxi"
              width={32}
              height={32}
              className={styles.logoImg}
            />
            <span className={styles.logoText}>flowauxi</span>
          </Link>

          {/* Center nav links */}
          <div className={styles.navLinks}>
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right actions */}
          <div className={styles.navActions}>
            <button
              className={styles.seeDemoBtn}
              onClick={() => setDemoOpen(true)}
            >
              See Demo
            </button>
            <Link href="/signup" className={styles.getStartedBtn}>
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className={styles.menuBtn}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        <div className={`${styles.mobileNav} ${mobileOpen ? styles.open : ""}`}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.mobileNavLink}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className={styles.mobileActions}>
            <button
              className={styles.mobileDemoBtn}
              onClick={() => {
                setMobileOpen(false);
                setDemoOpen(true);
              }}
            >
              See Demo
            </button>
            <Link
              href="/signup"
              className={styles.mobileStartBtn}
              onClick={() => setMobileOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Demo Video Modal */}
      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </>
  );
}
