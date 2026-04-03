/**
 * Redirect Middleware Tests - Production Grade
 * =============================================
 * 
 * Tests idempotent redirect logic that prevents infinite loops.
 * Covers:
 * - One-hop redirects (http → https://www)
 * - Non-www → www redirects
 * - Subdomain protection
 * - Feature flag rollback
 * - Matcher config
 */

import { proxy, config } from "@/proxy";
import { NextRequest } from "next/server";

const CANONICAL = "https://www.flowauxi.com";

function createMockRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    headers: new Headers(headers),
  });
}

describe("Redirect Middleware - Production Grade", () => {
  describe("Already Canonical", () => {
    it("returns 200 for https://www.flowauxi.com", async () => {
      const req = createMockRequest(CANONICAL);
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("returns 200 or 307 for https://www.flowauxi.com/dashboard (auth redirect is OK)", async () => {
      const req = createMockRequest(`${CANONICAL}/dashboard`);
      const response = await proxy(req);
      // 200 if no auth needed, 307 if redirected to login
      expect([200, 307]).toContain(response.status);
    });

    it("returns 200 for https://www.flowauxi.com/pricing?ref=test", async () => {
      const req = createMockRequest(`${CANONICAL}/pricing?ref=test`);
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });
  });

  describe("One-Hop Redirect (HTTP → Canonical)", () => {
    it("redirects http://flowauxi.com to canonical in ONE hop", async () => {
      const req = createMockRequest("http://flowauxi.com");
      const response = await proxy(req);
      
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(CANONICAL + "/");
    });

    it("preserves path on HTTP redirect", async () => {
      const req = createMockRequest("http://flowauxi.com/pricing");
      const response = await proxy(req);
      
      expect(response.headers.get("location")).toBe(`${CANONICAL}/pricing`);
    });

    it("preserves query string on HTTP redirect", async () => {
      const req = createMockRequest("http://flowauxi.com/?ref=twitter");
      const response = await proxy(req);
      
      expect(response.headers.get("location")).toContain("ref=twitter");
    });
  });

  describe("Non-www → www", () => {
    it("redirects https://flowauxi.com to canonical", async () => {
      const req = createMockRequest("https://flowauxi.com");
      const response = await proxy(req);
      
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toMatch(/^https:\/\/www\.flowauxi\.com\/?$/);
    });

    it("preserves path on non-www redirect", async () => {
      const req = createMockRequest("https://flowauxi.com/dashboard");
      const response = await proxy(req);
      
      expect(response.headers.get("location")).toBe(`${CANONICAL}/dashboard`);
    });

    it("preserves query string on non-www redirect", async () => {
      const req = createMockRequest("https://flowauxi.com/pricing?plan=pro");
      const response = await proxy(req);
      
      expect(response.headers.get("location")).toContain("plan=pro");
    });
  });

  describe("Subdomains (No Redirect)", () => {
    it("does NOT redirect https://shop.flowauxi.com", async () => {
      const req = createMockRequest("https://shop.flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect http://shop.flowauxi.com (CRITICAL TEST)", async () => {
      const req = createMockRequest("http://shop.flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect http://api.flowauxi.com", async () => {
      const req = createMockRequest("http://api.flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect https://marketing.flowauxi.com", async () => {
      const req = createMockRequest("https://marketing.flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect https://booking.flowauxi.com", async () => {
      const req = createMockRequest("https://booking.flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect https://pages.flowauxi.com", async () => {
      const req = createMockRequest("https://pages.flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Preview Deployments (No Redirect)", () => {
    it("does NOT redirect vercel.app previews", async () => {
      const req = createMockRequest("https://flowauxi-git-feature-abc.vercel.app");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect vercel.sh previews", async () => {
      const req = createMockRequest("https://flowauxi-git-feature-abc.vercel.sh");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Localhost (No Redirect)", () => {
    it("does NOT redirect localhost", async () => {
      const req = createMockRequest("http://localhost:3000");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("does NOT redirect 127.0.0.1", async () => {
      const req = createMockRequest("http://127.0.0.1:3000");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Feature Flag (Rollback)", () => {
    const originalEnv = process.env.ENABLE_WWW_REDIRECT;

    afterEach(() => {
      process.env.ENABLE_WWW_REDIRECT = originalEnv;
    });

    it("skips redirect when flag is false", async () => {
      process.env.ENABLE_WWW_REDIRECT = "false";
      
      const req = createMockRequest("https://flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(200);
    });

    it("redirects when flag is true", async () => {
      process.env.ENABLE_WWW_REDIRECT = "true";
      
      const req = createMockRequest("https://flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(301);
    });

    it("redirects when flag is undefined (default ON)", async () => {
      delete process.env.ENABLE_WWW_REDIRECT;
      
      const req = createMockRequest("https://flowauxi.com");
      const response = await proxy(req);
      expect(response.status).toBe(301);
    });
  });

  describe("Matcher Config", () => {
    it("excludes _next/static from middleware", () => {
      expect(config.matcher[0]).toMatch(/_next\/static/);
    });

    it("excludes _next/image from middleware", () => {
      expect(config.matcher[0]).toMatch(/_next\/image/);
    });

    it("excludes favicon.ico", () => {
      expect(config.matcher[0]).toMatch(/favicon\.ico/);
    });

    it("excludes common static file extensions", () => {
      expect(config.matcher[0]).toMatch(/\.(?:jpg|jpeg|gif|png|svg|ico|css|js|webp|woff|woff2)/);
    });
  });

  describe("Redirect Headers", () => {
    it("sets x-redirect-reason header on redirect", async () => {
      const req = createMockRequest("https://flowauxi.com");
      const response = await proxy(req);
      
      expect(response.headers.get("x-redirect-reason")).toBe("to-canonical");
    });

    it("does not set redirect header on non-redirect", async () => {
      const req = createMockRequest(CANONICAL);
      const response = await proxy(req);
      
      expect(response.headers.get("x-redirect-reason")).toBeNull();
    });
  });
});
