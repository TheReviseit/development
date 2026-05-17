import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FEATURE_KEY_PATTERN = /^[a-z0-9_:-]{3,100}$/;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase service credentials are not configured.");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const featureKey = searchParams.get("feature")?.trim();

  if (!featureKey || !FEATURE_KEY_PATTERN.test(featureKey)) {
    return NextResponse.json(
      {
        enabled: false,
        error: "INVALID_FEATURE_KEY",
      },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await getSupabase()
      .from("feature_flags")
      .select("feature_key, is_enabled_globally, updated_at")
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (error) {
      console.warn("[feature-flag] lookup_failed", {
        featureKey,
        message: error.message,
      });

      return NextResponse.json(
        {
          enabled: false,
          featureKey,
          error: "LOOKUP_FAILED",
        },
        { status: 503 },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          enabled: false,
          featureKey,
          error: "FLAG_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      enabled: data.is_enabled_globally === true,
      featureKey: data.feature_key,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.warn("[feature-flag] unexpected_error", {
      featureKey,
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        enabled: false,
        featureKey,
        error: "FLAG_SERVICE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
