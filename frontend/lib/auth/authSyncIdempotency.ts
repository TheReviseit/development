import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function generateAuthSyncIdempotencyKey(params: {
  firebaseUid: string;
  product: string;
  allowCreate: boolean;
  tokenIat: number;
}): string {
  const { firebaseUid, product, allowCreate, tokenIat } = params;

  const components = ["v3", firebaseUid, product, allowCreate ? "1" : "0", String(tokenIat)].join(
    ":",
  );

  const hash = createHash("sha256").update(components).digest("hex").slice(0, 32);
  return `as_${hash}`;
}

export function generateAuthSyncWarmCacheKey(params: {
  firebaseUid: string;
  product: string;
  allowCreate: boolean;
}): string {
  const { firebaseUid, product, allowCreate } = params;
  const components = ["warm", firebaseUid, product, allowCreate ? "1" : "0"].join(":");
  const hash = createHash("sha256").update(components).digest("hex").slice(0, 32);
  return `asw_${hash}`;
}

export async function getAuthSyncWarmCache(params: {
  supabase: SupabaseClient;
  cacheKey: string;
}): Promise<{ statusCode: number; responseBody: any } | null> {
  const { supabase, cacheKey } = params;
  const { data, error } = await supabase.rpc("auth_sync_warm_get", {
    p_cache_key: cacheKey,
  });
  if (error) {
    if (isMissingAuthSyncWarmRpc(error, "auth_sync_warm_get")) {
      return null;
    }
    console.warn("[AUTH_SYNC] Warm cache lookup failed (non-fatal):", error);
    return null;
  }
  if (!data?.status_code) return null;
  return {
    statusCode: Number(data.status_code),
    responseBody: data.response_body,
  };
}

export async function putAuthSyncWarmCache(params: {
  supabase: SupabaseClient;
  cacheKey: string;
  statusCode: number;
  responseBody: any;
  ttlSeconds?: number;
}): Promise<void> {
  const { supabase, cacheKey, statusCode, responseBody, ttlSeconds = 60 } = params;
  const { error } = await supabase.rpc("auth_sync_warm_put", {
    p_cache_key: cacheKey,
    p_response_body: responseBody,
    p_status_code: statusCode,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    if (isMissingAuthSyncWarmRpc(error, "auth_sync_warm_put")) {
      return;
    }
    throw error;
  }
}

export function isMissingAuthSyncWarmRpc(error: unknown, rpcName: string): boolean {
  const msg = String((error as { message?: string })?.message || error);
  const code = (error as { code?: string })?.code;
  return (
    code === "PGRST202" ||
    msg.includes("Could not find the function") ||
    msg.includes("schema cache") ||
    (msg.includes(rpcName) &&
      (msg.includes("does not exist") || msg.includes("Could not find")))
  );
}

export type AuthSyncIdempotencyRow =
  | {
      claimed: boolean;
      status: "processing" | "completed" | "failed";
      response_body: any | null;
      status_code: number | null;
      error_code: string | null;
      expires_at: string | null;
      locked_by: string | null;
    }
  | null;

export async function claimAuthSyncIdempotency(params: {
  supabase: SupabaseClient;
  idempotencyKey: string;
  lockedBy: string;
  ttlSeconds: number;
}): Promise<AuthSyncIdempotencyRow> {
  const { supabase, idempotencyKey, lockedBy, ttlSeconds } = params;
  const { data, error } = await supabase.rpc("auth_sync_claim", {
    p_idempotency_key: idempotencyKey,
    p_locked_by: lockedBy,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return data as AuthSyncIdempotencyRow;
}

export async function claimAuthSyncIdempotencySafe(params: {
  supabase: SupabaseClient;
  idempotencyKey: string;
  lockedBy: string;
  ttlSeconds: number;
}): Promise<
  | { ok: true; claim: NonNullable<AuthSyncIdempotencyRow> }
  | { ok: false; timeout: true }
  | { ok: false; timeout: false; error: unknown }
> {
  try {
    const claim = await claimAuthSyncIdempotency(params);
    if (!claim) {
      return { ok: false, timeout: false, error: new Error("IDEMPOTENCY_NULL") };
    }
    return { ok: true, claim };
  } catch (error) {
    const msg = String((error as Error)?.message || error);
    if (
      msg.includes("AbortError") ||
      msg.includes("aborted") ||
      msg.includes("timeout") ||
      msg.includes("TIMEOUT")
    ) {
      return { ok: false, timeout: true };
    }
    return { ok: false, timeout: false, error };
  }
}

export async function getAuthSyncIdempotency(params: {
  supabase: SupabaseClient;
  idempotencyKey: string;
}): Promise<
  | {
      status: "processing" | "completed" | "failed";
      response_body: any | null;
      status_code: number | null;
      error_code: string | null;
      expires_at: string | null;
      locked_by: string | null;
    }
  | null
> {
  const { supabase, idempotencyKey } = params;
  const { data, error } = await supabase.rpc("auth_sync_get", {
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data as any;
}

export async function completeAuthSyncIdempotency(params: {
  supabase: SupabaseClient;
  idempotencyKey: string;
  lockedBy: string;
  status: "completed" | "failed";
  statusCode: number;
  responseBody: any;
  errorCode?: string | null;
}): Promise<boolean> {
  const { supabase, idempotencyKey, lockedBy, status, statusCode, responseBody, errorCode } =
    params;

  const { data, error } = await supabase.rpc("auth_sync_complete", {
    p_idempotency_key: idempotencyKey,
    p_locked_by: lockedBy,
    p_status: status,
    p_response_body: responseBody,
    p_status_code: statusCode,
    p_error_code: errorCode ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function releaseAuthSyncIdempotency(params: {
  supabase: SupabaseClient;
  idempotencyKey: string;
  lockedBy: string;
}): Promise<boolean> {
  const { supabase, idempotencyKey, lockedBy } = params;

  const { data, error } = await supabase.rpc("auth_sync_release", {
    p_idempotency_key: idempotencyKey,
    p_locked_by: lockedBy,
  });
  if (error) {
    const { count, error: deleteError } = await supabase
      .from("auth_sync_idempotency")
      .delete({ count: "exact" })
      .eq("idempotency_key", idempotencyKey)
      .eq("locked_by", lockedBy)
      .eq("status", "processing");

    if (deleteError) throw error;
    return (count ?? 0) > 0;
  }
  return Boolean(data);
}

export async function waitForAuthSyncCompletion(params: {
  supabase: SupabaseClient;
  idempotencyKey: string;
  timeoutMs: number;
  pollMs: number;
}): Promise<
  | { done: true; responseBody: any; statusCode: number; errorCode?: string | null }
  | { done: false }
> {
  const { supabase, idempotencyKey, timeoutMs, pollMs } = params;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const row = await getAuthSyncIdempotency({ supabase, idempotencyKey });
    if (!row) return { done: false };
    // Resolve on both 'completed' and 'failed' — the owner stored its
    // final response, so return it to the follower instead of spinning.
    if ((row.status === "completed" || row.status === "failed") && row.status_code != null) {
      return {
        done: true,
        responseBody: row.response_body,
        statusCode: row.status_code,
        errorCode: row.error_code,
      };
    }
  }

  return { done: false };
}
