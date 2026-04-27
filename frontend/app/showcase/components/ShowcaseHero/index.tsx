"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import styles from "./ShowcaseHero.module.css";
import { Star, Check, ArrowUpRight } from "lucide-react";

// FAANG Level Optimization: Dynamically load video component ONLY on client
const BackgroundVideo = dynamic(() => import("./BackgroundVideo"), { 
    ssr: false,
    loading: () => <div className={styles.bgVideoPlaceholder} />
});

const carouselItems = [
  {
    src: "/pages/carosel-img-1.jpg",
    title: "Handcrafted Facial Cream",
    desc: "Organic & natural beauty products for your skin.",
    tag: "Beauty",
    smallImg: "/pages/carosel-img-1-smallbox.jpg",
    smallTitle1: "Facial",
    smallTitle2: "Cream",
    smallPrice: "$24.99",
    smallRating: "New",
    bubble1: "Is it organic?",
    bubble2: "Will it suit sensitive skin?",
    statsLabel: "UP TO",
    statsValue: "95%",
    statsDesc: "Self-renewal rate",
  },
  {
    src: "/pages/carosel-img-2.jpg",
    title: "Artisanal Cakes",
    desc: "Freshly baked homemade cakes for your special occasions.",
    tag: "Bakery",
    smallImg: "/pages/carosel-img-2-smallbox.jpg",
    smallTitle1: "Artisanal",
    smallTitle2: "Cakes",
    smallPrice: "$45.00",
    smallRating: "4.9",
    bubble1: "Do you deliver today?",
    bubble2: "Eggless options available?",
    statsLabel: "MADE",
    statsValue: "Fresh",
    statsDesc: "Every week",
  },
  {
    src: "/pages/carosel-img-3.jpg",
    title: "Handmade Jewellery",
    desc: "Unique custom designs from local independent artisans.",
    tag: "Crafts",
    smallImg: "/pages/carosel-img-3-smallbox.jpg",
    smallTitle1: "Custom",
    smallTitle2: "Jewellery",
    smallPrice: "$85.50",
    smallRating: "5.0",
    bubble1: "Is it real gold?",
    bubble2: "Can I customize the size?",
    statsLabel: "OVER",
    statsValue: "3k+",
    statsDesc: "Happy customers",
  },
  {
    src: "/pages/carosel-img-4.jpg",
    title: "Homemade Snacks",
    desc: "Quality local products delivered right to your door.",
    tag: "Food",
    smallImg: "/pages/carosel-img-4-smallbox.jpg",
    smallTitle1: "Homemade",
    smallTitle2: "Snacks",
    smallPrice: "$12.99",
    smallRating: "4.7",
    bubble1: "How spicy is this?",
    bubble2: "Are these homemade?",
    statsLabel: "STRICTLY",
    statsValue: "100%",
    statsDesc: "Preservative free",
  },
  {
    src: "/pages/carosel-img-5.jpg",
    title: "Traditional Sweets",
    desc: "Authentic flavors crafted with age-old family recipes.",
    tag: "Sweets",
    smallImg: "/pages/carosel-img-5-smallbox.jpg",
    smallTitle1: "Traditional",
    smallTitle2: "Sweets",
    smallPrice: "$18.50",
    smallRating: "4.9",
    bubble1: "Pure Ghee used?",
    bubble2: "Bulk orders for festivals?",
    statsLabel: "TOP",
    statsValue: "4.9/5",
    statsDesc: "Gifting rating",
  },
];

export default function ShowcaseHero() {
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIdx((prevIdx) => (prevIdx + 1) % carouselItems.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className={styles.heroSection}>
      {/* Background Layer: Elite Progressive Loading (LCP Image -> Lazy Video) */}
      <div className={styles.bgVideo}>
        <Image
          src="/pages/video-thumbnail.webp"
          alt="Grow+ Platform Showcase Background"
          fill
          priority
          // @ts-ignore - fetchPriority is supported in latest Next.js/React versions
          fetchPriority="high"
          placeholder="blur"
          blurDataURL="data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAADQAQCdASoKAAYAAUAmJZgCdADbIP/KAAD+/lCaWX8/9ingZLNESWK9em3uPZHZRKujvcpzyh+FuMQoGf+QthKGfewpurxJ3u2/vV+Q8OQZIYwXIvLuokQEAAA="
          style={{ objectFit: "cover" }}
          sizes="100vw"
        />
      </div>
      
      <BackgroundVideo src="/pages/pages-hero-bg-video.mp4" />
      
      <div className={styles.videoOverlay}></div>

      <div className={styles.heroContainer}>
        {/* Left Column: Typography & CTAs */}
        <div className={styles.leftCol}>
          {/* User Stat Pill */}
          <div className={styles.statPillWrapper}>
            <div className={styles.statIconBadge}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="8" cy="12" r="3" fill="#fff" />
                <circle cx="16" cy="12" r="3" fill="#fff" />
              </svg>
            </div>
            <div className={styles.statPillText}>
              <span className={styles.statUsers}>About Flowauxi</span>
              <span className={styles.statRead}>
                Your <u>Growth Partner</u>
              </span>
            </div>
          </div>

          {/* Heading */}
          <h1 className={styles.heading}>
            Grow<sup className={styles.plusSign}>+</sup>
          </h1>

          {/* Subtitle */}
          <p className={styles.subtitle}>
            Drive Sales Growth, And Harness Ai-Powered User Content — Up To 50x
            Faster.
          </p>

          {/* Guarantee / Review */}
          <div className={styles.reviewWrapper}>
            <div className={styles.avatars}>
              {/* Fake avatar using div for now or unspash */}
              <div className={styles.avatarCircle}>
                <Image
                  src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop"
                  alt="User avatar"
                  width={36}
                  height={36}
                  className={styles.avatarImg}
                />
              </div>
            </div>
            <div className={styles.reviewDetails}>
              <div className={styles.reviewTopLine}>
                <span className={styles.lovedText}>Loved the performance</span>
                <span className={styles.slash}>/</span>
                <div className={styles.starRating}>
                  <Star fill="#000" size={14} strokeWidth={0} />
                  <strong>4.9</strong>
                </div>
              </div>
              <div className={styles.satisfaction}>100% Satisfied</div>
            </div>
          </div>

          <div className={styles.divider}></div>

          {/* Buttons */}
          <div className={styles.btnGroup}>
<Link href="/signup" className={styles.primaryBtn}>
                <strong>Get Started</strong> — It&apos;s Free
              </Link>
            <Link href="/pricing" className={styles.secondaryLink}>
              Our Pricing <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>

        {/* Right Column: Visual Composition */}
        <div className={styles.rightCol}>
          {/* Main Orange Backing Image Box Carousel */}
          <div className={styles.orangeImageBox}>
            {carouselItems.map((item, idx) => (
              <div
                key={item.src}
                className={styles.carouselSlide}
                style={{
                  transform: `translateX(${(idx - currentIdx) * 100}%)`,
                }}
              >
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  style={{ objectPosition: "top", objectFit: "cover" }}
                  priority={idx === 0}
                />

                {/* Glassmorphism Text Overlay */}
                <div className={styles.slideOverlayCard}>
                  <div className={styles.slideOverlayTag}>{item.tag}</div>
                  <h3 className={styles.slideOverlayTitle}>{item.title}</h3>
                  <p className={styles.slideOverlayDesc}>{item.desc}</p>
                </div>
              </div>
            ))}
            {/* Soft gradient overlay on image to match the mockup vibe slightly */}
            <div className={styles.imgOverlay}></div>
          </div>

          {/* Float 1: Dynamic Chat bubbles */}
          <div className={`${styles.chatBubble} ${styles.chatBubbleTop}`}>
            <div className={`${styles.checkCircle} ${styles.checkOrange}`}>
              <Check size={12} strokeWidth={4} color="#fff" />
            </div>
            <span key={carouselItems[currentIdx].bubble1}>{carouselItems[currentIdx].bubble1}</span>
          </div>
          <div className={`${styles.chatBubble} ${styles.chatBubbleBottom}`}>
            <div className={`${styles.checkCircle} ${styles.checkBlue}`}>
              <Check size={12} strokeWidth={4} color="#fff" />
            </div>
            <span key={carouselItems[currentIdx].bubble2}>{carouselItems[currentIdx].bubble2}</span>
          </div>

          {/* Float 2: Dynamic Top Right Stats Card */}
          <div className={styles.statsCard}>
            <div className={styles.statsLabel}>{carouselItems[currentIdx].statsLabel}</div>
            <div className={styles.statsPercentage}>{carouselItems[currentIdx].statsValue}</div>
            <div className={styles.statsDesc}>{carouselItems[currentIdx].statsDesc}</div>
          </div>

          {/* Float 3: Bottom Right Glassmorphic Product Card */}
          <div className={styles.productCard}>
            <div className={styles.shoeImgWrapper} style={{ position: "relative" }}>
              {carouselItems.map((item, idx) => (
                <div
                  key={item.smallImg}
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `translateX(${(idx - currentIdx) * 100}%)`,
                    transition: "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)",
                  }}
                >
                  <Image
                    src={item.smallImg}
                    alt={`${item.smallTitle1} ${item.smallTitle2}`}
                    width={120}
                    height={120}
                    className={styles.shoeImg}
                  />
                </div>
              ))}
            </div>
            <div className={styles.productDetails}>
              <h3 className={styles.productTitle}>
                {carouselItems[currentIdx].smallTitle1}
                <br />
                {carouselItems[currentIdx].smallTitle2}
              </h3>
              <div className={styles.productPrice}>{carouselItems[currentIdx].smallPrice}</div>
              <div className={styles.productRating}>
                <Star fill="#000" size={14} strokeWidth={0} />
                <span>{carouselItems[currentIdx].smallRating}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
