/**
 * DEPRECATED: This page is no longer used.
 * Plan selection is now handled directly in /console/otp (Upgrade page)
 * Redirecting to /console/otp for backwards compatibility
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SelectPlanPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main upgrade page
    router.replace("/console/otp");
  }, [router]);

  return (
    <div style={{ color: "white", textAlign: "center", padding: "80px 0" }}>
      Redirecting...
    </div>
  );
}
