/**
 * Data Warehouse Schema - BigQuery Export Ready
 * ===============================================
 *
 * FAANG-level schema design for BigQuery export.
 * This ensures events are export-ready with proper:
 *   - Partitioning keys
 *   - Clustering columns
 *   - Nested structures
 *   - Data types
 *
 * Schema follows GA4 export format + Flowauxi custom fields.
 *
 * @see https://support.google.com/analytics/10148751
 * @see https://cloud.google.com/bigquery/docs/reference/standard-sql/data-types
 */

export const WAREHOUSE_SCHEMA_VERSION = "2026-04-01";

export const WAREHOUSE_CONFIG = {
  dataset: "flowauxi_analytics",
  table: "events",
  partition: {
    field: "event_timestamp",
    type: "DAY",
  },
  clustering: ["event_name", "domain"],
  expirationDays: 365 * 3, // 3 years
} as const;

// =============================================================================
// EXPORT SCHEMA - BigQuery Compatible
// =============================================================================

/**
 * BigQuery-compatible event schema.
 * All fields use proper BigQuery types.
 */
export interface WarehouseEvent {
  // === GA4 Standard Fields ===
  event_date: string; // YYYYMMDD
  event_timestamp: string; // ISO 8601
  event_name: string;
  event_params: ParamStruct[];
  event_previous_timestamp: string | null;
  event_value_in_usd: number | null;

  // === User Fields ===
  user_id: string | null;
  user_pseudo_id: string;

  // === Device Fields ===
  device: DeviceInfo;

  // === Geo Fields ===
  geo: GeoInfo;

  // === App Info ===
  app_info: AppInfo;

  // === Traffic Fields ===
  traffic_source: TrafficSource;

  // === Stream Fields ===
  stream_id: string;
  platform: string;

  // === Flowauxi Custom Fields ===
  flowauxi: FlowauxiMetadata;

  // === Schema Governance ===
  schema_version: string;
  event_version: string;
  trace_id: string;
}

/**
 * Device information structure.
 */
export interface DeviceInfo {
  category: string; // mobile, desktop, tablet
  mobile_brand_name: string | null;
  mobile_model_name: string | null;
  mobile_marketing_name: string | null;
  mobile_os_hardware_model: string | null;
  operating_system: string | null;
  operating_system_version: string | null;
  language: string | null;
  is_limited_ad_tracking: boolean;
  time_zone_offset_seconds: number;
}

/**
 * Geographic information.
 */
export interface GeoInfo {
  city: string | null;
  country: string | null;
  region: string | null;
  sub_continent: string | null;
  continent: string | null;
}

/**
 * App information.
 */
export interface AppInfo {
  id: string | null;
  name: string | null;
  version: string | null;
  installer_id: string | null;
}

/**
 * Traffic source information.
 */
export interface TrafficSource {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

/**
 * Flowauxi-specific metadata.
 * Custom fields beyond GA4 standard.
 */
export interface FlowauxiMetadata {
  domain: string; // main, shop, marketing, etc.
  subdomain: string;
  user_type: "new" | "returning" | "authenticated";
  plan: string | null; // free, pro, enterprise
  signup_method: string | null; // email, google, facebook
  session_id: string;
  page_view_count: number;
  session_duration_ms: number;
  referrer_type: "internal" | "external" | "direct" | "organic" | "paid";
  consent_status: {
    analytics: boolean;
    marketing: boolean;
  };
  client_id_source: "cookie" | "generated" | "server";
}

/**
 * Event parameters as structured array (BigQuery compatible).
 */
export interface ParamStruct {
  key: string;
  value: {
    string_value: string | null;
    int_value: number | null;
    float_value: number | null;
    double_value: number | null;
  };
}

// =============================================================================
// TRANSFORMERS - Client → Warehouse Format
// =============================================================================

/**
 * Transform analytics event to warehouse format.
 * Adds BigQuery-specific fields.
 */
export function transformToWarehouseFormat(
  event: WarehouseEventInput
): WarehouseEvent {
  const now = new Date();

  return {
    // GA4 Standard
    event_date: formatDate(now),
    event_timestamp: now.toISOString(),
    event_name: event.eventName,
    event_params: transformParams(event.params),
    event_previous_timestamp: null,
    event_value_in_usd: event.valueInUsd ?? null,

    // User
    user_id: event.userId ?? null,
    user_pseudo_id: event.clientId,

    // Device
    device: {
      category: event.device?.category ?? "desktop",
      mobile_brand_name: event.device?.mobile_brand_name ?? null,
      mobile_model_name: event.device?.mobile_model_name ?? null,
      mobile_marketing_name: null,
      mobile_os_hardware_model: null,
      operating_system: event.device?.operating_system ?? null,
      operating_system_version: event.device?.operating_system_version ?? null,
      language: event.device?.language ?? "en",
      is_limited_ad_tracking: false,
      time_zone_offset_seconds: event.device?.time_zone_offset_seconds ?? 0,
    },

    // Geo
    geo: {
      city: event.geo?.city ?? null,
      country: event.geo?.country ?? null,
      region: event.geo?.region ?? null,
      sub_continent: event.geo?.sub_continent ?? null,
      continent: event.geo?.continent ?? null,
    },

    // App
    app_info: {
      id: event.app?.id ?? null,
      name: event.app?.name ?? null,
      version: event.app?.version ?? null,
      installer_id: null,
    },

    // Traffic
    traffic_source: {
      source: event.traffic?.source ?? null,
      medium: event.traffic?.medium ?? null,
      campaign: event.traffic?.campaign ?? null,
      term: event.traffic?.term ?? null,
      content: event.traffic?.content ?? null,
    },

    // Stream
    stream_id: event.streamId ?? "G-F02P5002S8",
    platform: event.platform ?? "WEB",

    // Flowauxi Custom
    flowauxi: {
      domain: event.flowauxi?.domain ?? "main",
      subdomain: event.flowauxi?.subdomain ?? "",
      user_type: event.flowauxi?.user_type ?? "new",
      plan: event.flowauxi?.plan ?? null,
      signup_method: event.flowauxi?.signup_method ?? null,
      session_id: event.flowauxi?.session_id ?? generateSessionId(),
      page_view_count: event.flowauxi?.page_view_count ?? 0,
      session_duration_ms: event.flowauxi?.session_duration_ms ?? 0,
      referrer_type: event.flowauxi?.referrer_type ?? "direct",
      consent_status: {
        analytics: event.flowauxi?.consent_status?.analytics ?? false,
        marketing: event.flowauxi?.consent_status?.marketing ?? false,
      },
      client_id_source: event.flowauxi?.client_id_source ?? "cookie",
    },

    // Schema Governance
    schema_version: WAREHOUSE_SCHEMA_VERSION,
    event_version: event.eventVersion ?? "v1",
    trace_id: event.traceId,
  };
}

/**
 * Transform event params to BigQuery struct format.
 */
function transformParams(
  params: Record<string, unknown> | undefined
): ParamStruct[] {
  if (!params) return [];

  return Object.entries(params).map(([key, value]) => {
    const transformedValue = transformParamValue(value);
    return {
      key,
      value: transformedValue,
    };
  });
}

/**
 * Transform single param value to BigQuery union type.
 */
function transformParamValue(
  value: unknown
): ParamStruct["value"] {
  if (value === null || value === undefined) {
    return { string_value: null, int_value: null, float_value: null, double_value: null };
  }

  if (typeof value === "string") {
    return { string_value: value, int_value: null, float_value: null, double_value: null };
  }

  if (Number.isInteger(value)) {
    return { string_value: null, int_value: value as number, float_value: null, double_value: null };
  }

  if (typeof value === "number") {
    return { string_value: null, int_value: null, float_value: null, double_value: value };
  }

  if (typeof value === "boolean") {
    return { string_value: null, int_value: value ? 1 : 0, float_value: null, double_value: null };
  }

  // Default to string for complex types
  return { string_value: JSON.stringify(value), int_value: null, float_value: null, double_value: null };
}

// =============================================================================
// UTILITIES
// =============================================================================

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface WarehouseEventInput {
  eventName: string;
  params?: Record<string, unknown>;
  clientId: string;
  userId?: string | null;
  valueInUsd?: number | null;
  device?: Partial<DeviceInfo>;
  geo?: Partial<GeoInfo>;
  app?: Partial<AppInfo>;
  traffic?: Partial<TrafficSource>;
  streamId?: string;
  platform?: string;
  flowauxi?: Partial<FlowauxiMetadata>;
  eventVersion?: string;
  traceId: string;
}

// =============================================================================
// BIGQUERY SCHEMA EXPORT (for terraform/dbt)
// =============================================================================

/**
 * Generate BigQuery table schema as JSON.
 * Can be used with Terraform or dbt.
 */
export function getBigQuerySchema(): object {
  return {
    fields: [
      { name: "event_date", type: "STRING", mode: "REQUIRED", description: "YYYYMMDD" },
      { name: "event_timestamp", type: "TIMESTAMP", mode: "REQUIRED" },
      { name: "event_name", type: "STRING", mode: "REQUIRED" },
      { name: "event_params", type: "RECORD", mode: "REPEATED", fields: [
        { name: "key", type: "STRING" },
        { name: "value", type: "RECORD", fields: [
          { name: "string_value", type: "STRING" },
          { name: "int_value", type: "INT64" },
          { name: "float_value", type: "FLOAT" },
          { name: "double_value", type: "FLOAT" },
        ]},
      ]},
      { name: "event_previous_timestamp", type: "TIMESTAMP" },
      { name: "event_value_in_usd", type: "FLOAT" },
      { name: "user_id", type: "STRING" },
      { name: "user_pseudo_id", type: "STRING", mode: "REQUIRED" },
      { name: "device", type: "RECORD", fields: [
        { name: "category", type: "STRING" },
        { name: "mobile_brand_name", type: "STRING" },
        { name: "mobile_model_name", type: "STRING" },
        { name: "operating_system", type: "STRING" },
        { name: "operating_system_version", type: "STRING" },
        { name: "language", type: "STRING" },
      ]},
      { name: "geo", type: "RECORD", fields: [
        { name: "city", type: "STRING" },
        { name: "country", type: "STRING" },
        { name: "region", type: "STRING" },
      ]},
      { name: "traffic_source", type: "RECORD", fields: [
        { name: "source", type: "STRING" },
        { name: "medium", type: "STRING" },
        { name: "campaign", type: "STRING" },
      ]},
      { name: "flowauxi", type: "RECORD", fields: [
        { name: "domain", type: "STRING" },
        { name: "subdomain", type: "STRING" },
        { name: "user_type", type: "STRING" },
        { name: "plan", type: "STRING" },
        { name: "session_id", type: "STRING" },
      ]},
      { name: "schema_version", type: "STRING" },
      { name: "event_version", type: "STRING" },
      { name: "trace_id", type: "STRING" },
    ],
  };
}