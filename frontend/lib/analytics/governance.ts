/**
 * Schema Governance - FAANG Level
 * ================================
 *
 * Production-grade event schema versioning and evolution.
 *
 * This ensures:
 *   - Backward compatibility when evolving events
 *   - Schema migration without breaking historical data
 *   - Clear migration paths for event changes
 *   - Type safety across client + server + warehouse
 *
 * Versioning Strategy:
 *   schema_version: Global schema format (e.g., "2026-04")
 *   event_version: Per-event version (e.g., "v1", "v2")
 *
 * Migration Path:
 *   v1 → v2 (additive) → v3 (additive) → deprecated
 *
 * @see https://engineering.fb.com/2020/10/15/data-infrastructure/schemas-at-scale/
 */

import { isDebugMode } from "./config";

export const CURRENT_SCHEMA_VERSION = "2026-04";
export const SCHEMA_EPOCH = "2026-01-01";

// =============================================================================
// VERSION TYPES
// =============================================================================

/**
 * Schema version format: YYYY-MM
 */
export type SchemaVersion = `${number}-${number}`;

/**
 * Event version format: v{number}
 */
export type EventVersion = `v${number}`;

/**
 * Migration direction.
 */
export type MigrationDirection = "up" | "down";

/**
 * Migration function type.
 */
type MigrationFn = (event: Record<string, unknown>) => Record<string, unknown>;

// =============================================================================
// EVENT VERSION REGISTRY
// =============================================================================

/**
 * Registry of all event versions and their migrations.
 * Maps event name → version → migration function.
 */
const EVENT_MIGRATIONS: Map<string, Map<EventVersion, MigrationFn>> = new Map();

/**
 * Event version metadata.
 */
interface EventVersionMeta {
  version: EventVersion;
  created: string;
  deprecated?: string;
  migrationFrom?: EventVersion;
  description: string;
}

/**
 * All event versions.
 */
const EVENT_VERSIONS: Map<string, EventVersionMeta[]> = new Map([
  ["purchase", [
    { version: "v1", created: "2026-01-01", description: "Initial purchase event" },
    { version: "v2", created: "2026-03-15", migrationFrom: "v1", description: "Added subscription_id field" },
  ]],
  ["signup", [
    { version: "v1", created: "2026-01-01", description: "Initial signup event" },
    { version: "v2", created: "2026-02-01", migrationFrom: "v1", description: "Added domain field" },
  ]],
  ["add_to_cart", [
    { version: "v1", created: "2026-01-01", description: "Initial add to cart" },
  ]],
  ["begin_checkout", [
    { version: "v1", created: "2026-01-01", description: "Initial checkout" },
  ]],
]);

// =============================================================================
// VERSION MANAGEMENT
// =============================================================================

/**
 * Get current schema version.
 */
export function getSchemaVersion(): SchemaVersion {
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Get latest version for an event.
 */
export function getLatestEventVersion(eventName: string): EventVersion {
  const versions = EVENT_VERSIONS.get(eventName);
  if (!versions || versions.length === 0) {
    return "v1"; // Default to v1
  }
  return versions[versions.length - 1].version;
}

/**
 * Get all versions for an event.
 */
export function getEventVersions(eventName: string): EventVersionMeta[] {
  return EVENT_VERSIONS.get(eventName) || [];
}

/**
 * Check if event version is deprecated.
 */
export function isEventVersionDeprecated(
  eventName: string,
  version: EventVersion
): boolean {
  const versions = EVENT_VERSIONS.get(eventName);
  if (!versions) return false;

  const meta = versions.find((v) => v.version === version);
  return !!meta?.deprecated;
}

// =============================================================================
// MIGRATION ENGINE
// =============================================================================

/**
 * Migrate event to target version.
 *
 * @param eventName - The event name
 * @param eventData - The event data
 * @param fromVersion - Current version (e.g., "v1")
 * @param toVersion - Target version (e.g., "v2")
 *
 * @returns Migrated event data
 */
export function migrateEvent(
  eventName: string,
  eventData: Record<string, unknown>,
  fromVersion: EventVersion,
  toVersion: EventVersion
): Record<string, unknown> {
  // Same version - no migration needed
  if (fromVersion === toVersion) {
    return eventData;
  }

  // Find migration path
  const migrations = EVENT_MIGRATIONS.get(eventName);
  if (!migrations) {
    if (isDebugMode()) {
      console.warn(
        `%c[Schema] No migrations found for ${eventName}, skipping`,
        "color: #F59E0B;"
      );
    }
    return eventData;
  }

  // Apply migrations sequentially
  let currentData = { ...eventData };
  let currentVersion = fromVersion;

  while (currentVersion !== toVersion) {
    const migrationFn = migrations.get(currentVersion);
    if (!migrationFn) {
      if (isDebugMode()) {
        console.warn(
          `%c[Schema] No migration from ${currentVersion}`,
          "color: #F59E0B;"
        );
      }
      break;
    }

    currentData = migrationFn(currentData);
    currentVersion = getNextVersion(currentVersion);

    if (isDebugMode()) {
      console.log(
        `%c[Schema] Migrated ${eventName}: ${fromVersion} → ${currentVersion}`,
        "color: #10B981;"
      );
    }
  }

  return currentData;
}

/**
 * Get next version in sequence.
 */
function getNextVersion(version: EventVersion): EventVersion {
  const num = parseInt(version.slice(1), 10);
  return `v${num + 1}` as EventVersion;
}

// =============================================================================
// BUILT-IN MIGRATIONS
// =============================================================================

// Purchase event migrations
registerMigration("purchase", "v1", (event) => ({
  ...event,
  // Add default for new field
  subscription_id: event.subscription_id || null,
  // Add schema metadata
  _migrated_from: "v1",
  _migrated_at: Date.now(),
}));

registerMigration("purchase", "v2", (event) => ({
  ...event,
  // Ensure subscription_id is present for v2
  subscription_id: event.subscription_id || generateSubscriptionId(),
  _migrated_from: "v2",
  _migrated_at: Date.now(),
}));

// Signup event migrations
registerMigration("signup", "v1", (event) => ({
  ...event,
  domain: event.domain || "main",
  _migrated_from: "v1",
  _migrated_at: Date.now(),
}));

registerMigration("signup", "v2", (event) => ({
  ...event,
  // v2 adds domain field
  domain: event.domain || extractDomainFromReferrer(event.referrer),
  _migrated_from: "v2",
  _migrated_at: Date.now(),
}));

/**
 * Register a migration function.
 */
function registerMigration(
  eventName: string,
  fromVersion: EventVersion,
  migrationFn: MigrationFn
): void {
  if (!EVENT_MIGRATIONS.has(eventName)) {
    EVENT_MIGRATIONS.set(eventName, new Map());
  }
  EVENT_MIGRATIONS.get(eventName)!.set(fromVersion, migrationFn);
}

function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractDomainFromReferrer(referrer: unknown): string {
  if (!referrer || typeof referrer !== "string") return "main";
  if (referrer.includes("shop")) return "shop";
  if (referrer.includes("marketing")) return "marketing";
  return "main";
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate event against schema.
 * Returns validation errors or null if valid.
 */
export function validateEventSchema(
  eventName: string,
  version: EventVersion,
  eventData: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields for each event version
  const requiredFields = getRequiredFields(eventName, version);

  for (const field of requiredFields) {
    if (!(field in eventData) || eventData[field] === undefined || eventData[field] === null) {
      errors.push({
        field,
        message: `Required field "${field}" is missing or null`,
        severity: "error",
      });
    }
  }

  // Check data types
  const typeErrors = validateFieldTypes(eventName, version, eventData);
  errors.push(...typeErrors);

  return errors;
}

/**
 * Get required fields for event version.
 */
function getRequiredFields(eventName: string, version: EventVersion): string[] {
  const base: Record<string, string[]> = {
    purchase: ["transaction_id", "value", "currency", "items"],
    signup: ["method"],
    add_to_cart: ["value", "currency", "items"],
    begin_checkout: ["value", "currency", "items"],
    view_item: ["items"],
    page_view: ["page_path"],
  };

  return base[eventName] || [];
}

/**
 * Validate field types.
 */
function validateFieldTypes(
  eventName: string,
  version: EventVersion,
  eventData: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Type validators
  const typeValidators: Record<string, (value: unknown) => boolean> = {
    transaction_id: (v) => typeof v === "string" && v.length > 0,
    value: (v) => typeof v === "number" && v >= 0,
    currency: (v) => typeof v === "string" && v.length === 3,
    items: (v) => Array.isArray(v) && v.length > 0,
    method: (v) => ["email", "google", "facebook", "whatsapp"].includes(v as string),
  };

  for (const [field, validator] of Object.entries(typeValidators)) {
    if (field in eventData && !validator(eventData[field])) {
      errors.push({
        field,
        message: `Field "${field}" has invalid type or value`,
        severity: "error",
      });
    }
  }

  return errors;
}

interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

// =============================================================================
// SCHEMA EXPORT
// =============================================================================

/**
 * Get schema manifest - all events and their versions.
 * Useful for documentation and code generation.
 */
export function getSchemaManifest(): SchemaManifest {
  const events: Record<string, EventVersionMeta[]> = {};

  for (const [eventName, versions] of EVENT_VERSIONS) {
    events[eventName] = versions;
  }

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    schema_epoch: SCHEMA_EPOCH,
    generated_at: new Date().toISOString(),
    events,
  };
}

export interface SchemaManifest {
  schema_version: SchemaVersion;
  schema_epoch: string;
  generated_at: string;
  events: Record<string, EventVersionMeta[]>;
}

// =============================================================================
// ENRICHMENT
// =============================================================================

/**
 * Enrich event with schema metadata.
 * Adds version info automatically.
 */
export function enrichWithSchema(
  eventName: string,
  eventData: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...eventData,
    schema_version: CURRENT_SCHEMA_VERSION,
    event_version: getLatestEventVersion(eventName),
    event_timestamp: eventData.event_timestamp || new Date().toISOString(),
  };
}

/**
 * Get schema metadata for an event.
 */
export function getSchemaMetadata(eventName: string) {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    event_version: getLatestEventVersion(eventName),
    available_versions: getEventVersions(eventName),
    is_deprecated: isEventVersionDeprecated(eventName, getLatestEventVersion(eventName)),
  };
}