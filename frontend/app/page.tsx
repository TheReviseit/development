import { headers } from "next/headers";
import { homeMetadata } from "./metadata";
import HomePageContent from "./components/HomePageContent";
import ShopLandingPage from "./(shop)/page";

/**
 * Dynamic Root Page
 * Renders different landing pages based on port (dev) or subdomain (prod)
 */

export const metadata = homeMetadata;

async function getProductFromRequest() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // Check port in development
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    if (host.includes(":3001")) return "shop";
    if (host.includes(":3002")) return "marketing";
    if (host.includes(":3003")) return "showcase";
  }

  // Check subdomain in production
  if (host.startsWith("shop.")) return "shop";
  if (host.startsWith("marketing.")) return "marketing";
  if (host.startsWith("showcase.")) return "showcase";

  // Default: dashboard
  return "dashboard";
}

export default async function Home() {
  const product = await getProductFromRequest();

  // Render product-specific landing page
  switch (product) {
    case "shop":
      return <ShopLandingPage />;
    case "marketing":
      // TODO: Create marketing landing page
      return <div>Marketing Landing Page (Coming Soon)</div>;
    case "showcase":
      // TODO: Create showcase landing page
      return <div>Showcase Landing Page (Coming Soon)</div>;
    default:
      // Default dashboard/WhatsApp home
      return <HomePageContent />;
  }
}
