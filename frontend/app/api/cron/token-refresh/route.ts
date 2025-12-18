/**
 * Token Refresh Cron Job
 * Automatically refreshes WhatsApp access tokens that are expiring soon
 *
 * Run daily via Vercel Cron or external scheduler
 * Schedule: 0 2 * * * (2 AM daily)
 */

import { NextRequest, NextResponse } from "next/server";
import { encryptToken, decryptToken } from "@/lib/encryption/crypto";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { supabaseAdmin: supabase } = await import("@/lib/supabase/server");

    // Find tokens expiring in next 7 days
    const expirationThreshold = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: expiringTokens, error } = await supabase
      .from("connected_facebook_accounts")
      .select("*")
      .lt("expires_at", expirationThreshold)
      .eq("status", "active");

    if (error) {
      console.error(
        "❌ [Token Refresh] Error fetching expiring tokens:",
        error
      );
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!expiringTokens?.length) {
      console.log("✅ [Token Refresh] No tokens need refreshing");
      return NextResponse.json({
        refreshed: 0,
        message: "No tokens expiring soon",
      });
    }

    console.log(
      `🔄 [Token Refresh] Found ${expiringTokens.length} tokens to refresh`
    );

    let refreshedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const account of expiringTokens) {
      try {
        const currentToken = decryptToken(account.access_token);

        // Exchange for new long-lived token
        const response = await fetch(
          `https://graph.facebook.com/v24.0/oauth/access_token?` +
            `grant_type=fb_exchange_token&` +
            `client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}&` +
            `client_secret=${process.env.FACEBOOK_APP_SECRET}&` +
            `fb_exchange_token=${currentToken}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error(
            `❌ [Token Refresh] Failed for account ${account.id}:`,
            errorData
          );
          failedCount++;
          errors.push(
            `Account ${account.id}: ${
              errorData?.error?.message || "Unknown error"
            }`
          );
          continue;
        }

        const { access_token: newToken, expires_in } = await response.json();

        if (newToken) {
          const newExpiresAt = new Date(
            Date.now() + expires_in * 1000
          ).toISOString();

          const { error: updateError } = await supabase
            .from("connected_facebook_accounts")
            .update({
              access_token: encryptToken(newToken),
              expires_at: newExpiresAt,
            })
            .eq("id", account.id);

          if (updateError) {
            console.error(
              `❌ [Token Refresh] Failed to update account ${account.id}:`,
              updateError
            );
            failedCount++;
            errors.push(`Account ${account.id}: DB update failed`);
          } else {
            console.log(
              `✅ [Token Refresh] Refreshed token for account ${account.id}, expires: ${newExpiresAt}`
            );
            refreshedCount++;
          }
        }
      } catch (err: any) {
        console.error(
          `❌ [Token Refresh] Error refreshing token for account ${account.id}:`,
          err
        );
        failedCount++;
        errors.push(`Account ${account.id}: ${err.message}`);
      }
    }

    console.log(
      `✅ [Token Refresh] Complete: ${refreshedCount} refreshed, ${failedCount} failed`
    );

    return NextResponse.json({
      refreshed: refreshedCount,
      failed: failedCount,
      total: expiringTokens.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("❌ [Token Refresh] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Token refresh failed" },
      { status: 500 }
    );
  }
}
