"""
Form Validation Engine — Production-Grade, Schema-Driven

This is the SINGLE SOURCE OF TRUTH for form submission validation.
Both frontend and backend MUST mirror the same rules.

Architecture:
  validate_submission(fields, values)
    → for each field:
        1. Evaluate conditional logic (skip hidden fields)
        2. Check required (only if field.required == True)
        3. If value is empty and NOT required → SKIP all further validation
        4. Run type-specific validation (email, phone, url, number, date, etc.)
        5. Run custom cross-field rules

Security:
  - No eval/exec — all rules are declarative JSON
  - Regex patterns use re.fullmatch with length caps
  - String inputs are trimmed and length-capped
  - HTML tags are stripped from text inputs

Performance:
  - Single-pass validation (O(n) over fields)
  - Early exit on first error per field
  - Field map built once for cross-field lookups
"""

import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, date

logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

# Layout/non-input field types — never validated
LAYOUT_TYPES = frozenset([
    "heading", "paragraph_block", "description", "divider", "spacer",
])

# Hidden field types — validated only if they have a value
SKIP_REQUIRED_TYPES = frozenset([
    "hidden", "utm",
])

# Maximum input length (prevents abuse)
MAX_INPUT_LENGTH = 10_000

# RFC 5322 simplified email pattern (covers 99.9% of real addresses)
EMAIL_PATTERN = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9]"
    r"(?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)

# URL pattern (http/https only)
URL_PATTERN = re.compile(
    r"^https?://"
    r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"
    r"(?:/[^\s]*)?$"
)

# Phone: 7-15 digits after stripping formatting
PHONE_DIGITS_PATTERN = re.compile(r"^\+?[\d\s\-().]{7,20}$")

# Time: HH:MM or HH:MM:SS (24h)
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}(?::\d{2})?$")


# =============================================================================
# PUBLIC API
# =============================================================================

def validate_submission(
    fields: List[Dict[str, Any]],
    values: Dict[str, str],
) -> Dict[str, str]:
    """
    Validate a complete form submission.

    Args:
        fields: List of field dicts (from DB, includes field_type, required,
                validation, options, conditional, settings)
        values: Dict mapping field_id → submitted value (all strings)

    Returns:
        Dict of {field_id: error_message} — empty dict means valid.

    Behavior:
        - Layout fields are always skipped
        - If field.required is False AND value is empty → NO validation runs
        - If field.required is True AND value is empty → "required" error
        - If value is present → type-specific + custom rules run regardless
          of required flag
    """
    errors: Dict[str, str] = {}
    field_map = {f["id"]: f for f in fields}

    for field in fields:
        field_type = field.get("field_type", "")
        field_id = field["id"]

        # 1. Skip layout fields entirely
        if field_type in LAYOUT_TYPES:
            continue

        # 2. Evaluate conditional logic — skip hidden fields
        if not _is_field_visible(field, values, field_map):
            continue

        # 3. Determine if field is required (static or conditional)
        is_required = _is_field_required(field, values, field_map)

        # 4. Get and sanitize value
        raw_value = values.get(field_id, "")
        value = _sanitize_input(raw_value) if raw_value else ""

        # 5. Required check
        if is_required and field_type not in SKIP_REQUIRED_TYPES:
            if not value:
                label = field.get("label", "This field")
                errors[field_id] = f"{label} is required"
                continue  # No point validating further

        # 6. If value is empty and NOT required → skip all validation
        if not value:
            continue

        # 7. Type-specific validation
        error = _validate_by_type(field, value, values, field_map)
        if error:
            errors[field_id] = error
            continue

        # 8. Cross-field custom rules
        validation = field.get("validation") or {}
        custom_rules = validation.get("customRules", [])
        if custom_rules:
            error = _validate_custom_rules(custom_rules, value, values, field_map)
            if error:
                errors[field_id] = error

    return errors


# =============================================================================
# CONDITIONAL LOGIC ENGINE
# =============================================================================

def _is_field_visible(
    field: Dict[str, Any],
    values: Dict[str, str],
    field_map: Dict[str, Dict[str, Any]],
) -> bool:
    """
    Evaluate conditional visibility logic.

    If field has no conditional config → always visible.
    Supports: show, hide actions with all/any logic.
    """
    conditional = field.get("conditional")
    if not conditional:
        return True

    action = conditional.get("action", "show")  # "show" or "hide"
    logic = conditional.get("logic", "all")      # "all" (AND) or "any" (OR)
    conditions = conditional.get("conditions", [])

    if not conditions:
        return True

    results = [_evaluate_condition(c, values) for c in conditions]

    if logic == "all":
        conditions_met = all(results)
    else:  # "any"
        conditions_met = any(results)

    if action == "show":
        return conditions_met
    elif action == "hide":
        return not conditions_met
    return True


def _is_field_required(
    field: Dict[str, Any],
    values: Dict[str, str],
    field_map: Dict[str, Dict[str, Any]],
) -> bool:
    """
    Determine if a field is required.

    Priority:
    1. Conditional "require" action overrides static required
    2. Static field.required flag
    """
    # Check for conditional require
    conditional = field.get("conditional")
    if conditional and conditional.get("action") == "require":
        logic = conditional.get("logic", "all")
        conditions = conditional.get("conditions", [])
        if conditions:
            results = [_evaluate_condition(c, values) for c in conditions]
            if logic == "all":
                return all(results)
            else:
                return any(results)

    # Fall back to static required flag
    return field.get("required", False)


def _evaluate_condition(
    condition: Dict[str, Any],
    values: Dict[str, str],
) -> bool:
    """Evaluate a single conditional expression."""
    target_field_id = condition.get("field", "")
    operator = condition.get("operator", "equals")
    expected = str(condition.get("value", ""))
    actual = str(values.get(target_field_id, "")).strip()

    if operator == "equals":
        return actual.lower() == expected.lower()
    elif operator == "not_equals":
        return actual.lower() != expected.lower()
    elif operator == "contains":
        return expected.lower() in actual.lower()
    elif operator == "not_contains":
        return expected.lower() not in actual.lower()
    elif operator == "greater_than":
        try:
            return float(actual) > float(expected)
        except (ValueError, TypeError):
            return False
    elif operator == "less_than":
        try:
            return float(actual) < float(expected)
        except (ValueError, TypeError):
            return False
    elif operator == "is_empty":
        return not actual
    elif operator == "is_not_empty":
        return bool(actual)
    return False


# =============================================================================
# TYPE-SPECIFIC VALIDATORS
# =============================================================================

def _validate_by_type(
    field: Dict[str, Any],
    value: str,
    all_values: Dict[str, str],
    field_map: Dict[str, Dict[str, Any]],
) -> Optional[str]:
    """Dispatch to the appropriate type-specific validator."""
    field_type = field.get("field_type", "text")
    validation = field.get("validation") or {}

    # ── Text types (text, textarea, password) ────────────────────────────
    if field_type in ("text", "textarea", "password"):
        return _validate_text(value, validation)

    # ── Email ────────────────────────────────────────────────────────────
    if field_type == "email":
        return _validate_email(value, validation)

    # ── Phone ────────────────────────────────────────────────────────────
    if field_type in ("phone", "phone_international"):
        return _validate_phone(value, validation)

    # ── Number / Rating / Scale / Slider ─────────────────────────────────
    if field_type in ("number", "rating", "scale", "slider"):
        return _validate_number(value, validation, field)

    # ── URL ──────────────────────────────────────────────────────────────
    if field_type == "url":
        return _validate_url(value, validation)

    # ── Date ─────────────────────────────────────────────────────────────
    if field_type == "date":
        return _validate_date(value, validation)

    # ── Date Range ───────────────────────────────────────────────────────
    if field_type == "date_range":
        return _validate_date_range(value, validation)

    # ── Time ─────────────────────────────────────────────────────────────
    if field_type == "time":
        return _validate_time(value)

    # ── Choice types (dropdown, radio, yes_no) ───────────────────────────
    if field_type in ("dropdown", "radio", "yes_no"):
        return _validate_single_choice(value, field)

    # ── Multi-choice (checkbox, multi_select) ────────────────────────────
    if field_type in ("checkbox", "multi_select"):
        return _validate_multi_choice(value, field, validation)

    # ── Consent checkbox ─────────────────────────────────────────────────
    if field_type == "consent_checkbox":
        return _validate_consent(value, field)

    # ── File upload ──────────────────────────────────────────────────────
    if field_type == "file_upload":
        return _validate_file(value, validation)

    # ── Address ──────────────────────────────────────────────────────────
    if field_type == "address":
        return _validate_text(value, validation)

    # ── Signature ────────────────────────────────────────────────────────
    if field_type == "signature":
        return None  # Presence check handled by required

    # ── Hidden / UTM ─────────────────────────────────────────────────────
    if field_type in ("hidden", "utm"):
        return None

    # ── Fallback: treat as text ──────────────────────────────────────────
    return _validate_text(value, validation)


# ── Text ─────────────────────────────────────────────────────────────────

def _validate_text(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """Validate text/textarea/password fields."""
    min_len = validation.get("minLength")
    max_len = validation.get("maxLength")
    pattern = validation.get("pattern")
    pattern_msg = validation.get("patternMessage", "Invalid format")

    if min_len is not None and len(value) < int(min_len):
        return f"Must be at least {min_len} characters"

    if max_len is not None and len(value) > int(max_len):
        return f"Must be no more than {max_len} characters"

    if pattern:
        try:
            # Cap pattern input length to prevent ReDoS on long strings
            test_value = value[:1000]
            if not re.fullmatch(pattern, test_value):
                return pattern_msg
        except re.error:
            logger.warning(f"Invalid regex pattern in field validation: {pattern}")
            # Don't fail on bad regex — skip this rule
            pass

    return None


# ── Email ────────────────────────────────────────────────────────────────

def _validate_email(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """Validate email addresses using RFC 5322 simplified pattern."""
    if not EMAIL_PATTERN.match(value):
        return "Please enter a valid email address"

    # Additional length check (RFC allows max 254 chars)
    if len(value) > 254:
        return "Email address is too long"

    # Check for custom pattern override
    pattern = validation.get("pattern")
    if pattern:
        try:
            if not re.fullmatch(pattern, value[:1000]):
                return validation.get("patternMessage", "Invalid email format")
        except re.error:
            pass

    return None


# ── Phone ────────────────────────────────────────────────────────────────

def _validate_phone(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """Validate phone numbers (7-15 digits after stripping formatting)."""
    if not PHONE_DIGITS_PATTERN.match(value):
        return "Please enter a valid phone number"

    # Extract just digits
    digits = re.sub(r"\D", "", value)
    if len(digits) < 7:
        return "Phone number is too short"
    if len(digits) > 15:
        return "Phone number is too long"

    return None


# ── Number ───────────────────────────────────────────────────────────────

def _validate_number(
    value: str,
    validation: Dict[str, Any],
    field: Dict[str, Any],
) -> Optional[str]:
    """Validate numeric fields (number, rating, scale, slider)."""
    try:
        num = float(value)
    except (ValueError, TypeError):
        return "Please enter a valid number"

    field_type = field.get("field_type", "number")
    settings = field.get("settings") or {}

    # Determine min/max from validation first, then field settings
    min_val = validation.get("min")
    max_val = validation.get("max")

    # For rating/scale/slider, use settings as defaults if validation doesn't set them
    if field_type == "rating":
        if min_val is None:
            min_val = 1
        if max_val is None:
            max_val = settings.get("maxStars", 5)
    elif field_type == "scale":
        if min_val is None:
            min_val = settings.get("min", 1)
        if max_val is None:
            max_val = settings.get("max", 10)
    elif field_type == "slider":
        if min_val is None:
            min_val = settings.get("min", 0)
        if max_val is None:
            max_val = settings.get("max", 100)

    if min_val is not None:
        try:
            if num < float(min_val):
                return f"Must be at least {min_val}"
        except (ValueError, TypeError):
            pass

    if max_val is not None:
        try:
            if num > float(max_val):
                return f"Must be no more than {max_val}"
        except (ValueError, TypeError):
            pass

    return None


# ── URL ──────────────────────────────────────────────────────────────────

def _validate_url(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """Validate URLs (http/https only)."""
    if not URL_PATTERN.match(value):
        return "Please enter a valid URL (must start with http:// or https://)"

    if len(value) > 2048:
        return "URL is too long"

    return None


# ── Date ─────────────────────────────────────────────────────────────────

def _validate_date(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """Validate date fields (ISO 8601 format: YYYY-MM-DD)."""
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return "Please enter a valid date (YYYY-MM-DD)"

    min_date_str = validation.get("minDate")
    max_date_str = validation.get("maxDate")

    today = date.today()

    if min_date_str:
        min_date = today if min_date_str == "today" else _parse_date(min_date_str)
        if min_date and parsed < min_date:
            return f"Date must be on or after {min_date.isoformat()}"

    if max_date_str:
        max_date = today if max_date_str == "today" else _parse_date(max_date_str)
        if max_date and parsed > max_date:
            return f"Date must be on or before {max_date.isoformat()}"

    return None


def _validate_date_range(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """Validate date range fields (expects 'start_date,end_date' format)."""
    parts = value.split(",")
    if len(parts) != 2:
        return "Please select both a start and end date"

    try:
        start = datetime.strptime(parts[0].strip(), "%Y-%m-%d").date()
        end = datetime.strptime(parts[1].strip(), "%Y-%m-%d").date()
    except ValueError:
        return "Please enter valid dates (YYYY-MM-DD)"

    if start > end:
        return "Start date must be before end date"

    return None


# ── Time ─────────────────────────────────────────────────────────────────

def _validate_time(value: str) -> Optional[str]:
    """Validate time fields (HH:MM or HH:MM:SS)."""
    if not TIME_PATTERN.match(value):
        return "Please enter a valid time (HH:MM)"
    return None


# ── Single Choice ────────────────────────────────────────────────────────

def _validate_single_choice(value: str, field: Dict[str, Any]) -> Optional[str]:
    """Validate dropdown, radio, yes_no fields."""
    options = field.get("options") or []
    validation = field.get("validation") or {}
    allowed = validation.get("allowedValues")

    if allowed:
        allowed_set = set(str(v) for v in allowed)
    elif options:
        allowed_set = set(str(o.get("value", "")) for o in options)
    else:
        return None  # No options defined — can't validate

    if value not in allowed_set:
        return "Please select a valid option"
    return None


# ── Multi Choice ─────────────────────────────────────────────────────────

def _validate_multi_choice(
    value: str,
    field: Dict[str, Any],
    validation: Dict[str, Any],
) -> Optional[str]:
    """Validate checkbox, multi_select fields."""
    selected = [v.strip() for v in value.split(",") if v.strip()]

    if not selected:
        return None  # Empty handled by required check

    # Validate against allowed values
    options = field.get("options") or []
    allowed = validation.get("allowedValues")
    if allowed:
        allowed_set = set(str(v) for v in allowed)
    elif options:
        allowed_set = set(str(o.get("value", "")) for o in options)
    else:
        allowed_set = None

    if allowed_set:
        invalid = [v for v in selected if v not in allowed_set]
        if invalid:
            return "One or more selected values are not allowed"

    # Min/max selections
    min_sel = validation.get("minSelections")
    max_sel = validation.get("maxSelections")

    if min_sel is not None and len(selected) < int(min_sel):
        return f"Please select at least {min_sel} option(s)"
    if max_sel is not None and len(selected) > int(max_sel):
        return f"Please select no more than {max_sel} option(s)"

    return None


# ── Consent ──────────────────────────────────────────────────────────────

def _validate_consent(value: str, field: Dict[str, Any]) -> Optional[str]:
    """Validate consent checkbox (must be explicitly checked/true)."""
    if field.get("required", False) and value.lower() not in ("true", "yes", "1", "on"):
        return "You must agree to continue"
    return None


# ── File Upload ──────────────────────────────────────────────────────────

def _validate_file(value: str, validation: Dict[str, Any]) -> Optional[str]:
    """
    Validate file upload metadata.

    Note: actual file content validation happens at the upload endpoint.
    Here we validate the filename/metadata sent with the form submission.
    """
    allowed_types = validation.get("allowedTypes", [])
    max_size_mb = validation.get("maxFileSize")

    # File type check (based on extension if we have filename)
    if allowed_types and value:
        ext = value.rsplit(".", 1)[-1].lower() if "." in value else ""
        # Check against explicit extensions or MIME wildcards
        type_valid = False
        for allowed in allowed_types:
            if "/" in allowed:
                # MIME type like "image/*" or "application/pdf"
                if allowed.endswith("/*"):
                    # Wildcard — can't fully validate from filename alone
                    type_valid = True
                    break
                # Specific MIME — map common ones to extensions
                mime_ext_map = {
                    "application/pdf": "pdf",
                    "image/png": "png",
                    "image/jpeg": "jpg",
                    "image/gif": "gif",
                    "image/webp": "webp",
                    "application/msword": "doc",
                    "text/csv": "csv",
                }
                if mime_ext_map.get(allowed) == ext:
                    type_valid = True
                    break
            else:
                # Direct extension comparison
                if ext == allowed.lower().lstrip("."):
                    type_valid = True
                    break

        if not type_valid and ext:
            return f"File type .{ext} is not allowed"

    return None


# =============================================================================
# CROSS-FIELD RULES
# =============================================================================

def _validate_custom_rules(
    rules: List[Dict[str, Any]],
    value: str,
    all_values: Dict[str, str],
    field_map: Dict[str, Dict[str, Any]],
) -> Optional[str]:
    """
    Evaluate declarative cross-field validation rules.

    Supported rule types:
      - matches_field: value must equal another field's value
      - less_than_field: numeric value must be < another field
      - greater_than_field: numeric value must be > another field
      - different_from_field: value must differ from another field
    """
    for rule in rules:
        rule_type = rule.get("type", "")
        target_field = rule.get("field", "")
        message = rule.get("message", "Validation failed")
        target_value = str(all_values.get(target_field, "")).strip()

        if rule_type == "matches_field":
            if value != target_value:
                return message

        elif rule_type == "different_from_field":
            if value == target_value:
                return message

        elif rule_type == "greater_than_field":
            try:
                if float(value) <= float(target_value):
                    return message
            except (ValueError, TypeError):
                pass

        elif rule_type == "less_than_field":
            try:
                if float(value) >= float(target_value):
                    return message
            except (ValueError, TypeError):
                pass

    return None


# =============================================================================
# HELPERS
# =============================================================================

def _sanitize_input(value: str) -> str:
    """Sanitize user input: trim whitespace, cap length, strip HTML."""
    if not isinstance(value, str):
        return str(value)[:MAX_INPUT_LENGTH].strip()

    # Trim whitespace
    value = value.strip()

    # Cap length
    if len(value) > MAX_INPUT_LENGTH:
        value = value[:MAX_INPUT_LENGTH]

    # Strip basic HTML tags (prevents stored XSS in text fields)
    value = re.sub(r"<[^>]+>", "", value)

    return value


def _parse_date(value: str) -> Optional[date]:
    """Parse a date string (YYYY-MM-DD)."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
