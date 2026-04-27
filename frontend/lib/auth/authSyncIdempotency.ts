import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function generateAuthSyncIdempotencyKey(params: {
  firebaseUid: string;
  product: string;
  allowCreate: boolean;
  tokenIat: number;
}): string {
  const { firebaseUid, product, allowCreate, tokenIat } = params;

  const components = [firebaseUid, product, allowCreate ? "1" : "0", String(tokenIat)].join(
    ":",
  );

  const hash = createHash("sha256").update(components).digest("hex").slice(0, 32);
  return `as_${hash}`;
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

