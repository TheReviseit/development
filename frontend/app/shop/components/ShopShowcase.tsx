import { Check } from "lucide-react";
import styles from "./ShopShowcase.module.css";

const BENEFITS = [
  "Process orders 10x faster with automated workflows",
  "Reduce manual data entry by 90% with AI-powered automation",
  "Scale to 100k+ SKUs without performance degradation",
  "Integrate with existing tools via REST API and webhooks",
];

export default function ShopShowcase() {
  return (
    <section className={styles.showcase}>
      <div className={styles.showcaseInner}>
        <div className={styles.showcaseContent}>
          <h2>Built for modern commerce operations</h2>
          <p>
            Our platform combines powerful automation with intuitive design,
            giving you complete control while eliminating repetitive tasks.
          </p>

          <ul className={styles.benefitsList}>
            {BENEFITS.map((text) => (
              <li key={text} className={styles.benefitItem}>
                <div className={styles.benefitCheck}>
                  <Check size={14} color="#fff" strokeWidth={3} />
                </div>
                <span className={styles.benefitText}>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.showcaseVisual}>
          <div className={styles.visualCard}>
            <div className={styles.visualGraphRow}>
              <div className={styles.graphBar} style={{ height: "40%" }} />
              <div className={styles.graphBar} style={{ height: "65%" }} />
              <div className={styles.graphBar} style={{ height: "50%" }} />
              <div className={styles.graphBar} style={{ height: "80%" }} />
              <div className={styles.graphBar} style={{ height: "60%" }} />
              <div className={styles.graphBar} style={{ height: "95%" }} />
              <div className={styles.graphBar} style={{ height: "70%" }} />
            </div>
            <span className={styles.visualLabel}>
              Revenue Growth — Last 7 months
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
