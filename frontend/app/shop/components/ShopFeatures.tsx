"use client";

import {
  BarChart3,
  Package,
  ShoppingBag,
  Zap,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import { motion, Variants } from "framer-motion";
import styles from "./ShopFeatures.module.css";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
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
      type: "spring",
      stiffness: 100,
      damping: 20,
    },
  },
};

const leftBentoItem: Variants = {
  hidden: { opacity: 0, x: -30, scale: 0.9 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 80,
      damping: 15,
    },
  },
};

const centeredTextItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 1,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const rightTextItem: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 1,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function ShopFeatures() {
  return (
    <section id="features" className={styles.features}>
      <motion.div
        className={styles.featuresInner}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={containerVariants}
      >
        {/* Premium Tag - Global Header for the section */}
        <motion.div className={styles.premiumTag} variants={centeredTextItem}>
          <span className={styles.tagLine}></span>
          All-in-one Commerce Platform
          <span className={styles.tagLine}></span>
        </motion.div>

        {/* Enterprise Hero Bento Section */}
        <div className={styles.heroSplitContainer}>
          {/* Left: Visual Bento Grid */}
          <div className={styles.heroVisualBento}>
            <motion.div
              className={styles.heroMainImageCard}
              variants={leftBentoItem}
            >
              <img
                src="/team.png"
                alt="Our Team"
                className={styles.heroImage}
              />
              <div className={styles.heroImageOverlay} />
            </motion.div>

            <motion.div
              className={`${styles.heroAccentCard} ${styles.accentGrowth}`}
              variants={leftBentoItem}
            >
              <div className={styles.accentHeader}>
                <TrendingUp className={styles.accentIcon} size={22} />
                <span className={styles.accentLabel}>Revenue</span>
              </div>
              <div className={styles.accentData}>
                <span className={styles.accentValue}>+145%</span>
                <p className={styles.accentPara}>Growth achieved with AI</p>
              </div>
            </motion.div>

            <motion.div
              className={`${styles.heroAccentCard} ${styles.accentActive}`}
              variants={leftBentoItem}
            >
              <div className={styles.accentHeader}>
                <ShoppingBag className={styles.accentIcon} size={22} />
                <span className={styles.accentLabel}>Merchants</span>
              </div>
              <div className={styles.accentData}>
                <span className={styles.accentValue}>10k+</span>
                <p className={styles.accentPara}>Trust our platform daily</p>
              </div>
            </motion.div>
          </div>

          {/* Right: Typography Column */}
          <div className={styles.heroTextColumn}>
            <motion.div className={styles.headerText} variants={rightTextItem}>
              <h2 className={styles.sectionTitle}>
                Everything you need to sell online{" "}
                <span className={styles.greyText}>
                  with AI-driven efficiency.
                </span>
              </h2>
              <p className={styles.heroSubDescription}>
                Scale your business with an enterprise-grade platform built for
                modern commerce and autonomous operations.
              </p>
            </motion.div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className={styles.bentoGrid}>
          {/* Card 1: Tall Card - Smart Dashboard */}
          <motion.div
            className={`${styles.card} ${styles.tall}`}
            variants={itemVariants}
          >
            <div className={styles.cardInfo}>
              <h3 className={styles.cardTitle}>Smart Dashboard</h3>
              <p className={styles.cardDesc}>
                Real-time insights into bookings, revenue, and customer
                behavior. Make data-driven decisions instantly.
              </p>
            </div>
            <div className={styles.cardVisual}>
              <div className={styles.researchCircle}>
                <div className={styles.mainIcon}>
                  <BarChart3 size={32} />
                </div>
                {[
                  {
                    icon: <TrendingUp size={18} />,
                    pos: { top: "10%", left: "50%" },
                  },
                  {
                    icon: <Package size={18} />,
                    pos: { top: "30%", right: "5%" },
                  },
                  {
                    icon: <ShoppingBag size={18} />,
                    pos: { bottom: "10%", right: "20%" },
                  },
                  {
                    icon: <MessageSquare size={18} />,
                    pos: { bottom: "10%", left: "20%" },
                  },
                  { icon: <Zap size={18} />, pos: { top: "30%", left: "5%" } },
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    className={styles.orbitalIcon}
                    style={item.pos}
                    animate={{
                      y: [0, -5, 0],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      delay: idx * 0.5,
                      ease: "easeInOut",
                    }}
                  >
                    {item.icon}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Card 2: Wide Card - Product Management */}
          <motion.div
            className={`${styles.card} ${styles.wide}`}
            variants={itemVariants}
          >
            <div className={styles.cardInfo}>
              <h3 className={styles.cardTitle}>Product Management</h3>
              <p className={styles.cardDesc}>
                Intuitive catalog management with bulk operations and automated
                inventory tracking.
              </p>
            </div>
            <div className={styles.cardVisual}>
              <div className={styles.draftingPreview}>
                <div className={styles.docHeader}>Inventory Update</div>
                <div className={styles.docBody}>
                  Updating stock for{" "}
                  <span className={styles.highlight}>New Arrivals</span> ...
                  Auto-syncing across channels.
                </div>
                <motion.div
                  className={styles.docCursor}
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              </div>
            </div>
          </motion.div>

          {/* Card 3: Standard Card - AI Automation */}
          <motion.div className={styles.card} variants={itemVariants}>
            <div className={styles.cardInfo}>
              <h3 className={styles.cardTitle}>AI Automation</h3>
            </div>
            <div className={styles.cardVisual}>
              <div className={styles.insightsVisual}>
                <div className={styles.insightBox}>
                  <span>Bookings</span>
                  <div className={styles.fileIcon}>SYNC</div>
                </div>
                <div className={styles.insightDivider}>
                  <motion.div
                    className={styles.insightNode}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Zap size={16} />
                  </motion.div>
                </div>
                <div className={styles.insightBox}>
                  <span>Growth</span>
                  <div className={styles.summaryLines}>
                    <div className={styles.line}></div>
                    <div className={styles.line}></div>
                    <div className={styles.line}></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Dark Green Card - Orders & Fulfillment */}
          <motion.div
            className={`${styles.card} ${styles.darkGreen}`}
            variants={itemVariants}
          >
            <div className={styles.cardInfo}>
              <h3 className={styles.cardTitle}>Order & Booking Management</h3>
              <p className={styles.cardDesc}>
                Automated confirmation and status updates powered by AI agents.
              </p>
            </div>
            <div className={styles.cardVisual}>
              <div className={styles.managementVisual}>
                <motion.div
                  className={styles.managementPulse}
                  animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <div className={styles.managementContent}>
                  <Zap size={32} className={styles.managementIcon} />
                  <div className={styles.managementLines}>
                    <div className={styles.line}></div>
                    <div className={styles.line}></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 5: Lavender Card - Made in India */}
          <motion.div
            className={`${styles.card} ${styles.lavender}`}
            variants={itemVariants}
          >
            <div className={styles.cardInfo}>
              <h3 className={styles.cardTitle}>Made in India</h3>
            </div>
            <div className={styles.cardVisual}>
              <div className={styles.starCircle}>
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={styles.star}
                    style={{ transform: `rotate(${i * 30}deg)` }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  >
                    ★
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
