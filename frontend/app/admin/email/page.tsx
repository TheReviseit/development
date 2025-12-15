import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import EmailManagementClient from "./EmailManagementClient";

/**
 * Admin Email Management Page
 * Server Component with server-side authentication and authorization
 */
export default async function AdminEmailPage() {
  // Server-side authentication check
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  try {
    // Verify session cookie
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );

    // Get user and check admin role
    const user = await getUserByFirebaseUID(decodedClaims.uid);

    if (!user || user.role !== "admin") {
      // Not an admin - redirect to dashboard
      redirect("/dashboard");
    }

    // User is authenticated and is an admin - render client component
    return <EmailManagementClient adminName={user.full_name || user.email} />;
  } catch (error) {
    // Invalid session - redirect to login
    redirect("/login");
  }
}
