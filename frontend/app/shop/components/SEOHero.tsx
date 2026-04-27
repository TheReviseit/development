"use client";

import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import styles from "./ShopHero.module.css";

// Props for SEO Hero to dynamically render content based on keyword
export interface SEOHeroProps {
  headlinePre: string;
  headlineHighlight: string;
  headlinePost?: string;
  subtitle: string;
  primaryCtaText?: string;
  primaryCtaLink?: string;
  heroImageAlt: string;
}

export default function SEOHero({
  headlinePre,
  headlineHighlight,
  headlinePost = "",
  subtitle,
  primaryCtaText = "Try Now",
  primaryCtaLink = "/signup",
  heroImageAlt,
}: SEOHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        {/* ---- Left Content ---- */}
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            {headlinePre}
            <br />
            {headlinePost && (
              <>
                {headlinePost}
                <br />
              </>
            )}
            <span className={styles.heroTitleAccent}>{headlineHighlight}</span>
          </h1>

          <p className={styles.heroSubtitle}>{subtitle}</p>

          <div className={styles.heroCtas}>
            <Link href={primaryCtaLink} className={styles.btnPrimary}>
              {primaryCtaText}
            </Link>
            <Link href="/login" className={styles.btnSecondary}>
              Login
            </Link>
          </div>
        </div>

        {/* ---- Right Visual Composition ---- */}
        <div className={styles.heroVisual}>
          <div className={styles.heroPhoto}>
            <Image
              src="/shop-photos/hero.avif"
              alt={heroImageAlt}
              width={340}
              height={420}
              priority
            />
          </div>

          <div className={`${styles.floatingCard} ${styles.cardSales}`}>
            <div className={styles.cardCheckCircle}>
              <Check size={14} color="#fff" strokeWidth={3} />
            </div>
            <span className={styles.cardText}>Increase Sales</span>
          </div>

          <div className={`${styles.floatingCard} ${styles.cardFromVideo}`}>
            <div className={styles.cardCheckCircle}>
              <Check size={14} color="#fff" strokeWidth={3} />
            </div>
            <span className={styles.cardText}>Add to cart from video</span>
          </div>

          <div className={`${styles.floatingCard} ${styles.cardRating}`}>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
            <span className={styles.ratingStar}>★</span>
          </div>

          <div className={`${styles.floatingCard} ${styles.cardProduct}`}>
            <div className={styles.cardProductInner}>
              <div className={styles.productThumb}>
                <span className={styles.productTimestamp}>New</span>
                <Image
                  src="https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=320&fit=crop&crop=top"
                  alt="Product thumbnail"
                  width={150}
                  height={160}
                  className={styles.productThumbImg}
                />
              </div>
              <div className={styles.productCartBtn}>Add to cart</div>
            </div>
          </div>

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

          <div className={styles.cardStat}>
            <div className={styles.cardStatLabel}>UP TO</div>
            <div className={styles.cardStatValue}>20X</div>
            <div className={styles.cardStatDesc}>Jump in product discovery</div>
          </div>

          <div className={`${styles.floatingCard} ${styles.cardInfo}`}>
            <div className={styles.cardInfoName}>
              SABINE Backless Maxi Dress in Black
            </div>
            <div className={styles.cardInfoPrice}>$ 159.00 USD</div>
            <div className={styles.cardInfoBtn}>Shop Now</div>
          </div>
        </div>
      </div>
    </section>
  );
}
