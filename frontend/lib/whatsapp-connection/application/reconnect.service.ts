import type { AuthenticatedConnectionContext } from "../domain/types";
import { WhatsAppConnectionRepository } from "../infra/whatsapp-connection.repository";
import { WhatsAppConnectionError } from "../domain/errors";

export class ReconnectService {
  constructor(private readonly repository = new WhatsAppConnectionRepository()) {}

  async disconnect(params: {
    context: AuthenticatedConnectionContext;
    accountId: string;
    reason?: string;
  }) {
    const result = await this.repository.disconnectAccount({
      tenant: params.context.tenant,
      accountId: params.accountId,
      reason: params.reason || "user_requested",
    });

    if (!result) {
      throw new WhatsAppConnectionError("ACCOUNT_NOT_FOUND", "WhatsApp account not found", 404);
    }

    return {
      success: true,
      accountId: result.id,
      status: result.status,
    };
  }

  async reconnect(params: { context: AuthenticatedConnectionContext; accountId: string }) {
    throw new WhatsAppConnectionError(
      "RECONNECT_REQUIRES_EMBEDDED_SIGNUP",
      "Please relaunch Meta embedded signup to reconnect this WhatsApp account.",
      422,
      { accountId: params.accountId },
    );
  }
}
