import { Shield, Clock, Lock } from "lucide-react";
import styles from "./ShopTrust.module.css";

interface TrustItem {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const TRUST_ITEMS: TrustItem[] = [
  {
    icon: <Shield size={28} color="#fff" />,
    title: "Enterprise security",
    description:
      "Bank-level encryption, SOC 2 compliance, and regular security audits. Your data is protected.",
  },
  {
    icon: <Clock size={28} color="#fff" />,
    title: "99.9% uptime",
    description:
      "Multi-region infrastructure with automatic failover. We guarantee your store stays online.",
  },
  {
    icon: <Lock size={28} color="#fff" />,
    title: "Built to scale",
    description:
      "Handle millions of products and orders without performance degradation. Grow without limits.",
  },
];

export default function ShopTrust() {
  return (
    <section className={styles.trust}>
      <div className={styles.trustInner}>
        <div className={styles.trustGrid}>
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className={styles.trustCard}>
              <div className={styles.trustIconWrap}>{item.icon}</div>
              <h3 className={styles.trustTitle}>{item.title}</h3>
              <p className={styles.trustDesc}>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
