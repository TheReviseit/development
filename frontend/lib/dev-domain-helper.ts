/**
 * Development Domain Helper
 *
 * This utility helps you test different product domains in local development.
 *
 * Usage in browser console:
 *   setDevDomain('shop')     // Simulate shop.flowauxi.com
 *   setDevDomain('showcase') // Simulate showcase.flowauxi.com
 *   setDevDomain('marketing')// Simulate marketing.flowauxi.com
 *   setDevDomain('dashboard')// Reset to default
 *   clearDevDomain()         // Clear override
 */

export type DevDomain = "shop" | "showcase" | "marketing" | "api" | "dashboard";

/**
 * Set development domain override (persists in localStorage)
 */
export function setDevDomain(domain: DevDomain): void {
  if (typeof window === "undefined") {
    console.error("❌ setDevDomain() can only be called in browser");
    return;
  }

  const validDomains: DevDomain[] = [
    "shop",
    "showcase",
    "marketing",
    "api",
    "dashboard",
  ];

  if (!validDomains.includes(domain)) {
    console.error(
      `❌ Invalid domain: ${domain}. Must be one of: ${validDomains.join(", ")}`,
    );
    return;
  }

  localStorage.setItem("DEV_DOMAIN", domain);
  console.log(`✅ Dev domain set to: ${domain}`);
  console.log(`🔄 Reload page to see changes: window.location.reload()`);
}

/**
 * Get current development domain override
 */
export function getDevDomain(): DevDomain | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("DEV_DOMAIN") as DevDomain | null;
}

/**
 * Clear development domain override
 */
export function clearDevDomain(): void {
  if (typeof window === "undefined") {
    console.error("❌ clearDevDomain() can only be called in browser");
    return;
  }

  localStorage.removeItem("DEV_DOMAIN");
  console.log("✅ Dev domain override cleared");
  console.log("🔄 Reload page to see changes: window.location.reload()");
}

/**
 * Print current domain configuration
 */
export function printDomainInfo(): void {
  if (typeof window === "undefined") return;

  const override = getDevDomain();
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  console.log("🌐 Domain Configuration:");
  console.log(`   Hostname: ${hostname}`);
  console.log(`   Pathname: ${pathname}`);
  console.log(`   Override: ${override || "none"}`);
  console.log(
    `   Detected: ${getProductFromDomain(hostname, new URLSearchParams(), pathname)}`,
  );
}

// Expose to window for console access
if (typeof window !== "undefined") {
  (window as any).setDevDomain = setDevDomain;
  (window as any).clearDevDomain = clearDevDomain;
  (window as any).getDevDomain = getDevDomain;
  (window as any).printDomainInfo = printDomainInfo;

  console.log("🔧 Dev domain helpers loaded:");
  console.log('   setDevDomain("shop")    - Test shop domain');
  console.log('   setDevDomain("showcase") - Test showcase domain');
  console.log("   clearDevDomain()         - Clear override");
  console.log("   printDomainInfo()        - Show config");
}

// Import getProductFromDomain for printDomainInfo
import { getProductFromDomain } from "./domain-policy";
