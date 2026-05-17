from services.trial_sources import (
    INTERNAL_ONBOARDING_TRIAL_SOURCE,
    get_persisted_trial_source,
)
from services.trial_engine import TrialSource


def test_onboarding_plan_selection_persists_as_shop_onboarding():
    assert (
        get_persisted_trial_source(INTERNAL_ONBOARDING_TRIAL_SOURCE, "shop")
        == TrialSource.SHOP_ONBOARDING.value
    )


def test_internal_onboarding_source_is_never_persisted():
    persisted_source = get_persisted_trial_source(
        INTERNAL_ONBOARDING_TRIAL_SOURCE,
        "shop",
    )

    assert persisted_source != INTERNAL_ONBOARDING_TRIAL_SOURCE


def test_existing_public_sources_pass_through():
    assert get_persisted_trial_source("organic", "shop") == "organic"
    assert get_persisted_trial_source("admin_grant", "shop") == "admin_grant"
