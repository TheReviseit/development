/**
 * Form Validation Engine — Frontend (TypeScript)
 *
 * MIRRORS THE BACKEND (form_validator.py) EXACTLY.
 * Same rules, same error messages, same behavior.
 *
 * Key behavior:
 *   - If field.required is false AND value is empty → NO validation runs
 *   - If field.required is true AND value is empty → "required" error
 *   - If value is present → type-specific validation runs regardless of required
 *   - Layout fields (heading, divider, etc.) are always skipped
 *   - Conditional logic can show/hide fields or make them dynamically required
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FormField {
  id: string;
  field_type: string;
  label: string;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
  required: boolean;
  options: { label: string; value: string }[];
  validation?: ValidationRules;
  conditional?: ConditionalConfig;
  settings?: Record<string, unknown>;
  position?: number;
}

export interface ValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
  allowedTypes?: string[];
  maxFileSize?: number;
  allowedValues?: string[];
  minSelections?: number;
  maxSelections?: number;
  customRules?: CustomRule[];
}

export interface CustomRule {
  type: "matches_field" | "different_from_field" | "greater_than_field" | "less_than_field";
  field: string;
  message: string;
}

export interface ConditionalConfig {
  action: "show" | "hide" | "require";
  logic: "all" | "any";
  conditions: ConditionalCondition[];
}

export interface ConditionalCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LAYOUT_TYPES = new Set([
  "heading", "paragraph_block", "description", "divider", "spacer",
]);

const SKIP_REQUIRED_TYPES = new Set(["hidden", "utm"]);

const MAX_INPUT_LENGTH = 10_000;

// RFC 5322 simplified email
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// URL (http/https)
const URL_REGEX =
  /^https?:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(?:\/[^\s]*)?$/;

// Phone: 7-20 chars with digits, spaces, dashes, parens
const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;

// Time: HH:MM or HH:MM:SS
const TIME_REGEX = /^\d{2}:\d{2}(?::\d{2})?$/;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Validate a complete form submission.
 *
 * @param fields - Field definitions from the form
 * @param values - Record<fieldId, value> submitted by user
 * @returns Record<fieldId, errorMessage> — empty means valid
 */
export function validateSubmission(
  fields: FormField[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const fieldMap = new Map(fields.map((f) => [f.id, f]));

  for (const field of fields) {
    const fieldType = field.field_type;
    const fieldId = field.id;

    // 1. Skip layout fields
    if (LAYOUT_TYPES.has(fieldType)) continue;

    // 2. Evaluate conditional visibility
    if (!isFieldVisible(field, values)) continue;

    // 3. Determine required status
    const isRequired = isFieldRequired(field, values);

    // 4. Get and sanitize value
    const rawValue = values[fieldId] || "";
    const value = rawValue.trim().slice(0, MAX_INPUT_LENGTH);

    // 5. Required check
    if (isRequired && !SKIP_REQUIRED_TYPES.has(fieldType)) {
      if (!value) {
        errors[fieldId] = `${field.label} is required`;
        continue;
      }
    }

    // 6. Empty + not required → skip
    if (!value) continue;

    // 7. Type-specific validation
    const error = validateByType(field, value, values, fieldMap);
    if (error) {
      errors[fieldId] = error;
      continue;
    }

    // 8. Cross-field custom rules
    const customRules = field.validation?.customRules;
    if (customRules && customRules.length > 0) {
      const crossError = validateCustomRules(customRules, value, values);
      if (crossError) {
        errors[fieldId] = crossError;
      }
    }
  }

  return errors;
}

/**
 * Validate a single field (for onBlur real-time validation).
 */
export function validateField(
  field: FormField,
  value: string,
  allValues: Record<string, string>,
  allFields: FormField[],
): string | null {
  if (LAYOUT_TYPES.has(field.field_type)) return null;
  if (!isFieldVisible(field, allValues)) return null;

  const isRequired = isFieldRequired(field, allValues);
  const trimmed = value.trim().slice(0, MAX_INPUT_LENGTH);

  if (isRequired && !SKIP_REQUIRED_TYPES.has(field.field_type) && !trimmed) {
    return `${field.label} is required`;
  }

  if (!trimmed) return null;

  const fieldMap = new Map(allFields.map((f) => [f.id, f]));
  const error = validateByType(field, trimmed, allValues, fieldMap);
  if (error) return error;

  const customRules = field.validation?.customRules;
  if (customRules && customRules.length > 0) {
    return validateCustomRules(customRules, trimmed, allValues);
  }

  return null;
}

// =============================================================================
// CONDITIONAL LOGIC
// =============================================================================

export function isFieldVisible(
  field: FormField,
  values: Record<string, string>,
): boolean {
  const conditional = field.conditional;
  if (!conditional) return true;

  const { action, logic, conditions } = conditional;
  if (!conditions || conditions.length === 0) return true;

  const results = conditions.map((c) => evaluateCondition(c, values));
  const conditionsMet = logic === "all" ? results.every(Boolean) : results.some(Boolean);

  if (action === "show") return conditionsMet;
  if (action === "hide") return !conditionsMet;
  return true;
}

export function isFieldRequired(
  field: FormField,
  values: Record<string, string>,
): boolean {
  const conditional = field.conditional;
  if (conditional?.action === "require") {
    const { logic, conditions } = conditional;
    if (conditions && conditions.length > 0) {
      const results = conditions.map((c) => evaluateCondition(c, values));
      return logic === "all" ? results.every(Boolean) : results.some(Boolean);
    }
  }
  return field.required;
}

function evaluateCondition(
  condition: ConditionalCondition,
  values: Record<string, string>,
): boolean {
  const actual = (values[condition.field] || "").trim();
  const expected = String(condition.value || "");

  switch (condition.operator) {
    case "equals":
      return actual.toLowerCase() === expected.toLowerCase();
    case "not_equals":
      return actual.toLowerCase() !== expected.toLowerCase();
    case "contains":
      return actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains":
      return !actual.toLowerCase().includes(expected.toLowerCase());
    case "greater_than":
      return !isNaN(Number(actual)) && !isNaN(Number(expected)) && Number(actual) > Number(expected);
    case "less_than":
      return !isNaN(Number(actual)) && !isNaN(Number(expected)) && Number(actual) < Number(expected);
    case "is_empty":
      return !actual;
    case "is_not_empty":
      return !!actual;
    default:
      return false;
  }
}

// =============================================================================
// TYPE-SPECIFIC VALIDATORS
// =============================================================================

function validateByType(
  field: FormField,
  value: string,
  allValues: Record<string, string>,
  fieldMap: Map<string, FormField>,
): string | null {
  const type = field.field_type;
  const v = field.validation || {};

  if (["text", "textarea", "password"].includes(type)) return validateText(value, v);
  if (type === "email") return validateEmail(value, v);
  if (["phone", "phone_international"].includes(type)) return validatePhone(value);
  if (["number", "rating", "scale", "slider"].includes(type)) return validateNumber(value, v, field);
  if (type === "url") return validateUrl(value);
  if (type === "date") return validateDate(value, v);
  if (type === "date_range") return validateDateRange(value);
  if (type === "time") return validateTime(value);
  if (["dropdown", "radio", "yes_no"].includes(type)) return validateSingleChoice(value, field);
  if (["checkbox", "multi_select"].includes(type)) return validateMultiChoice(value, field, v);
  if (type === "consent_checkbox") return validateConsent(value, field);
  if (type === "file_upload") return validateFile(value, v);
  if (type === "address") return validateText(value, v);
  if (["hidden", "utm", "signature"].includes(type)) return null;

  return validateText(value, v); // fallback
}

// ── Text ────────────────────────────────────────────────────────────────

function validateText(value: string, v: ValidationRules): string | null {
  if (v.minLength != null && value.length < v.minLength) {
    return `Must be at least ${v.minLength} characters`;
  }
  if (v.maxLength != null && value.length > v.maxLength) {
    return `Must be no more than ${v.maxLength} characters`;
  }
  if (v.pattern) {
    try {
      if (!new RegExp(v.pattern).test(value.slice(0, 1000))) {
        return v.patternMessage || "Invalid format";
      }
    } catch {
      // Invalid regex — skip
    }
  }
  return null;
}

// ── Email ───────────────────────────────────────────────────────────────

function validateEmail(value: string, v: ValidationRules): string | null {
  if (!EMAIL_REGEX.test(value)) {
    return "Please enter a valid email address";
  }
  if (value.length > 254) {
    return "Email address is too long";
  }
  if (v.pattern) {
    try {
      if (!new RegExp(v.pattern).test(value.slice(0, 1000))) {
        return v.patternMessage || "Invalid email format";
      }
    } catch {
      // skip
    }
  }
  return null;
}

// ── Phone ───────────────────────────────────────────────────────────────

function validatePhone(value: string): string | null {
  if (!PHONE_REGEX.test(value)) {
    return "Please enter a valid phone number";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return "Phone number is too short";
  if (digits.length > 15) return "Phone number is too long";
  return null;
}

// ── Number ──────────────────────────────────────────────────────────────

function validateNumber(value: string, v: ValidationRules, field: FormField): string | null {
  const num = Number(value);
  if (isNaN(num)) return "Please enter a valid number";

  const settings = (field.settings || {}) as Record<string, number>;
  let min = v.min;
  let max = v.max;

  // Derive from settings if not in validation
  if (field.field_type === "rating") {
    if (min == null) min = 1;
    if (max == null) max = settings.maxStars ?? 5;
  } else if (field.field_type === "scale") {
    if (min == null) min = settings.min ?? 1;
    if (max == null) max = settings.max ?? 10;
  } else if (field.field_type === "slider") {
    if (min == null) min = settings.min ?? 0;
    if (max == null) max = settings.max ?? 100;
  }

  if (min != null && num < min) return `Must be at least ${min}`;
  if (max != null && num > max) return `Must be no more than ${max}`;
  return null;
}

// ── URL ─────────────────────────────────────────────────────────────────

function validateUrl(value: string): string | null {
  if (!URL_REGEX.test(value)) {
    return "Please enter a valid URL (must start with http:// or https://)";
  }
  if (value.length > 2048) return "URL is too long";
  return null;
}

// ── Date ────────────────────────────────────────────────────────────────

function validateDate(value: string, v: ValidationRules): string | null {
  const parsed = parseDate(value);
  if (!parsed) return "Please enter a valid date (YYYY-MM-DD)";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (v.minDate) {
    const min = v.minDate === "today" ? today : parseDate(v.minDate);
    if (min && parsed < min) return `Date must be on or after ${formatDate(min)}`;
  }
  if (v.maxDate) {
    const max = v.maxDate === "today" ? today : parseDate(v.maxDate);
    if (max && parsed > max) return `Date must be on or before ${formatDate(max)}`;
  }
  return null;
}

function validateDateRange(value: string): string | null {
  const parts = value.split(",");
  if (parts.length !== 2) return "Please select both a start and end date";

  const start = parseDate(parts[0].trim());
  const end = parseDate(parts[1].trim());
  if (!start || !end) return "Please enter valid dates (YYYY-MM-DD)";
  if (start > end) return "Start date must be before end date";
  return null;
}

// ── Time ────────────────────────────────────────────────────────────────

function validateTime(value: string): string | null {
  if (!TIME_REGEX.test(value)) return "Please enter a valid time (HH:MM)";
  return null;
}

// ── Single Choice ───────────────────────────────────────────────────────

function validateSingleChoice(value: string, field: FormField): string | null {
  const allowed = field.validation?.allowedValues;
  const options = field.options || [];

  const allowedSet = new Set(
    allowed
      ? allowed.map(String)
      : options.map((o) => String(o.value)),
  );

  if (allowedSet.size === 0) return null;
  if (!allowedSet.has(value)) return "Please select a valid option";
  return null;
}

// ── Multi Choice ────────────────────────────────────────────────────────

function validateMultiChoice(value: string, field: FormField, v: ValidationRules): string | null {
  const selected = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (selected.length === 0) return null;

  const allowed = v.allowedValues;
  const options = field.options || [];
  const allowedSet = new Set(
    allowed ? allowed.map(String) : options.map((o) => String(o.value)),
  );

  if (allowedSet.size > 0) {
    const invalid = selected.filter((s) => !allowedSet.has(s));
    if (invalid.length > 0) return "One or more selected values are not allowed";
  }

  if (v.minSelections != null && selected.length < v.minSelections) {
    return `Please select at least ${v.minSelections} option(s)`;
  }
  if (v.maxSelections != null && selected.length > v.maxSelections) {
    return `Please select no more than ${v.maxSelections} option(s)`;
  }
  return null;
}

// ── Consent ─────────────────────────────────────────────────────────────

function validateConsent(value: string, field: FormField): string | null {
  if (field.required && !["true", "yes", "1", "on"].includes(value.toLowerCase())) {
    return "You must agree to continue";
  }
  return null;
}

// ── File Upload ─────────────────────────────────────────────────────────

function validateFile(value: string, v: ValidationRules): string | null {
  const allowedTypes = v.allowedTypes || [];
  if (allowedTypes.length === 0 || !value) return null;

  const ext = value.includes(".") ? value.split(".").pop()?.toLowerCase() || "" : "";
  if (!ext) return null;

  const mimeExtMap: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/msword": "doc",
    "text/csv": "csv",
  };

  let valid = false;
  for (const allowed of allowedTypes) {
    if (allowed.includes("/")) {
      if (allowed.endsWith("/*")) { valid = true; break; }
      if (mimeExtMap[allowed] === ext) { valid = true; break; }
    } else {
      if (ext === allowed.toLowerCase().replace(/^\./, "")) { valid = true; break; }
    }
  }

  if (!valid) return `File type .${ext} is not allowed`;
  return null;
}

// =============================================================================
// CROSS-FIELD RULES
// =============================================================================

function validateCustomRules(
  rules: CustomRule[],
  value: string,
  allValues: Record<string, string>,
): string | null {
  for (const rule of rules) {
    const targetValue = (allValues[rule.field] || "").trim();

    switch (rule.type) {
      case "matches_field":
        if (value !== targetValue) return rule.message;
        break;
      case "different_from_field":
        if (value === targetValue) return rule.message;
        break;
      case "greater_than_field":
        if (!isNaN(Number(value)) && !isNaN(Number(targetValue)) && Number(value) <= Number(targetValue)) {
          return rule.message;
        }
        break;
      case "less_than_field":
        if (!isNaN(Number(value)) && !isNaN(Number(targetValue)) && Number(value) >= Number(targetValue)) {
          return rule.message;
        }
        break;
    }
  }
  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

function parseDate(val: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
