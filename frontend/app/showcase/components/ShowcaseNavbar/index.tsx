"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import styles from "./ShowcaseNavbar.module.css";

export default function ShowcaseNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Prevent background scrolling when menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        {/* Left: Logo */}
        <div className={styles.logoGroup}>
          <div className={styles.logoIcon}>
            <Image src="/logo.png" alt="Flowauxi Icon" width={32} height={32} style={{ objectFit: 'contain' }} priority />
          </div>
          <span className={styles.logoText} style={{ fontSize: "1.125rem", color: "#111" }}>
            <b>Flowauxi</b>
          </span>
        </div>

        {/* Center: Desktop Links */}
        <div className={styles.centerLinks}>
          <Link href="#product" className={styles.navLink}>
            Product
          </Link>
          <span className={styles.dot}>.</span>
          <Link href="#solutions" className={styles.navLink}>
            Solutions
          </Link>
          <span className={styles.dot}>.</span>
          <Link href="/pricing" className={styles.navLink}>
            Pricing
          </Link>
          <span className={styles.dot}>.</span>
          <Link href="#developers" className={styles.navLink}>
            Developers
          </Link>
        </div>

        {/* Right: Desktop CTAs */}
        <div className={styles.rightGroup}>
          <Link href="/login" className={styles.loginLink}>
            Log in
          </Link>
          <Link href="/signup" className={styles.ctaButton}>
            <strong>Get it Now</strong> — It&apos;s Free
          </Link>
        </div>

        {/* Mobile Hamburger Toggle */}
        <button 
          className={styles.mobileMenuBtn} 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className={styles.mobileBackdrop} 
          onClick={closeMenu} 
          aria-hidden="true" 
        />
      )}

      {/* Mobile Slide-out Drawer */}
      <div className={`${styles.mobileMenuPanel} ${isMobileMenuOpen ? styles.isOpen : ""}`}>
        <div className={styles.mobileMenuHeader}>
          <div className={styles.logoGroup}>
            <Image src="/logo.png" alt="Flowauxi" width={28} height={28} style={{ objectFit: "contain" }} />
            <span className={styles.logoText} style={{ fontSize: "1rem" }}><b>Flowauxi</b></span>
          </div>
          <button className={styles.mobileCloseBtn} onClick={closeMenu} aria-label="Close menu">
            <X size={24} />
          </button>
        </div>

        <div className={styles.mobileNavLinks}>
          <Link href="#product" className={styles.mobileNavLink} onClick={closeMenu}>Product</Link>
          <Link href="#solutions" className={styles.mobileNavLink} onClick={closeMenu}>Solutions</Link>
          <Link href="/pricing" className={styles.mobileNavLink} onClick={closeMenu}>Pricing</Link>
          <Link href="#developers" className={styles.mobileNavLink} onClick={closeMenu}>Developers</Link>
        </div>

        <div className={styles.mobileCTAs}>
          <Link href="/login" className={styles.mobileLoginBtn} onClick={closeMenu}>
            Log in
          </Link>
          <Link href="/signup" className={styles.mobileSignupBtn} onClick={closeMenu}>
            Get it Now
          </Link>
        </div>
      </div>
    </nav>
  );
}
