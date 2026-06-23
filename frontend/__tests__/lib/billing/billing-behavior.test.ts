import {
  resolveBillingBehavior,
  type BillingBehaviorCohort,
} from "@/lib/billing/billing-behavior";
import type { NextRequest } from "next/server";

function mockRequest(cookies: Record<string, string> = {}): NextRequest {
  return {
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { value } : undefined;
      },
    },
  } as unknown as NextRequest;
}

describe("billing behavior pinning", () => {
  const flags = {
    fix_domain_context: true,
    billing_behavior_pinning: true,
    canary_percent: 50,
  };

  it("pins canary and domainFix independently on first request", () => {
    const cohort = resolveBillingBehavior(mockRequest(), flags, "user-123");
    expect(typeof cohort.canary).toBe("boolean");
    expect(cohort.domainFix).toBe(true);
    expect(cohort.pinnedAt).toBeGreaterThan(0);
  });

  it("returns existing cookie when pinning enabled", () => {
    const pinned: BillingBehaviorCohort = {
      canary: false,
      domainFix: false,
      pinnedAt: 1,
    };
    const req = mockRequest({
      billing_behavior: encodeURIComponent(JSON.stringify(pinned)),
    });
    const cohort = resolveBillingBehavior(req, flags, "user-123");
    expect(cohort).toEqual(pinned);
  });

  it("reads live flags when pinning disabled", () => {
    const pinned: BillingBehaviorCohort = {
      canary: false,
      domainFix: false,
      pinnedAt: 1,
    };
    const req = mockRequest({
      billing_behavior: encodeURIComponent(JSON.stringify(pinned)),
    });
    const cohort = resolveBillingBehavior(
      req,
      { ...flags, billing_behavior_pinning: false, fix_domain_context: true, canary_percent: 100 },
      "user-123",
    );
    expect(cohort.domainFix).toBe(true);
    expect(cohort.canary).toBe(true);
  });
});
