import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

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
