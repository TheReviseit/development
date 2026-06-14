/**
 * API Route: GET /api/user/username
 * Get the current user's username from their profile
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user ID from session
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return null;

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success || !result.data) return null;
    return result.data.uid;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get user ID from Firebase session cookies
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = getSupabase();

    // 1. Try to get the business url_slug (Primary canonical slug)
    const { data: bizData } = await supabase
      .from("businesses")
      .select("url_slug")
      .eq("user_id", userId)
      .maybeSingle();

    if (bizData?.url_slug) {
      return NextResponse.json({
        success: true,
        username: bizData.url_slug,
        hasCustomUsername: true,
      });
    }

    // 2. Get username from Supabase users table (Legacy fallback)
    const { data, error } = await supabase
      .from("users")
      .select("username")
      .eq("firebase_uid", userId)
      .single();

    if (error || !data?.username) {
      // 3. Fallback: If no username, return the first 8 chars of UID (shop visibility logic)
      return NextResponse.json({
        success: true,
        username: userId.substring(0, 8),
        hasCustomUsername: false,
      });
    }

    return NextResponse.json({
      success: true,
      username: data.username,
      hasCustomUsername: true,
    });
  } catch (error) {
    console.error("[API /user/username] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
