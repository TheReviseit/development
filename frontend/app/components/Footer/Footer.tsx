"use client";

import Image from "next/image";
import styles from "./Footer.module.css";

// Contact constants for this component
const CONTACT = {
  email: "contact@flowauxi.com",
  phone: "+916383634873",
  phoneFormatted: "+91 6383634873",
} as const;

export default function Footer() {
  return (
    <footer id="footer" className={styles.footer}>
      <div className={styles.container}>
        {/* Left Section: Branding & Legal */}
        <div className={styles.leftSection}>
          <div className={styles.brand}>
            <div className={styles.logoContainer}>
              <Image
                src="/logo.png"
                alt="Flowauxi logo"
                width={40}
                height={40}
                className={styles.logo}
              />
              <span className={styles.brandName}>Flowauxi</span>
            </div>
          </div>

          <div className={styles.legal}>
            <p className={styles.copyright}>
              © 2026 Flowauxi. All rights reserved.
              <br />
              <strong>Flowauxi</strong> – AI WhatsApp Automation Platform
              <br />
              Legal Business Name: SIVASANKARA BOOPATHY RAJA RAMAN
            </p>
            <div className={styles.legalLinks}>
              <a href="/terms" className={styles.legalLink}>
                Terms of Service
              </a>
              <span>|</span>
              <a href="/privacy" className={styles.legalLink}>
                Privacy Policy
              </a>
              <span>|</span>
              <a href="/data-deletion" className={styles.legalLink}>
                Data Deletion
              </a>
            </div>
          </div>
        </div>

        {/* Right Section: Navigation Links */}
        <div className={styles.rightSection}>
          {/* Product */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Product</h4>
            <ul className={styles.linkList}>
              <li>
                <a href="/pricing" className={styles.link}>
                  Pricing
                </a>
              </li>
              <li>
                <a href="/signup" className={styles.link}>
                  Get Started
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Company</h4>
            <ul className={styles.linkList}>
              <li>
                <a href="/" className={styles.link}>
                  Home
                </a>
              </li>
              <li>
                <a href="/booking" className={styles.link}>
                  Book a Demo
                </a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Support</h4>
            <ul className={styles.linkList}>
              <li>
                <a
                  href={`tel:${CONTACT.phone}`}
                  className={styles.link}
                  aria-label={`Call ${CONTACT.phoneFormatted}`}
                >
                  {CONTACT.phoneFormatted}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className={styles.link}
                  aria-label={`Send email to ${CONTACT.email}`}
                >
                  {CONTACT.email}
                </a>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Get in touch</h4>
            <ul className={styles.linkList}>
              <li>
                <a href="/booking" className={styles.link}>
                  Questions or feedback?
                </a>
              </li>
              <li>
                <span className={styles.link}>We'd love to hear from you</span>
              </li>
            </ul>
            {/* Social Icons Placeholder - matching design structure */}
            <div className={styles.socialLinks}>
              {/* Add social icons here if needed, keeping it simple as per request */}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
