import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { invalidateAllSessionVerifyCache, invalidateSessionVerifyCache } from "@/lib/auth/session-verify-cache";

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");

  if (session?.value) {
    invalidateSessionVerifyCache(session.value);
  } else {
    invalidateAllSessionVerifyCache();
  }

  // Clear all known auth cookies for the dashboard product.
  // - `session`: Firebase Admin session cookie (canonical)
  // - `flowauxi_session`: legacy cookie name used by older code paths
  for (const name of ["session", "flowauxi_session"]) {
    cookieStore.delete(name);
  }

  const response = NextResponse.json({ success: true });
  // Defensive: also delete on the response object (some runtimes rely on this)
  response.cookies.delete("session");
  response.cookies.delete("flowauxi_session");
  return response;
}
