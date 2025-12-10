import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import type { User } from "@/lib/supabase/queries";

/**
 * Verify that the request has a valid authenticated session
 * @returns User object and decoded claims
 * @throws Error if unauthorized
 */
export async function verifyAuthenticatedRequest(
  request: NextRequest
): Promise<{ user: User; claims: any }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    throw new Error("Unauthorized: No session cookie");
  }

  try {
    // Verify session cookie with Firebase Admin
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true // Check if revoked
    );

    // Get user from database
    const user = await getUserByFirebaseUID(decodedClaims.uid);

    if (!user) {
      throw new Error("Unauthorized: User not found");
    }

    return { user, claims: decodedClaims };
  } catch (error: any) {
    throw new Error(`Unauthorized: ${error.message}`);
  }
}

/**
 * Verify that the request is from an admin user
 * @returns Admin user object
 * @throws Error if unauthorized or not admin
 */
export async function verifyAdminRequest(request: NextRequest): Promise<User> {
  const { user } = await verifyAuthenticatedRequest(request);

  if (user.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }

  return user;
}

/**
 * Get authenticated user from request (doesn't throw, returns null if not authenticated)
 * @returns User object or null
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<User | null> {
  try {
    const { user } = await verifyAuthenticatedRequest(request);
    return user;
  } catch {
    return null;
  }
}
