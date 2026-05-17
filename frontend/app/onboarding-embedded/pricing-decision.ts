export type OnboardingPricingMode = "paid" | "trial";
export type OnboardingPlanId = "starter" | "business" | "pro";
export type OnboardingPricingAction = "paid_checkout" | "start_trial";

export const ONBOARDING_PRICING_TRIAL_TOGGLE_FLAG =
  "onboarding_pricing_trial_toggle";

export function resolvePricingAction(
  pricingMode: OnboardingPricingMode,
  planId: OnboardingPlanId,
): OnboardingPricingAction {
  return pricingMode === "trial" && planId === "starter"
    ? "start_trial"
    : "paid_checkout";
}

export function resolvePricingModeFromFlag(params: {
  requestedMode: OnboardingPricingMode;
  flagEnabled: boolean;
}): OnboardingPricingMode {
  if (!params.flagEnabled) return "paid";
  return params.requestedMode;
}
