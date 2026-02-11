/**
 * Enterprise Auth Sync Endpoint Tests
 * Standard: Google Workspace / Zoho One Testing Level
 *
 * Test Coverage:
 * - Token verification
 * - Product membership validation
 * - User creation
 * - Error handling
 * - Audit logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "@/app/api/auth/sync/route";
import type { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: vi.fn(),
  adminAuth: {
    createSessionCookie: vi.fn(),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

describe("/api/auth/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Token Verification", () => {
    it("should return 400 if idToken is missing", async () => {
      const request = new Request("http://localhost/api/auth/sync", {
        method: "POST",
        body: JSON.stringify({}),
      }) as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("MISSING_REQUIRED_FIELD");
    });

    it("should return 401 if token verification fails", async () => {
      const { verifyIdToken } = await import("@/lib/firebase-admin");
      vi.mocked(verifyIdToken).mockResolvedValue({
        success: false,
        data: null,
      });

      const request = new Request("http://localhost/api/auth/sync", {
        method: "POST",
        body: JSON.stringify({ idToken: "invalid_token" }),
      }) as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe("INVALID_TOKEN");
    });
  });

  describe("Product Membership Validation (Option B)", () => {
    it("should return 200 AUTHENTICATED for dashboard (always accessible)", async () => {
      const { verifyIdToken } = await import("@/lib/firebase-admin");
      const { createClient } = await import("@supabase/supabase-js");

      vi.mocked(verifyIdToken).mockResolvedValue({
        success: true,
        data: {
          uid: "test-firebase-uid",
          email: "test@example.com",
        },
      });

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "test-user-id",
            firebase_uid: "test-firebase-uid",
            email: "test@example.com",
            full_name: "Test User",
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
      };

      vi.mocked(createClient).mockReturnValue(mockSupabase as any);

      const request = new Request("http://localhost/api/auth/sync", {
        method: "POST",
        headers: {
          host: "localhost:3000",
        },
        body: JSON.stringify({ idToken: "valid_token" }),
      }) as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
    });

    it("should return 403 PRODUCT_NOT_ENABLED if user lacks shop membership", async () => {
      const { verifyIdToken } = await import("@/lib/firebase-admin");
      const { createClient } = await import("@supabase/supabase-js");

      vi.mocked(verifyIdToken).mockResolvedValue({
        success: true,
        data: {
          uid: "test-firebase-uid",
          email: "test@example.com",
        },
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "test-user-id",
                  firebase_uid: "test-firebase-uid",
                },
                error: null,
              }),
            };
          }
          if (table === "user_products") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null, // NO membership
                error: null,
              }),
            };
          }
          return mockSupabase;
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockSupabase as any);

      const request = new Request("http://shop.flowauxi.com/api/auth/sync", {
        method: "POST",
        headers: {
          host: "shop.flowauxi.com",
        },
        body: JSON.stringify({ idToken: "valid_token" }),
      }) as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PRODUCT_NOT_ENABLED");
      expect(data.currentProduct).toBe("shop");
      expect(data.availableProducts).toBeDefined();
    });
  });

  describe("User Creation (Signup Flow)", () => {
    it("should create user + product membership on signup", async () => {
      const { verifyIdToken, adminAuth } = await import("@/lib/firebase-admin");
      const { createClient } = await import("@supabase/supabase-js");
      const { cookies } = await import("next/headers");

      vi.mocked(verifyIdToken).mockResolvedValue({
        success: true,
        data: {
          uid: "new-firebase-uid",
          email: "new@example.com",
          name: "New User",
        },
      });

      vi.mocked(adminAuth.createSessionCookie).mockResolvedValue(
        "session_cookie_value",
      );

      const mockCookieStore = {
        set: vi.fn(),
        delete: vi.fn(),
      };
      vi.mocked(cookies).mockResolvedValue(mockCookieStore as any);

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "users") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null, // User doesn't exist
                error: { code: "PGRST116" },
              }),
              insert: vi.fn().mockReturnThis(),
            };
          }
          if (table === "user_products") {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === "product_activation_logs") {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return mockSupabase;
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockSupabase as any);

      const request = new Request("http://shop.flowauxi.com/api/auth/sync", {
        method: "POST",
        headers: {
          host: "shop.flowauxi.com",
        },
        body: JSON.stringify({
          idToken: "valid_token",
          allowCreate: true, // Signup flag
        }),
      }) as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith("user_products");
      expect(mockSupabase.from).toHaveBeenCalledWith("product_activation_logs");
    });
  });

  describe("Error Handling", () => {
    it("should return 404 USER_NOT_FOUND for orphaned Firebase accounts", async () => {
      const { verifyIdToken } = await import("@/lib/firebase-admin");
      const { createClient } = await import("@supabase/supabase-js");

      vi.mocked(verifyIdToken).mockResolvedValue({
        success: true,
        data: {
          uid: "orphaned-firebase-uid",
          email: "orphaned@example.com",
        },
      });

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null, // User not in DB
            error: { code: "PGRST116" },
          }),
        })),
      };

      vi.mocked(createClient).mockReturnValue(mockSupabase as any);

      const request = new Request("http://localhost/api/auth/sync", {
        method: "POST",
        body: JSON.stringify({
          idToken: "valid_token",
          allowCreate: false, // No creation allowed
        }),
      }) as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe("USER_NOT_FOUND");
    });
  });
});
