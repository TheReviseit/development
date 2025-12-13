import Image from "next/image";
import styles from "./Footer.module.css";

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
                alt="ReviseIt Logo"
                width={40}
                height={40}
                className={styles.logo}
              />
              <span className={styles.brandName}>ReviseIt</span>
            </div>
          </div>

          <div className={styles.legal}>
            <p className={styles.copyright}>
              © 2025 ReviseIt. All rights reserved.
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
                <a href="#features" className={styles.link}>
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className={styles.link}>
                  Pricing
                </a>
              </li>
              <li>
                <a href="#integrations" className={styles.link}>
                  Integrations
                </a>
              </li>
              <li>
                <a href="#api" className={styles.link}>
                  API Docs
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Company</h4>
            <ul className={styles.linkList}>
              <li>
                <a href="#about" className={styles.link}>
                  About
                </a>
              </li>
              <li>
                <a href="#careers" className={styles.link}>
                  Careers
                </a>
              </li>
              <li>
                <a href="#blog" className={styles.link}>
                  Blog
                </a>
              </li>
              <li>
                <a href="#press" className={styles.link}>
                  Press
                </a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Support</h4>
            <ul className={styles.linkList}>
              <li>
                <a href="#help" className={styles.link}>
                  Help Center
                </a>
              </li>
              <li>
                <a href="#contact" className={styles.link}>
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#status" className={styles.link}>
                  Status
                </a>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Get in touch</h4>
            <ul className={styles.linkList}>
              <li>
                <a href="#feedback" className={styles.link}>
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
