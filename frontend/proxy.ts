import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy for Next.js Edge Runtime
 *
 * NOTE: This runs in Edge Runtime and cannot use Node.js APIs
 * - No Firebase Admin SDK
 * - No Supabase server client
 * - Session validation must happen in API routes
 */
export async function proxy(request: NextRequest) {
  const session = request.cookies.get("session");

  // Public paths that don't require auth
  const publicPaths = [
    "/login",
    "/signup",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/create-user",
    "/api/auth/check-user-exists",
    "/privacy",
    "/terms",
    "/data-deletion",
    "/onboarding-embedded",
    "/api/webhooks",
    "/api/facebook/deauthorize",
    "/api/facebook/data-deletion",
    "/data-handling-policy",
  ];

  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");
  const isApiPath = request.nextUrl.pathname.startsWith("/api");

  // If trying to access protected route without session cookie
  if (!session && !isPublicPath) {
    if (isApiPath) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // For admin paths, add a header that routes can check
  // Actual validation happens in the route handlers
  if (isAdminPath && session) {
    const response = NextResponse.next();
    response.headers.set("x-requires-admin", "true");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|gif|png|svg|ico|css|js)).*)",
  ],
};
