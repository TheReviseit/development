"use client";

import { useState } from "react";
import AnalyticsView from "./components/AnalyticsView";
import MarketingAnalyticsView from "./components/MarketingAnalyticsView";
import { getProductDomainFromBrowser } from "@/lib/domain/client";

export default function DashboardPage() {
  const [domain] = useState(() => getProductDomainFromBrowser());

  if (domain === "marketing") {
    return <MarketingAnalyticsView />;
  }

  return <AnalyticsView />;
}
