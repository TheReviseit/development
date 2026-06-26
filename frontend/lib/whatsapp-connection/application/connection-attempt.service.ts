import type {
  AuthenticatedConnectionContext,
  CreateAttemptInput,
  CreateAttemptResult,
  EmbeddedSignupFinalizeInput,
  FinalizeConnectionResult,
} from "../domain/types";
import { WhatsAppConnectionRepository, buildResourceKeys } from "../infra/whatsapp-connection.repository";
import { ConnectionLockManager } from "../infra/redis-lock-manager";
import { MetaCloudConnectionProvider } from "../infra/meta-cloud.provider";
import { WhatsAppValidationEngine } from "./validation-engine";
import { verifyAttemptToken } from "../security/attempt-token";
import { WhatsAppConnectionError } from "../domain/errors";

function hasCompleteEmbeddedSetup(
  input: EmbeddedSignupFinalizeInput & { redirectUri?: string | null },
): boolean {
  const setupData = input.setupData || {};
  const messageData = input.messageEventData || {};
  const wabaId = setupData.wabaId || setupData.waba_id || messageData.waba_id;
  const phoneNumberId =
    setupData.phoneNumberId ||
    setupData.phone_number_id ||
    messageData.phone_number_id;
  return Boolean(wabaId && phoneNumberId);
}

export class ConnectionAttemptService {
  constructor(
    private readonly repository = new WhatsAppConnectionRepository(),
    private readonly metaProvider = new MetaCloudConnectionProvider(),
    private readonly validationEngine = new WhatsAppValidationEngine(),
    private readonly lockManager = new ConnectionLockManager(),
  ) {}

  async createAttempt(
    context: AuthenticatedConnectionContext,
    input: CreateAttemptInput,
  ): Promise<CreateAttemptResult> {
    return await this.repository.createAttempt(context.tenant, {
      ...input,
      productDomain: context.productDomain,
      requestContext: {
        ...input.requestContext,
        requestId: context.requestContext.requestId,
        ipAddress: context.requestContext.ipAddress,
        userAgent: context.requestContext.userAgent,
        origin: context.requestContext.origin,
      },
    });
  }

  async getAttemptStatus(context: AuthenticatedConnectionContext, attemptId: string) {
    const attempt = await this.repository.getAttempt(context.tenant, attemptId);
    if (!attempt) {
      throw new WhatsAppConnectionError("ATTEMPT_NOT_FOUND", "Connection attempt not found", 404);
    }

    return {
      attemptId: attempt.id,
      tenantId: attempt.tenant_id,
      state: attempt.state,
      expiresAt: attempt.expires_at,
      completedAt: attempt.completed_at,
      response: attempt.response_body,
      failureCode: attempt.failure_code,
      failureMessage: attempt.failure_message,
    };
  }

  async finalizeAttempt(params: {
    context: AuthenticatedConnectionContext;
    attemptId: string;
    attemptToken: string | null;
    idempotencyKey: string | null;
    input: EmbeddedSignupFinalizeInput & { redirectUri?: string | null };
  }): Promise<FinalizeConnectionResult> {
    const { context, attemptId } = params;
    verifyAttemptToken({
      token: params.attemptToken,
      tenant: context.tenant,
      attemptId,
    });

    const attempt = await this.repository.getAttempt(context.tenant, attemptId);
    if (!attempt) {
      throw new WhatsAppConnectionError("ATTEMPT_NOT_FOUND", "Connection attempt not found", 404);
    }

    if (attempt.state === "active" && attempt.response_body) {
      return attempt.response_body as FinalizeConnectionResult;
    }

    if (new Date(attempt.expires_at).getTime() < Date.now()) {
      await this.repository.transitionAttempt({
        tenant: context.tenant,
        attemptId,
        state: "expired",
        failureCode: "ATTEMPT_EXPIRED",
        failureMessage: "Connection attempt expired",
      });
      throw new WhatsAppConnectionError(
        "ATTEMPT_EXPIRED",
        "This connection attempt expired. Please start again.",
        410,
      );
    }

    const idempotencyKey = params.idempotencyKey || attempt.idempotency_key;
    const fastLane = hasCompleteEmbeddedSetup(params.input);

    await this.repository.transitionAttempt({
      tenant: context.tenant,
      attemptId,
      state: "validating",
    });

    const meta = await this.metaProvider.validateEmbeddedSignup({
      input: params.input,
      origin: context.requestContext.origin,
    });

    if (!fastLane) {
      await this.repository.transitionAttempt({
        tenant: context.tenant,
        attemptId,
        state: "meta_authorized",
        validationResult: {
          permissions: meta.permissions,
          wabaId: meta.wabaId,
          phoneNumberId: meta.phoneNumberId,
        },
      });
    }

    const resourceKeys = buildResourceKeys({
      tenantId: context.tenant.tenantId,
      wabaId: meta.wabaId,
      phoneNumberId: meta.phoneNumberId,
      normalizedE164: meta.normalizedE164,
    });

    return await this.lockManager.withLocks(resourceKeys, async () => {
      if (!fastLane) {
        await this.repository.transitionAttempt({
          tenant: context.tenant,
          attemptId,
          state: "locked",
        });
      }

      const decision = await this.validationEngine.evaluate({
        tenant: context.tenant,
        meta,
        request: context.requestContext,
      });

      if (!decision.allowed) {
        await this.repository.transitionAttempt({
          tenant: context.tenant,
          attemptId,
          state: decision.status === "conflict" ? "conflict" : "needs_user_action",
          failureCode: decision.code,
          failureMessage: decision.message,
        });

        return {
          success: false,
          code: decision.code,
          status: decision.status,
          message: decision.message,
        };
      }

      const conflict = await this.repository.findActiveResourceConflict(context.tenant, meta);
      if (conflict) {
        await this.repository.transitionAttempt({
          tenant: context.tenant,
          attemptId,
          state: "conflict",
          failureCode: conflict.code,
          failureMessage: conflict.message,
        });
        return conflict;
      }

      const activatedMeta = await this.metaProvider.activateConnection({
        meta,
        origin: context.requestContext.origin,
      });

      if (!fastLane) {
        await this.repository.transitionAttempt({
          tenant: context.tenant,
          attemptId,
          state: activatedMeta.webhookSubscribed ? "webhook_subscribed" : "ownership_checked",
          validationResult: {
            permissions: activatedMeta.permissions,
            warnings: activatedMeta.warnings,
            webhookSubscribed: activatedMeta.webhookSubscribed,
            phoneRegistered: activatedMeta.phoneRegistered,
          },
        });
      }

      return await this.repository.finalizeConnection({
        tenant: context.tenant,
        attemptId,
        meta: activatedMeta,
        idempotencyKey,
      });
    });
  }

  async finalizeEmbeddedSignupInOneStep(params: {
    context: AuthenticatedConnectionContext;
    input: EmbeddedSignupFinalizeInput & { redirectUri?: string | null };
    idempotencyKey?: string | null;
  }) {
    const setupData = params.input.setupData || {};
    const messageData = params.input.messageEventData || {};
    const wabaId = setupData.wabaId || setupData.waba_id || messageData.waba_id || null;
    const phoneNumberId =
      setupData.phoneNumberId ||
      setupData.phone_number_id ||
      messageData.phone_number_id ||
      null;
    const idempotencyKey =
      params.idempotencyKey ||
      `wa_legacy_${params.context.tenant.tenantId}_${wabaId || "pending"}_${phoneNumberId || "pending"}`;

    const attempt = await this.createAttempt(params.context, {
      idempotencyKey,
      wabaId,
      phoneNumberId,
      resourceKey: [wabaId ? `waba:${wabaId}` : null, phoneNumberId ? `phone-id:${phoneNumberId}` : null]
        .filter(Boolean)
        .join("|") || `tenant:${params.context.tenant.tenantId}`,
    });

    return await this.finalizeAttempt({
      context: params.context,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      idempotencyKey,
      input: params.input,
    });
  }
}
