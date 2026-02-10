/**
 * Slug Availability Check API
 *
 * Purpose: Real-time check if a URL slug is available
 * Used by Profile page to show live feedback as user types business name
 *
 * UX: Shows "✅ URL available" or "⚠️ This URL is taken, we'll use raja-2"
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Generate URL-safe slug from business name
 * Must match backend generate_url_slug() logic
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/**
 * GET /api/business/check-slug?slug=raja
 *
 * Response:
 * {
 *   "available": false,
 *   "suggested": "raja-2",
 *   "checked": "raja"
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json({ error: "Slug required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const normalized = slug.toLowerCase();

    // Check if slug exists in businesses table
    const { data, error } = await supabase
      .from("businesses")
      .select("url_slug")
      .eq("url_slug_lower", normalized)
      .maybeSingle();

    if (error) {
      console.error("Error checking slug:", error);
      return NextResponse.json({ error: "Check failed" }, { status: 500 });
    }

    const available = !data;

    // If taken, suggest alternative with counter
    let suggested = slug;
    if (!available) {
      // Simple collision resolution: append -2, -3, etc.
      let counter = 2;
      let foundAvailable = false;

      while (!foundAvailable && counter < 100) {
        const testSlug = `${slug}-${counter}`;
        const { data: testData } = await supabase
          .from("businesses")
          .select("url_slug")
          .eq("url_slug_lower", testSlug.toLowerCase())
          .maybeSingle();

        if (!testData) {
          suggested = testSlug;
          foundAvailable = true;
        }
        counter++;
      }

      // If we exhausted counter, use timestamp
      if (!foundAvailable) {
        suggested = `${slug}-${Date.now().toString(36)}`;
      }
    }

    return NextResponse.json({
      available,
      suggested: available ? slug : suggested,
      checked: slug,
    });
  } catch (error) {
    console.error("Slug check error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
