/**
 * Route Policy Configuration
 * Declarative mapping of routes to required user types
 *
 * This is the SINGLE SOURCE OF TRUTH for route access control
 */

export type UserType = "normal" | "console";

/**
 * Route policy map
 * Key: route prefix
 * Value: required user type
 */
export const ROUTE_POLICY: Record<string, UserType> = {
  "/dashboard": "normal",
  "/console": "console",
  "/settings": "normal",
  "/onboarding": "normal",
} as const;

/**
 * Public routes that don't require authentication
 */
export const PUBLIC_ROUTES: string[] = [
  "/",
  "/login",
  "/signup",
  "/console/login",
  "/console/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/data-handling-policy",
  "/apis",
  "/store",
  "/payment-success",
  "/error",
  "/offline",
];

/**
 * Routes that should skip middleware entirely (static, API, etc.)
 */
export const MIDDLEWARE_SKIP_PATTERNS: RegExp[] = [
  /^\/_next\//,
  /^\/api\//,
  /^\/favicon\.ico$/,
  /\.(jpg|jpeg|gif|png|svg|ico|css|js|webp|woff|woff2)$/,
];

/**
 * Get required user type for a given pathname
 */
export function getRequiredUserType(pathname: string): UserType | null {
  for (const [routePrefix, userType] of Object.entries(ROUTE_POLICY)) {
    if (pathname.startsWith(routePrefix)) {
      return userType;
    }
  }
  return null;
}

/**
 * Check if route is public (no auth required)
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Check if middleware should skip this request
 */
export function shouldSkipMiddleware(pathname: string): boolean {
  return MIDDLEWARE_SKIP_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Get redirect URL for wrong portal access
 */
export function getWrongPortalRedirect(
  userType: UserType | null,
  expectedType: UserType,
): string {
  return `/error?code=WRONG_PORTAL&expected=${expectedType}&current=${userType || "none"}`;
}

/**
 * Get login URL for a user type
 */
export function getLoginUrl(userType: UserType): string {
  return userType === "console" ? "/console/login" : "/login";
}

/**
 * Get dashboard URL for a user type
 */
export function getDashboardUrl(userType: UserType): string {
  return userType === "console" ? "/console" : "/dashboard";
}
