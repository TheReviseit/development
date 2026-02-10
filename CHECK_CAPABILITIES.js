/**
 * Diagnostic Script - Run in Browser Console
 *
 * This will show you exactly what capabilities the frontend is seeing
 */

// 1. Check what the sidebar received
console.log("=== DIAGNOSING SHOP FEATURES ===");

// 2. Fetch fresh capabilities
fetch("/api/ai-capabilities")
  .then((res) => res.json())
  .then((data) => {
    console.log("✅ Capabilities API Response:", data);

    if (data.success && data.data) {
      const caps = data.data;
      console.log("\n📊 Individual Capability Values:");
      console.log("  - order_booking_enabled:", caps.order_booking_enabled);
      console.log("  - products_enabled:", caps.products_enabled);
      console.log("  - shop_enabled:", caps.shop_enabled);
      console.log(
        "  - appointment_booking_enabled:",
        caps.appointment_booking_enabled,
      );

      // Check if they're false
      if (!caps.order_booking_enabled) {
        console.error(
          "\n❌ order_booking_enabled is FALSE - this is why Orders is hidden",
        );
        console.log("💡 Run this SQL in Supabase:");
        console.log(
          "   UPDATE ai_capabilities SET order_booking_enabled = TRUE WHERE user_id IS NOT NULL;",
        );
      } else {
        console.log("\n✅ order_booking_enabled is TRUE");
      }

      if (!caps.products_enabled) {
        console.error(
          "\n❌ products_enabled is FALSE - this is why Products is hidden",
        );
        console.log("💡 Run this SQL in Supabase:");
        console.log(
          "   UPDATE ai_capabilities SET products_enabled = TRUE WHERE user_id IS NOT NULL;",
        );
      } else {
        console.log("\n✅ products_enabled is TRUE");
      }
    }
  })
  .catch((err) => {
    console.error("❌ Failed to fetch capabilities:", err);
  });

// 3. Check localStorage domain override
console.log(
  "\n🔧 Domain Override:",
  localStorage.getItem("DEV_DOMAIN") || "none",
);

console.log("\n📋 NEXT STEPS:");
console.log("1. If capabilities show FALSE → Run SQL UPDATE in Supabase");
console.log("2. Hard refresh browser (Ctrl+Shift+R)");
console.log("3. Run this script again to verify");
