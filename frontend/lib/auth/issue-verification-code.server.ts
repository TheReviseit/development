import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  generateVerificationCode,
  hashVerificationCode,
  verificationExpiresAt,
} from "@/lib/auth/verification-code";

const ISSUE_CODE_TIMEOUT_MS = 5000;

export type IssuedVerificationCode = {
  code: string;
  expiresAt: Date;
  path: "rpc" | "legacy";
};

function isMissingRpcError(error: unknown, rpcName: string): boolean {
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

function isRetryableIssueFailure(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error);
  return (
    isMissingRpcError(error, "issue_verification_code") ||
    msg.includes("ISSUE_VERIFICATION_CODE_TIMEOUT") ||
    msg.includes("AbortError") ||
    msg.includes("aborted") ||
    msg.includes("timeout")
  );
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const msg = String((error as { message?: string })?.message || error);
  return msg.includes(column) && (msg.includes("column") || msg.includes("Could not find"));
}

async function legacyIssueVerificationCode(params: {
  supabase: SupabaseClient;
  userId: string;
  code: string;
  expiresAt: Date;
  codeHash: string | null;
  hashVersion: number | null;
}): Promise<void> {
  const { supabase, userId, code, expiresAt, codeHash, hashVersion } = params;

  const { error: invalidateError } = await supabase
    .from("verification_codes")
    .update({ verified: true })
    .eq("user_id", userId)
    .eq("verified", false);

  if (invalidateError) {
    throw invalidateError;
  }

  const withHash = {
    user_id: userId,
    code,
    code_hash: codeHash,
    hash_version: hashVersion,
    expires_at: expiresAt.toISOString(),
    verified: false,
    attempts: 0,
  };

  const { error: insertWithHashError } = await supabase
    .from("verification_codes")
    .insert(withHash);

  if (!insertWithHashError) {
    return;
  }

  if (
    codeHash != null &&
    (isMissingColumnError(insertWithHashError, "code_hash") ||
      isMissingColumnError(insertWithHashError, "hash_version"))
  ) {
    const { error: insertPlainError } = await supabase.from("verification_codes").insert({
      user_id: userId,
      code,
      expires_at: expiresAt.toISOString(),
      verified: false,
      attempts: 0,
    });
    if (insertPlainError) {
      throw insertPlainError;
    }
    return;
  }

  throw insertWithHashError;
}

async function rpcIssueVerificationCode(params: {
  supabase: SupabaseClient;
  userId: string;
  code: string;
  expiresAt: Date;
  codeHash: string | null;
  hashVersion: number | null;
}): Promise<void> {
  const { supabase, userId, code, expiresAt, codeHash, hashVersion } = params;

  const rpcPromise = supabase.rpc("issue_verification_code", {
    p_user_id: userId,
    p_code: code,
    p_code_hash: codeHash,
    p_hash_version: hashVersion,
    p_expires_at: expiresAt.toISOString(),
  }) as unknown as Promise<{ error: { message?: string; code?: string } | null }>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("ISSUE_VERIFICATION_CODE_TIMEOUT")), ISSUE_CODE_TIMEOUT_MS);
  });

  const { error } = await Promise.race([rpcPromise, timeoutPromise]);
  if (error) {
    throw error;
  }
}

/**
 * Issue a verification OTP, preferring the transactional RPC when deployed.
 * Falls back to legacy invalidate+insert when RPC is missing, slow, or errors.
 */
export async function issueVerificationCodeForUser(params: {
  userId: string;
  timeoutMs?: number;
}): Promise<IssuedVerificationCode> {
  const code = generateVerificationCode();
  const expiresAt = verificationExpiresAt();
  const hashed = hashVerificationCode(code);
  const supabase = getSupabaseServiceClient({
    timeoutMs: params.timeoutMs ?? ISSUE_CODE_TIMEOUT_MS,
  });

  const useRpc = process.env.USE_ISSUE_VERIFICATION_RPC !== "false";

  if (useRpc) {
    try {
      await rpcIssueVerificationCode({
        supabase,
        userId: params.userId,
        code,
        expiresAt,
        codeHash: hashed?.codeHash ?? null,
        hashVersion: hashed?.hashVersion ?? null,
      });
      return { code, expiresAt, path: "rpc" };
    } catch (error) {
      if (!isRetryableIssueFailure(error)) {
        throw error;
      }
      console.warn("[issue-verification-code] RPC unavailable; using legacy path:", {
        userIdSuffix: params.userId.slice(-6),
        reason: String((error as Error)?.message || error),
      });
    }
  }

  await legacyIssueVerificationCode({
    supabase,
    userId: params.userId,
    code,
    expiresAt,
    codeHash: hashed?.codeHash ?? null,
    hashVersion: hashed?.hashVersion ?? null,
  });

  return { code, expiresAt, path: "legacy" };
}
