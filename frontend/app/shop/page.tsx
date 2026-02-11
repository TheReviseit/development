/**
 * Shop Product Landing Page
 * Domain: shop.flowauxi.com
 *
 * Architecture: Thin orchestrator — all sections are separate components
 * with dedicated CSS Module files. No inline styles.
 */

import ShopNavbar from "./components/ShopNavbar";
import ShopHero from "./components/ShopHero";
import ShopFeatures from "./components/ShopFeatures";
import ShopShowcase from "./components/ShopShowcase";
import ShopSteps from "./components/ShopSteps";
import ShopTrust from "./components/ShopTrust";
import ShopCTA from "./components/ShopCTA";
import ShopFooter from "./components/ShopFooter";

export default function ShopLandingPage() {
  return (
    <>
      <ShopNavbar />
      <main>
        <ShopHero />
        <ShopFeatures />
        <ShopShowcase />
        <ShopSteps />
        <ShopTrust />
        <ShopCTA />
      </main>
      <ShopFooter />
    </>
  );
}
