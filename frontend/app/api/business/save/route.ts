import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { createSupabaseServiceClientOrThrow } from "@/lib/supabase/service-client";
import { cookies } from "next/headers";
import {
  UI_STATE_COOKIE,
  serializeUiState,
  getUiStateCookieOptions,
} from "@/lib/auth/ui-state";
import { trace as otelTrace, context, propagation } from "@opentelemetry/api";
import {
  attachSavePerfHeaders,
  createSaveCorrelationId,
  logSettingsSaveTiming,
  SETTINGS_SAVE_CORRELATION_HEADER,
  SettingsSaveServerTimer,
} from "@/lib/perf/settings-save";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:5000";
const PROXY_TIMEOUT_MS = Number(process.env.BUSINESS_SAVE_PROXY_TIMEOUT_MS || "15000");

export async function POST(request: NextRequest) {
  const timer = new SettingsSaveServerTimer(
    createSaveCorrelationId(request.headers.get(SETTINGS_SAVE_CORRELATION_HEADER)),
  );
  const tracer = otelTrace.getTracer("flowauxi.business.save", "1.0.0");

  return tracer.startActiveSpan("next.api.business.save", async (span) => {
    span.setAttribute("correlation_id", timer.correlationId);

    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get("session")?.value;

      if (!sessionCookie) {
        span.setStatus({ code: 2, message: "not_authenticated" });
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      const authStarted = Date.now();
      const result = await verifySessionCookieSafe(sessionCookie, false);
      timer.record("auth", authStarted);

      if (!result.success) {
        span.setStatus({ code: 2, message: "invalid_session" });
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
      const userId = result.data!.uid;
      span.setAttribute("user_id_suffix", userId.slice(-8));

      const parseStarted = Date.now();
      const businessData = await request.json();
      timer.record("parse_body", parseStarted);
      delete businessData.allow_slug_update;

      span.setAttribute("payload_field_count", Object.keys(businessData).length);

      const cookieHeader = request.headers.get("cookie") || "";
      const proxyHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "X-User-ID": userId,
        Cookie: cookieHeader,
        [SETTINGS_SAVE_CORRELATION_HEADER]: timer.correlationId,
      };

      propagation.inject(context.active(), proxyHeaders);

      const proxyStarted = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${BACKEND_URL}/api/shop/business/update`, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify(businessData),
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      timer.record("proxy_fetch", proxyStarted);

      const upstreamTiming = response.headers.get("Server-Timing");
      span.setAttribute("upstream_server_timing", upstreamTiming || "none");
      span.setAttribute("upstream_status", response.status);

      const parseResponseStarted = Date.now();
      const data = await response.json();
      timer.record("parse_response", parseResponseStarted);

      let storeSlug: string | undefined;

      if (response.ok) {
        const cacheStarted = Date.now();

        // ─── RESOLVE SLUG: Flask → DB fallback → plan-aware fallback ──
        // 1. Flask now returns url_slug in its response (set by plan-based
        //    enforcement in shop_business.py). Read it directly — zero DB ops.
        // 2. If absent (defensive — older Flask version), query businesses table.
        // 3. If STILL absent, fall back to uid[:8] (matches Starter plan behavior).
        storeSlug = data.url_slug || undefined;

        if (!storeSlug) {
          try {
            const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });
            const { data: bizData } = await supabase
              .from("businesses")
              .select("url_slug")
              .eq("user_id", userId)
              .maybeSingle();
            storeSlug = bizData?.url_slug || undefined;
          } catch {
            // Non-critical — fall through to plan-aware fallback
          }
        }

        // Plan-aware fallback: Starter plan uses uid[:8], Business/Pro
        // use business_name slug. If we can't determine the plan, use uid[:8]
        // which is the most restrictive (Starter default).
        if (!storeSlug) {
          storeSlug = userId.slice(0, 8).toLowerCase();
        }

        // ─── CACHE INVALIDATION ──────────────────────────────────────────
        try {
          const { invalidateByUserId } = await import("@/lib/cache/store-cache");
          const { revalidatePath } = await import("next/cache");

          invalidateByUserId(userId);
          revalidatePath(`/store/${storeSlug}`, "layout");
        } catch (err) {
          console.error("[Business Save Proxy] Cache invalidation failed:", err);
        }

        // ─── PERSIST ON USERS TABLE (for zero-join auth sync) ──────────
        try {
          const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });
          await supabase
            .from("users")
            .update({
              ai_settings_configured: true,
              store_slug: storeSlug,
            })
            .eq("firebase_uid", userId);
        } catch (err) {
          console.error(
            "[Business Save Proxy] Failed to update ai_settings_configured:",
            err,
          );
        }

        timer.record("cache_invalidate", cacheStarted);

        // Include flags in response so client updates auth context instantly
        data.aiSettingsConfigured = true;
        data.storeSlug = storeSlug;
      }

      logSettingsSaveTiming(timer, {
        user_id_suffix: userId.slice(-8),
        upstream_status: response.status,
        payload_field_count: Object.keys(businessData).length,
      });

      const jsonResponse = NextResponse.json(data, { status: response.status });
      attachSavePerfHeaders(jsonResponse, timer, upstreamTiming);

      // ─── FAANG-GRADE: Set ui_state cookie for O(1) SSR hydration ─────
      if (response.ok) {
        jsonResponse.cookies.set(
          UI_STATE_COOKIE,
          serializeUiState({
            ai_settings_configured: true,
            store_slug: storeSlug || null,
          }),
          getUiStateCookieOptions(),
        );
      }

      span.setAttribute("total_ms", timer.totalMs());
      return jsonResponse;
    } catch (error: unknown) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: 2, message: "proxy_error" });
      console.error("[Business Save Proxy] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Proxy error";
      const jsonResponse = NextResponse.json(
        {
          error: "PROXY_ERROR",
          message: errorMessage,
          correlation_id: timer.correlationId,
        },
        { status: 500 },
      );
      attachSavePerfHeaders(jsonResponse, timer);
      logSettingsSaveTiming(timer, { error: errorMessage });
      return jsonResponse;
    } finally {
      span.end();
    }
  });
}
