import type {
  MetaValidationResult,
  RequestSecurityContext,
  TenantContext,
  ValidationDecision,
} from "../domain/types";
import { WhatsAppSecurityPolicy } from "../security/fraud-policy";
import { checkWhatsAppConnectionRateLimit } from "../security/rate-limit-policy";
import { WhatsAppConnectionError } from "../domain/errors";

export class WhatsAppValidationEngine {
  constructor(private readonly securityPolicy = new WhatsAppSecurityPolicy()) {}

  async evaluate(params: {
    tenant: TenantContext;
    meta: MetaValidationResult;
    request: RequestSecurityContext;
  }): Promise<ValidationDecision> {
    const rateKeys = [
      { namespace: "uid", key: params.tenant.firebaseUid, limit: 10 },
      { namespace: "tenant", key: params.tenant.tenantId, limit: 12 },
      { namespace: "waba", key: params.meta.wabaId, limit: 6 },
      { namespace: "phone", key: params.meta.phoneNumberId, limit: 6 },
    ];

    if (params.request.ipAddress) {
      rateKeys.push({
        namespace: "ip",
        key: params.request.ipAddress,
        limit: 30,
      });
    }

    for (const rateKey of rateKeys) {
      const decision = await checkWhatsAppConnectionRateLimit(rateKey);
      if (!decision.allowed) {
        throw new WhatsAppConnectionError(
          "RATE_LIMITED",
          "Too many WhatsApp connection attempts. Please wait before trying again.",
          429,
          { retryAfterSeconds: decision.retryAfterSeconds, namespace: rateKey.namespace },
        );
      }
    }

    return this.securityPolicy.evaluate(params);
  }
}
