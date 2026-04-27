"use client";

import Image from "next/image";
import { SocialMediaIcons } from "@/components/shared/SocialMediaIcons";
import { CONTACT_CONFIG } from "@/config/contact";
import styles from "./Footer.module.css";

/**
 * Footer Component
 * 
 * A production-grade footer component that uses centralized
 * configuration for contact information and social media links.
 * 
 * @production-grade
 */

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
              <span className={styles.brandName}>{CONTACT_CONFIG.companyName}</span>
            </div>
          </div>

          <div className={styles.legal}>
            <p className={styles.copyright}>
              © {new Date().getFullYear()} {CONTACT_CONFIG.companyName}. All rights reserved.
              <br />
              <strong>{CONTACT_CONFIG.companyName}</strong> – AI WhatsApp Automation Platform
              <br />
              Legal Business Name: {CONTACT_CONFIG.legalName}
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

          {/* Social Media Icons */}
          <div className={styles.socialLinks}>
            <SocialMediaIcons 
              variant="minimal"
              size={20}
              color="current"
              gap={16}
            />
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
                  href={`tel:${CONTACT_CONFIG.phone}`}
                  className={styles.link}
                  aria-label={`Call ${CONTACT_CONFIG.phoneFormatted}`}
                >
                  {CONTACT_CONFIG.phoneFormatted}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_CONFIG.email}`}
                  className={styles.link}
                  aria-label={`Send email to ${CONTACT_CONFIG.email}`}
                >
                  {CONTACT_CONFIG.email}
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
                <span className={styles.link}>We&apos;d love to hear from you</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
