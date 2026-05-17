import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isValidProductDomain,
  resolveDomain,
  type ProductDomain,
} from "@/lib/domain/config";

type PricingPlanRow = {
  plan_slug: string | null;
  display_name: string | null;
  description: string | null;
  amount_paise: number | null;
  currency: string | null;
  billing_cycle: string | null;
  features_json: unknown;
  limits_json: unknown;
};

function resolvePricingDomain(request: NextRequest): ProductDomain {
  const headerDomain =
    request.headers.get("x-tenant-domain") ||
    request.headers.get("x-product-domain");

  if (headerDomain && isValidProductDomain(headerDomain)) {
    return headerDomain;
  }

  const host = request.headers.get("host") || "";
  const [hostname, explicitPort] = host.split(":");
  const port = explicitPort || request.nextUrl.port;
  return resolveDomain(hostname, port);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function formatPrice(amountPaise: number, currency = "INR") {
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
  };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${(amountPaise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export async function GET(request: NextRequest) {
  const domain = resolvePricingDomain(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        success: false,
        domain,
        error: "Pricing service is not configured",
        errorCode: "PRICING_SERVICE_MISCONFIGURED",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("pricing_plans")
    .select(
      "plan_slug, display_name, description, amount_paise, currency, billing_cycle, features_json, limits_json",
    )
    .eq("product_domain", domain)
    .eq("billing_cycle", "monthly")
    .eq("is_active", true)
    .is("effective_to", null)
    .order("amount_paise", { ascending: true });

  if (error) {
    console.error("[pricing/plans] DB lookup failed", {
      domain,
      code: error.code,
      message: error.message,
    });

    return NextResponse.json(
      {
        success: false,
        domain,
        error: "Failed to load pricing plans",
        errorCode: "PRICING_LOOKUP_FAILED",
      },
      { status: 500 },
    );
  }

  const rows = (data || []) as PricingPlanRow[];

  if (rows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        domain,
        plans: [],
        error: `No active pricing plans are configured for ${domain}`,
        errorCode: "PRICING_NOT_CONFIGURED",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      domain,
      plans: rows.map((plan) => {
        const amountPaise = plan.amount_paise || 0;
        const currency = plan.currency || "INR";

        return {
          plan_slug: plan.plan_slug,
          display_name: plan.display_name,
          description: plan.description || "",
          amount_paise: amountPaise,
          price_display: formatPrice(amountPaise, currency),
          currency,
          billing_cycle: plan.billing_cycle || "monthly",
          features: asStringArray(plan.features_json),
          limits: asRecord(plan.limits_json),
        };
      }),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
