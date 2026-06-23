import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function keepWarm(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = {};
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  await Promise.all([
    fetch(`${BACKEND_URL}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined),
    fetch(`${BACKEND_URL}/internal/checkout/warm`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined),
    fetch(`${BACKEND_URL}/internal/checkout/process`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined),
  ]);
}

async function refreshTokens(): Promise<void> {
  try {
    const { supabaseAdmin: supabase } = await import("@/lib/supabase/server");
    const { encryptToken, decryptToken } = await import("@/lib/encryption/crypto");

    const expirationThreshold = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: expiringTokens } = await supabase
      .from("connected_facebook_accounts")
      .select("*")
      .lt("expires_at", expirationThreshold)
      .eq("status", "active");

    if (!expiringTokens?.length) return;

    for (const account of expiringTokens) {
      try {
        const currentToken = decryptToken(account.access_token);
        const response = await fetch(
          `https://graph.facebook.com/v24.0/oauth/access_token?` +
            `grant_type=fb_exchange_token&` +
            `client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}&` +
            `client_secret=${process.env.FACEBOOK_APP_SECRET}&` +
            `fb_exchange_token=${currentToken}`
        );

        if (!response.ok) continue;

        const { access_token: newToken, expires_in } = await response.json();
        if (newToken) {
          const newExpiresAt = new Date(
            Date.now() + expires_in * 1000
          ).toISOString();
          await supabase
            .from("connected_facebook_accounts")
            .update({
              access_token: encryptToken(newToken),
              expires_at: newExpiresAt,
            })
            .eq("id", account.id);
        }
      } catch {
        // Individual token refresh failure is non-fatal
      }
    }
  } catch {
    // Token refresh failure is non-fatal
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await keepWarm();

  const hour = new Date().getUTCHours();
  if (hour === 2) {
    await refreshTokens();
  }

  return NextResponse.json({ ok: true });
}
