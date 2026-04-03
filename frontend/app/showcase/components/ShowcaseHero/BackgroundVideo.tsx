"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ShowcaseHero.module.css";

interface BackgroundVideoProps {
  src: string;
}

export default function BackgroundVideo({ src }: BackgroundVideoProps) {
  const videoRef = useRef<any>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);

  useEffect(() => {
    // 1. Accessibility & Performance Guard: Check for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    // 2. Performance Guard: Don't load on "Save Data" networks (FAANG Level)
    // @ts-ignore - navigator.connection is experimental but supported in Chrome
    const connection = navigator.connection;
    if (connection && (connection.saveData || connection.effectiveType === '2g')) {
       return;
    }

    // 3. Intersection Observer for Progressive Loading (rootMargin: '200px')
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Trigger load when within 200px of scrolling to it
          loadVideoContent();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    // 4. Idle/Delay Fallback: Load anyway after 3 seconds if browser is idle
    const idleTimer = setTimeout(() => {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            window.requestIdleCallback(() => {
                loadVideoContent();
            });
        } else {
            loadVideoContent();
        }
    }, 3000);

    function loadVideoContent() {
      setShouldLoad(true);
      clearTimeout(idleTimer);
    }

    return () => {
      observer.disconnect();
      clearTimeout(idleTimer);
    };
  }, []);

  if (!shouldLoad) {
    return <div ref={videoRef} className={styles.bgVideoPlaceholder} />;
  }

  return (
    <video
      ref={videoRef}
      className={styles.bgVideo}
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
