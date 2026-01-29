/**
 * Performance Optimization Utilities for Authentication Flow
 *
 * This module provides advanced performance optimizations including:
 * - Route preloading on hover
 * - Predictive prefetching
 * - Resource hints
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

/**
 * Preload a route when user hovers over a link
 * This reduces perceived latency by prefetching the next page
 */
export function useRoutePreload() {
  const router = useRouter();

  const preloadRoute = useCallback(
    (route: string) => {
      // Next.js router.prefetch for instant navigation
      router.prefetch(route);
    },
    [router],
  );

  return preloadRoute;
}

/**
 * Enhanced button with hover preloading
 * Usage example:
 *
 * const handleMouseEnter = useHoverPreload('/dashboard');
 * <a onMouseEnter={handleMouseEnter}>Dashboard</a>
 */
export function useHoverPreload(route: string) {
  const preloadRoute = useRoutePreload();
  let timeoutId: NodeJS.Timeout;

  const handleMouseEnter = useCallback(() => {
    // Delay preload by 100ms to avoid preloading on accidental hovers
    timeoutId = setTimeout(() => {
      preloadRoute(route);
    }, 100);
  }, [route, preloadRoute]);

  const handleMouseLeave = useCallback(() => {
    // Cancel preload if user moves away quickly
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }, []);

  return { handleMouseEnter, handleMouseLeave };
}

/**
 * Predictive preloading based on user behavior
 * Preloads likely next pages based on auth state
 */
export function usePredictivePreload(
  isAuthenticated: boolean,
  onboardingCompleted: boolean | null,
) {
  const router = useRouter();

  useEffect(() => {
    // Don't preload until we know the auth state
    if (onboardingCompleted === null) return;

    // Preload likely destinations after a short delay
    const preloadTimeout = setTimeout(() => {
      if (isAuthenticated) {
        // User is logged in - preload dashboard or onboarding
        if (onboardingCompleted) {
          router.prefetch("/dashboard");
        } else {
          router.prefetch("/onboarding");
        }
      } else {
        // User is not logged in - preload login and signup
        router.prefetch("/login");
        router.prefetch("/signup");
      }
    }, 1000); // Wait 1 second before preloading

    return () => clearTimeout(preloadTimeout);
  }, [isAuthenticated, onboardingCompleted, router]);
}

/**
 * Add resource hints to improve loading performance
 * Call this in your layout or root component
 */
export function addResourceHints() {
  if (typeof window === "undefined") return;

  // DNS prefetch for external resources
  const dnsPrefetchDomains = [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
  ];

  // Preconnect for critical resources
  const preconnectDomains = [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
  ];

  // Add DNS prefetch links
  dnsPrefetchDomains.forEach((domain) => {
    if (!document.querySelector(`link[href="${domain}"][rel="dns-prefetch"]`)) {
      const link = document.createElement("link");
      link.rel = "dns-prefetch";
      link.href = domain;
      document.head.appendChild(link);
    }
  });

  // Add preconnect links
  preconnectDomains.forEach((domain) => {
    if (!document.querySelector(`link[href="${domain}"][rel="preconnect"]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = domain;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  });
}

/**
 * Measure and log performance metrics
 * Useful for monitoring auth flow performance
 */
export function measureAuthPerformance(
  eventName: string,
  startTime: number,
  metadata?: Record<string, any>,
) {
  const duration = performance.now() - startTime;

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[Performance] ${eventName}: ${duration.toFixed(2)}ms`,
      metadata,
    );
  }

  // Send to analytics in production
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "timing_complete", {
      name: eventName,
      value: Math.round(duration),
      event_category: "Auth Flow",
      ...metadata,
    });
  }

  return duration;
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
