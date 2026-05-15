import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  CreateAttemptInput,
  CreateAttemptResult,
  FinalizeConnectionResult,
  MetaValidationResult,
  TenantContext,
  WhatsAppConnectionState,
} from "../domain/types";
import { WhatsAppConnectionError } from "../domain/errors";
import { createAttemptToken, hashAttemptToken } from "../security/attempt-token";

export function normalizeWhatsAppPhone(input: string | null | undefined) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `${hasPlus ? "+" : "+"}${digits}`;
}

export function buildResourceKeys(params: {
  tenantId?: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  normalizedE164?: string | null;
}) {
  const keys = [];
  if (params.wabaId) keys.push(`waba:${params.wabaId}`);
  if (params.phoneNumberId) keys.push(`phone-id:${params.phoneNumberId}`);
  if (params.normalizedE164) keys.push(`phone:${params.normalizedE164}`);
  if (keys.length === 0 && params.tenantId) keys.push(`tenant:${params.tenantId}`);
  return keys;
}

export function buildResourceKey(params: {
  tenantId: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  normalizedE164?: string | null;
}) {
  return buildResourceKeys(params).join("|") || `tenant:${params.tenantId}`;
}

export class WhatsAppConnectionRepository {
  constructor(private readonly db: SupabaseClient = supabaseAdmin) {}

  async resolveTenant(params: {
    userId: string;
    firebaseUid: string;
    productDomain: string;
  }): Promise<Omit<TenantContext, "user">> {
    const { data, error } = await this.db.rpc("get_or_create_tenant_mapping", {
      p_user_id: params.userId,
      p_firebase_uid: params.firebaseUid,
      p_product_domain: params.productDomain,
    });

    if (error) {
      throw new WhatsAppConnectionError(
        "TENANT_RESOLUTION_FAILED",
        "Failed to resolve tenant mapping",
        503,
        { cause: error.message },
      );
    }

    const row = data as any;
    return {
      tenantId: row.tenantId,
      mappingId: row.mappingId,
      userId: row.userId,
      firebaseUid: row.firebaseUid,
      productDomain: row.productDomain,
    };
  }

  async createAttempt(
    tenant: TenantContext,
    input: CreateAttemptInput,
  ): Promise<CreateAttemptResult> {
    const attemptId = crypto.randomUUID();
    const resourceKey =
      input.resourceKey ||
      buildResourceKey({
        tenantId: tenant.tenantId,
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        normalizedE164: input.normalizedE164,
      });
    const idempotencyKey =
      input.idempotencyKey ||
      `wa_attempt_${tenant.tenantId}_${crypto.randomUUID().replaceAll("-", "")}`;
    const attemptToken = createAttemptToken({ tenant, attemptId });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const payload = {
      id: attemptId,
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
      firebase_uid: tenant.firebaseUid,
      product_domain: input.productDomain || tenant.productDomain,
      provider: input.provider || "meta_cloud_api",
      idempotency_key: idempotencyKey,
      resource_key: resourceKey,
      waba_id: input.wabaId || null,
      phone_number_id: input.phoneNumberId || null,
      normalized_e164: input.normalizedE164 || null,
      state: "initiated",
      attempt_token_hash: hashAttemptToken(attemptToken),
      request_context: input.requestContext || {},
      expires_at: expiresAt,
    };

    const { data, error } = await this.db
      .from("whatsapp_connection_attempts")
      .insert(payload)
      .select("id, tenant_id, expires_at, state")
      .single();

    if (error) {
      if (error.code === "23505") {
        const existing = await this.getAttemptByIdempotencyKey(tenant, idempotencyKey);
        if (existing) {
          const token = createAttemptToken({ tenant, attemptId: existing.id });
          return {
            attemptId: existing.id,
            attemptToken: token,
            tenantId: tenant.tenantId,
            expiresAt: existing.expires_at,
            state: existing.state as WhatsAppConnectionState,
          };
        }

        throw new WhatsAppConnectionError(
          "CONNECTION_IN_PROGRESS",
          "A WhatsApp connection is already in progress for this account or phone number.",
          423,
          { resourceKey },
        );
      }

      throw new WhatsAppConnectionError(
        "ATTEMPT_CREATE_FAILED",
        "Failed to create WhatsApp connection attempt",
        503,
        { cause: error.message },
      );
    }

    return {
      attemptId: data.id,
      attemptToken,
      tenantId: data.tenant_id,
      expiresAt: data.expires_at,
      state: data.state as WhatsAppConnectionState,
    };
  }

  async getAttempt(tenant: TenantContext, attemptId: string) {
    const { data, error } = await this.db
      .from("whatsapp_connection_attempts")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .eq("id", attemptId)
      .maybeSingle();

    if (error) {
      throw new WhatsAppConnectionError(
        "ATTEMPT_READ_FAILED",
        "Failed to read WhatsApp connection attempt",
        503,
        { cause: error.message },
      );
    }
    return data;
  }

  async getAttemptByIdempotencyKey(tenant: TenantContext, idempotencyKey: string) {
    const { data, error } = await this.db
      .from("whatsapp_connection_attempts")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) return null;
    return data;
  }

  async transitionAttempt(params: {
    tenant: TenantContext;
    attemptId: string;
    state: WhatsAppConnectionState;
    validationResult?: Record<string, unknown>;
    failureCode?: string;
    failureMessage?: string;
  }) {
    await this.db
      .from("whatsapp_connection_attempts")
      .update({
        state: params.state,
        validation_result: params.validationResult || {},
        failure_code: params.failureCode || null,
        failure_message: params.failureMessage || null,
      })
      .eq("tenant_id", params.tenant.tenantId)
      .eq("id", params.attemptId);
  }

  async logValidation(params: {
    tenant: TenantContext;
    attemptId?: string;
    checkName: string;
    outcome: "pass" | "fail" | "warn" | "skip";
    reason?: string;
    details?: Record<string, unknown>;
  }) {
    await this.db.from("whatsapp_validation_logs").insert({
      tenant_id: params.tenant.tenantId,
      user_id: params.tenant.userId,
      attempt_id: params.attemptId || null,
      check_name: params.checkName,
      outcome: params.outcome,
      reason: params.reason || null,
      details: params.details || {},
    });
  }

  async findActiveResourceConflict(tenant: TenantContext, meta: MetaValidationResult) {
    const activeStatuses = ["active", "pending", "reconnecting"];

    const canonicalChecks = [
      { column: "waba_id", value: meta.wabaId },
      { column: "phone_number_id", value: meta.phoneNumberId },
      { column: "normalized_e164", value: meta.normalizedE164 },
    ].filter((check) => Boolean(check.value));

    for (const check of canonicalChecks) {
      const { data, error } = await this.db
        .from("whatsapp_accounts")
        .select("id, tenant_id, status")
        .eq(check.column, check.value)
        .in("status", activeStatuses)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new WhatsAppConnectionError(
          "CONFLICT_CHECK_FAILED",
          "Failed to check existing WhatsApp ownership",
          503,
          { cause: error.message },
        );
      }

      if (data && data.tenant_id !== tenant.tenantId) {
        return {
          success: false,
          code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
          status: "conflict",
          message: "This WhatsApp Business account is already connected to another workspace.",
        } as FinalizeConnectionResult;
      }
    }

    const legacyWaba = await this.db
      .from("connected_whatsapp_accounts")
      .select("id, user_id")
      .eq("waba_id", meta.wabaId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (legacyWaba.error) {
      throw new WhatsAppConnectionError(
        "LEGACY_CONFLICT_CHECK_FAILED",
        "Failed to check existing WhatsApp ownership",
        503,
        { cause: legacyWaba.error.message },
      );
    }

    if (legacyWaba.data && legacyWaba.data.user_id !== tenant.userId) {
      return {
        success: false,
        code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
        status: "conflict",
        message: "This WhatsApp Business account is already connected to another workspace.",
      } as FinalizeConnectionResult;
    }

    const legacyPhone = await this.db
      .from("connected_phone_numbers")
      .select("id, user_id")
      .eq("phone_number_id", meta.phoneNumberId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (legacyPhone.error) {
      throw new WhatsAppConnectionError(
        "LEGACY_CONFLICT_CHECK_FAILED",
        "Failed to check existing WhatsApp ownership",
        503,
        { cause: legacyPhone.error.message },
      );
    }

    if (legacyPhone.data && legacyPhone.data.user_id !== tenant.userId) {
      return {
        success: false,
        code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
        status: "conflict",
        message: "This WhatsApp phone number is already connected to another workspace.",
      } as FinalizeConnectionResult;
    }

    return null;
  }

  async finalizeConnection(params: {
    tenant: TenantContext;
    attemptId: string;
    meta: MetaValidationResult;
    idempotencyKey: string;
  }): Promise<FinalizeConnectionResult> {
    const { data, error } = await this.db.rpc("finalize_whatsapp_connection", {
      p_tenant_id: params.tenant.tenantId,
      p_user_id: params.tenant.userId,
      p_attempt_id: params.attemptId,
      p_waba_id: params.meta.wabaId,
      p_phone_number_id: params.meta.phoneNumberId,
      p_normalized_e164: params.meta.normalizedE164,
      p_meta_payload: this.toMetaPayload(params.meta),
      p_idempotency_key: params.idempotencyKey,
    });

    if (error) {
      throw new WhatsAppConnectionError(
        "CONNECTION_FINALIZE_FAILED",
        "Failed to finalize WhatsApp connection",
        503,
        { cause: error.message },
      );
    }

    return data as FinalizeConnectionResult;
  }

  async disconnectAccount(params: {
    tenant: TenantContext;
    accountId: string;
    reason?: string;
  }) {
    const { data, error } = await this.db
      .from("whatsapp_accounts")
      .update({
        status: "disconnected",
        connection_error: params.reason || null,
        deleted_at: new Date().toISOString(),
      })
      .eq("tenant_id", params.tenant.tenantId)
      .eq("id", params.accountId)
      .select("id, status")
      .maybeSingle();

    if (error) {
      throw new WhatsAppConnectionError(
        "DISCONNECT_FAILED",
        "Failed to disconnect WhatsApp account",
        503,
        { cause: error.message },
      );
    }

    return data;
  }

  private toMetaPayload(meta: MetaValidationResult) {
    return {
      encryptedAccessToken: meta.encryptedAccessToken,
      tokenExpiresAt: meta.tokenExpiresAt,
      facebookUserId: meta.facebookUserId,
      facebookUserName: meta.facebookUserName,
      facebookEmail: meta.facebookEmail,
      permissions: meta.permissions,
      businessId: meta.businessId,
      businessName: meta.businessName,
      wabaName: meta.wabaName,
      displayPhoneNumber: meta.displayPhoneNumber,
      verifiedName: meta.verifiedName,
      accountReviewStatus: meta.accountReviewStatus,
      businessVerificationStatus: meta.businessVerificationStatus,
      qualityRating: meta.qualityRating,
      messagingLimitTier: meta.messagingLimitTier,
      codeVerificationStatus: meta.codeVerificationStatus,
      isOfficialBusinessAccount: meta.isOfficialBusinessAccount,
      platformType: meta.platformType,
      webhookSubscribed: meta.webhookSubscribed,
      phoneRegistered: meta.phoneRegistered,
      alreadyRegistered: meta.alreadyRegistered,
    };
  }
}
