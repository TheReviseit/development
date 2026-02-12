"use client";

import Image from "next/image";
import { motion, Variants } from "framer-motion";
import styles from "./ShopShowcase.module.css";
import usingPhone from "@/src/shop-photos/using-phone.jpg";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.25, 1, 0.5, 1],
    },
  },
};

export default function ShopShowcase() {
  return (
    <section className={styles.showcase}>
      <div className={styles.showcaseInner}>
        <motion.div
          className={styles.header}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={itemVariants}
        >
          <span className={styles.badge}>Platform Power</span>
          <h2 className={styles.title}>Built for modern commerce operations</h2>
          <p className={styles.subtitle}>
            Our platform combines powerful automation with intuitive design,
            giving you complete control while eliminating repetitive tasks and
            manual entry.
          </p>
        </motion.div>

        <motion.div
          className={styles.grid}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Main Card - Automated Workflows */}
          <motion.div
            className={`${styles.card} ${styles.mainCard}`}
            variants={itemVariants}
          >
            <Image
              src={usingPhone}
              alt="Automated Commerce"
              className={styles.mainCardImage}
              placeholder="blur"
            />
            <div className={styles.mainCardContent}>
              <span className={styles.bigText10x}>10x</span>
              <span className={styles.subtitleWorkflows}>Faster Workflows</span>
              <p>
                Process orders instantly with automated workflows that eliminate
                bottlenecks.
              </p>
            </div>
          </motion.div>

          {/* Top Middle Card - AI Automation */}
          <motion.div
            className={`${styles.card} ${styles.secondaryCard} ${styles.peach}`}
            variants={itemVariants}
          >
            <h3>90% Less Manual Entry</h3>
            <p>
              Reduce manual data entry by 90% with AI-powered automation
              designed for efficiency.
            </p>
            <div
              className={`${styles.miniCardContainer} ${styles.miniCardBorderPeach}`}
            >
              <div className={styles.miniCardInner}>
                <div className={styles.miniCardIconAI}>AI</div>
                <div>
                  <div className={styles.miniCardTitle}>Auto-Parsing Data</div>
                  <div className={styles.miniCardSubtitle}>
                    Processed 143 invoices in 2s
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Top Right Card - API & Integrations */}
          <motion.div
            className={`${styles.card} ${styles.secondaryCard} ${styles.mint}`}
            variants={itemVariants}
          >
            <h3>Seamless Integrations</h3>
            <p>
              Integrate with existing tools via our powerful REST API and
              real-time webhooks.
            </p>
            <div
              className={`${styles.miniCardContainer} ${styles.miniCardBorderMint}`}
            >
              <div className={styles.miniCardInner}>
                <div className={styles.miniCardIconAPI}>API</div>
                <div>
                  <div className={styles.miniCardTitle}>Endpoint Connected</div>
                  <div className={styles.miniCardSubtitle}>
                    Status: 200 OK — Ready
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Bottom Wide Card - Scalability */}
          <motion.div
            className={`${styles.card} ${styles.wideCard}`}
            variants={itemVariants}
          >
            <h3>Scalability without Limits</h3>
            <p>
              Scale to 100k+ SKUs without performance degradation. Built on a
              globally distributed infrastructure.
            </p>
            <div className={styles.tagCloud}>
              {[
                "Inventory Sync",
                "Order Automation",
                "AI Analysis",
                "Multi-channel",
                "Real-time Analytics",
                "Webhook Support",
                "Global Scale",
                "Cloud Native",
                "High Performance",
              ].map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
