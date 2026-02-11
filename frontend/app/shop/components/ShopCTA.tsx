import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./ShopCTA.module.css";

export default function ShopCTA() {
  return (
    <section className={styles.cta}>
      <div className={styles.ctaInner}>
        <h2 className={styles.ctaTitle}>Launch your store today</h2>
        <p className={styles.ctaDesc}>
          Join thousands of businesses running their commerce operations on
          Flowauxi. Start selling in minutes.
        </p>
        <Link href="/signup" className={styles.ctaBtn}>
          Get Started
          <ArrowRight size={18} />
        </Link>
        <p className={styles.ctaNote}>
          No credit card required &middot; Cancel anytime
        </p>
      </div>
    </section>
  );
}
