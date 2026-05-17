"""Trial source normalization helpers."""

INTERNAL_ONBOARDING_TRIAL_SOURCE = "onboarding_plan_selection"

PERSISTED_ONBOARDING_TRIAL_SOURCES = {
    "shop": "shop_onboarding",
    "api": "api",
    "marketing": "marketing",
}


def get_persisted_trial_source(request_source: str, domain: str) -> str:
    """
    Map internal request intents to analytics source values allowed by
    free_trials.source. The DB should never store UI/action sentinels.
    """
    if request_source != INTERNAL_ONBOARDING_TRIAL_SOURCE:
        return request_source or "organic"

    normalized_domain = (domain or "").strip().lower()
    return PERSISTED_ONBOARDING_TRIAL_SOURCES.get(normalized_domain, "organic")
