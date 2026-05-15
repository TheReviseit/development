import type {
  MetaValidationResult,
  RequestSecurityContext,
  TenantContext,
  ValidationDecision,
} from "../domain/types";

export class WhatsAppSecurityPolicy {
  evaluate(params: {
    tenant: TenantContext;
    meta: MetaValidationResult;
    request: RequestSecurityContext;
  }): ValidationDecision {
    const { meta } = params;

    if (!meta.wabaId || !meta.phoneNumberId) {
      return {
        allowed: false,
        code: "MISSING_META_RESOURCE",
        status: "invalid_request",
        message: "Meta did not return the required WhatsApp account identifiers.",
      };
    }

    if (!meta.permissions.includes("whatsapp_business_management")) {
      return {
        allowed: false,
        code: "MISSING_WHATSAPP_PERMISSION",
        status: "needs_user_action",
        message: "Please grant WhatsApp Business management permission in Meta.",
      };
    }

    if (!meta.phoneRegistered && !meta.alreadyRegistered) {
      return {
        allowed: true,
        status: "needs_user_action",
        code: "PHONE_REGISTRATION_REQUIRED",
        message: "The number was validated but still needs Meta phone registration.",
      };
    }

    return { allowed: true };
  }
}
