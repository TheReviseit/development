import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Vercel Hobby: cron may run at most once per day.
 * Frequent billing/booking work runs on Render Celery beat instead.
 * This route is a daily safety net (backend warm + orphan sweep + booking expiry).
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function runDailyMaintenance(): Promise<Record<string, unknown>> {
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = {};
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const results: Record<string, unknown> = {};

  await Promise.all([
    fetch(`${BACKEND_URL}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => {
        results.health = r.ok;
      })
      .catch(() => {
        results.health = false;
      }),
    fetch(`${BACKEND_URL}/internal/checkout/warm`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => {
        results.warm = r.ok;
      })
      .catch(() => {
        results.warm = false;
      }),
    fetch(`${BACKEND_URL}/internal/checkout/reconcile-orphans`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30000),
    })
      .then(async (r) => {
        results.reconcile = await r.json().catch(() => ({ ok: r.ok }));
      })
      .catch((e) => {
        results.reconcile = {
          ok: false,
          error: e instanceof Error ? e.message : "reconcile failed",
        };
      }),
  ]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .update({
        booking_status: "expired",
        status: "cancelled",
        expired_at: now,
      })
      .in("booking_status", ["draft", "payment_pending"])
      .neq("payment_status", "paid")
      .lt("reserved_until", now)
      .select("id");
    results.booking_expiry = {
      ok: !error,
      expired_count: data?.length ?? 0,
      error: error?.message,
    };
  }

  return results;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDailyMaintenance();
  return NextResponse.json({ ok: true, ...results });
}
