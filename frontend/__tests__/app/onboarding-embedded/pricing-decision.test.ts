import {
  resolvePricingAction,
  resolvePricingModeFromFlag,
} from "@/app/onboarding-embedded/pricing-decision";

describe("onboarding pricing decision", () => {
  it("routes paid Starter to paid checkout", () => {
    expect(resolvePricingAction("paid", "starter")).toBe("paid_checkout");
  });

  it("routes paid Business and Pro to paid checkout", () => {
    expect(resolvePricingAction("paid", "business")).toBe("paid_checkout");
    expect(resolvePricingAction("paid", "pro")).toBe("paid_checkout");
  });

  it("routes trial Starter to trial start", () => {
    expect(resolvePricingAction("trial", "starter")).toBe("start_trial");
  });

  it("does not route non-Starter plans to trial start", () => {
    expect(resolvePricingAction("trial", "business")).toBe("paid_checkout");
    expect(resolvePricingAction("trial", "pro")).toBe("paid_checkout");
  });

  it("forces paid mode when the runtime flag is disabled", () => {
    expect(
      resolvePricingModeFromFlag({
        requestedMode: "trial",
        flagEnabled: false,
      }),
    ).toBe("paid");
  });

  it("honors requested mode when the runtime flag is enabled", () => {
    expect(
      resolvePricingModeFromFlag({
        requestedMode: "trial",
        flagEnabled: true,
      }),
    ).toBe("trial");
  });
});
