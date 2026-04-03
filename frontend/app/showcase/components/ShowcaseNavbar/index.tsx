import Link from "next/link";
import Image from "next/image";
import styles from "./ShowcaseNavbar.module.css";

export default function ShowcaseNavbar() {
  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        <div className={styles.logoGroup}>
          <div className={styles.logoIcon}>
            <Image src="/logo.png" alt="Flowauxi Icon" width={32} height={32} style={{ objectFit: 'contain' }} priority />
          </div>
          <span className={styles.logoText} style={{ fontSize: "1.125rem", color: "#111" }}>
            <b>Flowauxi</b>
          </span>
        </div>

        {/* Center: Links */}
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

        {/* Right: CTAs */}
        <div className={styles.rightGroup}>
          <Link href="/login" className={styles.loginLink}>
            Log in
          </Link>
          <Link href="/signup" className={styles.ctaButton}>
            <strong>Get it Now</strong> — It&apos;s Free
          </Link>
        </div>
      </div>
    </nav>
  );
}
