import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    firebase: {
      apiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    supabase: {
      url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  };

  const allGood =
    checks.firebase.apiKey &&
    checks.firebase.authDomain &&
    checks.firebase.projectId &&
    checks.supabase.url &&
    checks.supabase.anonKey &&
    checks.supabase.serviceRoleKey;

  return NextResponse.json({
    status: allGood ? "✅ All environment variables are set" : "❌ Missing environment variables",
    checks,
    message: allGood
      ? "Your environment is configured correctly!"
      : "Please check your .env.local file and ensure all required variables are set.",
  });
}

