import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";

/**
 * Admin Dashboard Page
 * Server Component with server-side authentication and authorization
 */
export default async function AdminPage() {
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

    // User is authenticated and is an admin
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">
              Welcome, {user.full_name || user.email}
            </h2>
            <p className="text-gray-600">
              You have admin access to this application.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">User Management</h3>
              <p className="text-gray-600 text-sm mb-4">
                Manage users and permissions
              </p>
              <a
                href="/admin/users"
                className="text-blue-600 hover:text-blue-800"
              >
                View Users →
              </a>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">Email Management</h3>
              <p className="text-gray-600 text-sm mb-4">
                Send and manage email campaigns
              </p>
              <a
                href="/admin/email"
                className="text-blue-600 hover:text-blue-800"
              >
                Manage Emails →
              </a>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">System Settings</h3>
              <p className="text-gray-600 text-sm mb-4">
                Configure application settings
              </p>
              <a
                href="/admin/settings"
                className="text-blue-600 hover:text-blue-800"
              >
                Settings →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Invalid session - redirect to login
    redirect("/login");
  }
}
