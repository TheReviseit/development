"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, ShoppingBag } from "lucide-react";
import DemoModal from "./DemoModal";
import styles from "./ShopHero.module.css";

/**
 * ShopHero — reel.ai-inspired hero section
 * Left: trust badge, massive headline, pill CTAs
 * Right: hero photo with tightly composed floating UI cards
 */
export default function ShopHero() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        {/* ---- Left Content ---- */}
        <div className={styles.heroContent}>
          {/* Trust badge
          <div className={styles.trustBadge}>
            <span className={styles.trustStar}>★</span>
            <span>
              <span className={styles.trustScore}>4.7</span> on TrustPilot
            </span>
          </div> */}

          {/* Headline */}
          <h1 className={styles.heroTitle}>
            Boost your
            <br />
            sales with
            <br />
            <span className={styles.heroTitleAccent}>Smart Commerce</span>
          </h1>

          {/* Subtitle */}
          <p className={styles.heroSubtitle}>
            Packed with AI-powered automation, real-time analytics, WhatsApp
            commerce &amp; more — everything you need to run your business, 10x
            faster.
          </p>

          {/* CTA Buttons */}
          <div className={styles.heroCtas}>
            <Link href="/signup" className={styles.btnPrimary}>
              Get Started
            </Link>
            <button
              className={styles.btnSecondary}
              onClick={() => setDemoOpen(true)}
            >
              See Demo
            </button>
          </div>
        </div>

        {/* ---- Right Visual Composition ---- */}
        <div className={styles.heroVisual}>
          {/* Main photo — user's own hero image */}
          <div className={styles.heroPhoto}>
            <Image
              src="/shop-photos/hero.avif"
              alt="Flowauxi commerce platform in action"
              width={340}
              height={420}
              priority
            />
          </div>

          {/* Floating Card: Increase Sales — top right */}
          <div className={`${styles.floatingCard} ${styles.cardSales}`}>
            <div className={styles.cardCheckCircle}>
              <Check size={14} color="#fff" strokeWidth={3} />
            </div>
            <span className={styles.cardText}>Increase Sales</span>
          </div>

          {/* Floating Card: Add to cart from video — below sales */}
          <div className={`${styles.floatingCard} ${styles.cardFromVideo}`}>
            <div className={styles.cardCheckCircle}>
              <Check size={14} color="#fff" strokeWidth={3} />
            </div>
            <span className={styles.cardText}>Add to cart from video</span>
          </div>

          {/* Floating Card: Star Rating — left of photo */}
          <div className={`${styles.floatingCard} ${styles.cardRating}`}>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
          </div>

          {/* Floating Card: Product Thumbnail — left of photo, with real product image */}
          <div className={`${styles.floatingCard} ${styles.cardProduct}`}>
            <div className={styles.cardProductInner}>
              <div className={styles.productThumb}>
                <span className={styles.productTimestamp}>New</span>
                <Image
                  src="https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=320&fit=crop&crop=top"
                  alt="SABINE Dress detail"
                  width={150}
                  height={160}
                  className={styles.productThumbImg}
                />
              </div>
              <div className={styles.productCartBtn}>Add to cart</div>
            </div>
          </div>

          {/* Floating Card: Tags — bottom left */}
          <div className={`${styles.floatingCard} ${styles.cardTags}`}>
            <div className={styles.cardTagsTitle}>Add tags to your video</div>
            <div className={styles.tagsRow}>
              <span className={styles.tag}>
                <span className={styles.tagPlus}>+</span> Black
              </span>
              <span className={styles.tag}>
                <span className={styles.tagPlus}>+</span> Trouser
              </span>
              <span className={styles.tag}>
                <span className={styles.tagPlus}>+</span> Fashion
              </span>
            </div>
          </div>

          {/* Floating Card: 20X Stat — right bottom */}
          <div className={styles.cardStat}>
            <div className={styles.cardStatLabel}>UP TO</div>
            <div className={styles.cardStatValue}>20X</div>
            <div className={styles.cardStatDesc}>Jump in product discovery</div>
          </div>

          {/* Floating Card: Product Info — bottom center */}
          <div className={`${styles.floatingCard} ${styles.cardInfo}`}>
            <div className={styles.cardInfoName}>
              SABINE Backless Maxi Dress in Black
            </div>
            <div className={styles.cardInfoPrice}>$ 159.00 USD</div>
            <div className={styles.cardInfoBtn}>Shop Now</div>
          </div>
        </div>
      </div>

      {/* Demo Video Modal */}
      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </section>
  );
}
