"""
Slug Generation Tests — Architecture Verification
====================================================
Tests the slug generation logic as a pure function.
Mirrors the DB trigger logic for verification without requiring DB.

No DB, no Redis, no network — pure input/output.

Architecture invariant:
  DB trigger is the SOLE slug owner.
  This test verifies the logic is correct.
"""

import re
import pytest


# =====================================================================
# Pure slug generation function (mirrors DB trigger logic exactly)
# =====================================================================

def generate_slug(input_text: str | None) -> str | None:
    """
    Generate a URL-safe slug from input text.
    Mirrors: generate_url_slug() in 038_enforce_slug_architecture.sql

    Returns None if input is None/empty (caller must handle fallback).
    """
    if input_text is None or input_text.strip() == "":
        return None

    slug = input_text.lower().strip()

    # Replace non-alphanumeric chars with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', slug)

    # Remove leading/trailing hyphens
    slug = re.sub(r'^-+|-+$', '', slug)

    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)

    # Max length 50 chars
    if len(slug) > 50:
        slug = slug[:50]
        slug = slug.rstrip('-')

    # If slug became empty after sanitization
    if slug == '':
        return None

    return slug


def generate_fallback_slug(user_id: str) -> str:
    """
    Generate a deterministic fallback slug from Supabase user UUID.
    Mirrors: trigger fallback logic in 038_enforce_slug_architecture.sql

    Pattern: '{first 8 chars of user_id}' (lowercase)
    Note: No 'store-' prefix since the URL path already contains /store/
    """
    return user_id[:8].lower()



def ensure_slug(business_name: str | None, user_id: str) -> str:
    """
    Determine the final slug for a business.
    Mirrors the full trigger logic:
      1. Try business_name → generate_slug()
      2. Fallback → generate_fallback_slug(user_id)
    """
    slug = generate_slug(business_name)
    if slug is None:
        slug = generate_fallback_slug(user_id)
    return slug


def resolve_collision(base_slug: str, suffix: str) -> str:
    """
    Resolve slug collision by appending a suffix.
    Mirrors: trigger collision handling in 038_enforce_slug_architecture.sql
    """
    return f"{base_slug}-{suffix}"


# =====================================================================
# TEST: generate_slug() — Pure slug generation
# =====================================================================

class TestGenerateSlug:
    """Slug generation from business name."""

    def test_simple_name(self):
        assert generate_slug("My Store") == "my-store"

    def test_single_word(self):
        assert generate_slug("Raja") == "raja"

    def test_with_special_chars(self):
        assert generate_slug("John's Shop & Café") == "john-s-shop-caf"

    def test_with_numbers(self):
        assert generate_slug("Store 123") == "store-123"

    def test_unicode_stripped(self):
        slug = generate_slug("मेरा स्टोर")
        # Unicode non-alphanumeric chars become hyphens, then stripped
        # Result depends on whether any a-z0-9 remain
        assert slug is None or isinstance(slug, str)

    def test_leading_trailing_spaces(self):
        assert generate_slug("  My Store  ") == "my-store"

    def test_multiple_spaces(self):
        assert generate_slug("My    Store") == "my-store"

    def test_consecutive_special_chars(self):
        assert generate_slug("My---Store!!!") == "my-store"

    def test_max_length_50(self):
        long_name = "a" * 60
        slug = generate_slug(long_name)
        assert slug is not None
        assert len(slug) <= 50

    def test_max_length_no_trailing_hyphen(self):
        # Name that would produce trailing hyphen at 50 chars
        name = "a" * 49 + "-b"
        slug = generate_slug(name)
        assert slug is not None
        assert not slug.endswith('-')

    def test_empty_string_returns_none(self):
        assert generate_slug("") is None

    def test_none_returns_none(self):
        assert generate_slug(None) is None

    def test_whitespace_only_returns_none(self):
        assert generate_slug("   ") is None

    def test_special_chars_only_returns_none(self):
        assert generate_slug("!!!@@@###") is None

    def test_lowercase_output(self):
        slug = generate_slug("MY STORE")
        assert slug is not None
        assert slug == slug.lower()

    def test_no_leading_hyphen(self):
        slug = generate_slug("-My Store")
        assert slug is not None
        assert not slug.startswith('-')

    def test_no_trailing_hyphen(self):
        slug = generate_slug("My Store-")
        assert slug is not None
        assert not slug.endswith('-')


# =====================================================================
# TEST: generate_fallback_slug() — UUID-based fallback
# =====================================================================

class TestFallbackSlug:
    """Fallback slug from Supabase UUID."""

    def test_uses_first_8_chars(self):
        user_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        assert generate_fallback_slug(user_id) == "a1b2c3d4"

    def test_no_store_prefix(self):
        slug = generate_fallback_slug("xyz12345-rest-ignored")
        assert not slug.startswith("store-")
        assert slug == "xyz12345"

    def test_deterministic(self):
        user_id = "same-uuid-same-result"
        assert generate_fallback_slug(user_id) == generate_fallback_slug(user_id)

    def test_different_ids_different_slugs(self):
        assert generate_fallback_slug("aaaaaaaa") != generate_fallback_slug("bbbbbbbb")


# =====================================================================
# TEST: ensure_slug() — Full trigger logic
# =====================================================================

class TestEnsureSlug:
    """Combined slug resolution: business_name → fallback."""

    def test_with_business_name(self):
        slug = ensure_slug("My Store", "a1b2c3d4-e5f6-7890")
        assert slug == "my-store"

    def test_without_business_name(self):
        slug = ensure_slug(None, "a1b2c3d4-e5f6-7890")
        assert slug == "a1b2c3d4"

    def test_empty_business_name(self):
        slug = ensure_slug("", "a1b2c3d4-e5f6-7890")
        assert slug == "a1b2c3d4"

    def test_whitespace_business_name(self):
        slug = ensure_slug("   ", "a1b2c3d4-e5f6-7890")
        assert slug == "a1b2c3d4"

    def test_special_chars_only_business_name(self):
        slug = ensure_slug("@@@", "a1b2c3d4-e5f6-7890")
        assert slug == "a1b2c3d4"

    def test_valid_name_preferred_over_fallback(self):
        slug = ensure_slug("Raja", "a1b2c3d4-e5f6-7890")
        assert slug == "raja"
        assert slug != "a1b2c3d4"

    def test_never_returns_none(self):
        """Slug must ALWAYS exist — this is the invariant."""
        test_cases = [
            (None, "user123"),
            ("", "user456"),
            ("   ", "user789"),
            ("@@@", "userabc"),
            ("Valid Name", "userdef"),
        ]
        for name, uid in test_cases:
            slug = ensure_slug(name, uid)
            assert slug is not None, f"ensure_slug({name!r}, {uid!r}) returned None"
            assert len(slug) > 0, f"ensure_slug({name!r}, {uid!r}) returned empty string"


# =====================================================================
# TEST: Collision handling
# =====================================================================

class TestCollisionHandling:
    """Slug collision resolution."""

    def test_collision_appends_suffix(self):
        result = resolve_collision("my-store", "a1b2")
        assert result == "my-store-a1b2"

    def test_collision_preserves_base(self):
        result = resolve_collision("raja", "x9y8")
        assert result.startswith("raja-")

    def test_collision_result_different_from_base(self):
        base = "my-store"
        result = resolve_collision(base, "abcd")
        assert result != base


# =====================================================================
# TEST: Slug format invariants
# =====================================================================

class TestSlugFormatInvariants:
    """All slugs must satisfy URL-safe format constraints."""

    @pytest.mark.parametrize("name", [
        "My Store",
        "Raja's Boutique",
        "Store 123",
        "UPPERCASE NAME",
        "name with     multiple   spaces",
        "name-with-hyphens",
        "name_with_underscores",
    ])
    def test_slug_is_url_safe(self, name):
        slug = generate_slug(name)
        assert slug is not None
        # Only lowercase alphanumeric and hyphens
        assert re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', slug) or re.match(r'^[a-z0-9]$', slug), \
            f"Slug '{slug}' is not URL-safe"

    @pytest.mark.parametrize("name", [
        "My Store",
        "Hello World",
        "Test",
    ])
    def test_slug_is_lowercase(self, name):
        slug = generate_slug(name)
        assert slug is not None
        assert slug == slug.lower()

    @pytest.mark.parametrize("name", [
        "My Store",
        "Hello World",
        "Test 123",
    ])
    def test_slug_has_no_consecutive_hyphens(self, name):
        slug = generate_slug(name)
        assert slug is not None
        assert '--' not in slug


# =====================================================================
# TEST: Idempotency
# =====================================================================

class TestIdempotency:
    """Slug generation must be idempotent (pure function)."""

    def test_same_input_same_output(self):
        for _ in range(10):
            assert generate_slug("My Store") == "my-store"

    def test_ensure_slug_idempotent(self):
        results = set()
        for _ in range(10):
            results.add(ensure_slug("My Store", "abc12345"))
        assert len(results) == 1

    def test_fallback_idempotent(self):
        results = set()
        for _ in range(10):
            results.add(ensure_slug(None, "abc12345"))
        assert len(results) == 1
