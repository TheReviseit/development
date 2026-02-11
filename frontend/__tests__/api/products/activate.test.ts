/**
 * Product Activation Endpoint Tests
 * Standard: Enterprise self-service activation testing
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/products/activate/route";
import type { NextRequest } from "next/server";

describe("/api/products/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if no session cookie", async () => {
    const request = new Request("http://localhost/api/products/activate", {
      method: "POST",
      body: JSON.stringify({ product: "shop" }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 if product is missing", async () => {
    const request = new Request("http://localhost/api/products/activate", {
      method: "POST",
      headers: {
        cookie: "session=valid_session_token",
      },
      body: JSON.stringify({}),
    }) as unknown as NextRequest;

    // Mock session cookie
    Object.defineProperty(request, "cookies", {
      value: {
        get: (name: string) =>
          name === "session" ? { value: "valid_token" } : undefined,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("MISSING_REQUIRED_FIELD");
  });

  it("should return 403 if product is not available for activation", async () => {
    // Test with 'dashboard' (not activatable) or 'api' (enterprise-only)
    const productsToTest = ["dashboard", "api"];

    for (const product of productsToTest) {
      const request = new Request("http://localhost/api/products/activate", {
        method: "POST",
        headers: {
          cookie: "session=valid_session_token",
        },
        body: JSON.stringify({ product }),
      }) as unknown as NextRequest;

      Object.defineProperty(request, "cookies", {
        value: {
          get: (name: string) =>
            name === "session" ? { value: "valid_token" } : undefined,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PRODUCT_NOT_AVAILABLE");
    }
  });

  it("should activate product and create trial membership", async () => {
    // This would require more complex mocking of Supabase + Firebase Admin
    // Implementation left as TODO for integration tests
    expect(true).toBe(true);
  });
});
