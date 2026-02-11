import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import styles from "./ShopFooter.module.css";

const PRODUCT_LINKS = [
  { href: "#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/demo", label: "Demo" },
];

const RESOURCE_LINKS = [
  { href: "/docs", label: "Documentation" },
  { href: "/api", label: "API Reference" },
  { href: "/support", label: "Support" },
];

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
];

export default function ShopFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          {/* Brand */}
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.footerLogo}>
              <div className={styles.footerLogoIcon}>
                <ShoppingBag size={16} color="#fff" />
              </div>
              <span className={styles.footerLogoText}>Flowauxi</span>
            </Link>
            <p className={styles.footerTagline}>
              Enterprise commerce platform built for modern businesses.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className={styles.footerColTitle}>Product</h3>
            <ul className={styles.footerLinks}>
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={styles.footerLink}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className={styles.footerColTitle}>Resources</h3>
            <ul className={styles.footerLinks}>
              {RESOURCE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={styles.footerLink}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className={styles.footerColTitle}>Company</h3>
            <ul className={styles.footerLinks}>
              {COMPANY_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={styles.footerLink}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className={styles.footerBottom}>
          <p className={styles.footerCopy}>
            &copy; {new Date().getFullYear()} Flowauxi. All rights reserved.
          </p>
          <div className={styles.footerBottomLinks}>
            <Link href="/terms" className={styles.footerBottomLink}>
              Terms
            </Link>
            <Link href="/privacy" className={styles.footerBottomLink}>
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
