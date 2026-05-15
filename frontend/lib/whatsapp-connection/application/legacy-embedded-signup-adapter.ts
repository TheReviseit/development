import { NextRequest, NextResponse } from "next/server";
import { ConnectionAttemptService } from "./connection-attempt.service";
import { getAuthenticatedConnectionContext } from "./request-context";
import { toSafeErrorResponse } from "../domain/errors";

export function isWhatsAppConnectionEngineV2Enabled() {
  return process.env.WA_CONNECTION_ENGINE_V2_ENABLED === "true";
}

export async function handleEmbeddedSignupWithConnectionEngineV2(params: {
  request: NextRequest;
  body: any;
}) {
  try {
    const context = await getAuthenticatedConnectionContext(params.request);
    const idempotencyKey =
      params.request.headers.get("Idempotency-Key") ||
      params.request.headers.get("X-Idempotency-Key") ||
      null;

    const result = await new ConnectionAttemptService().finalizeEmbeddedSignupInOneStep({
      context,
      idempotencyKey,
      input: {
        code: params.body.code || params.body.setupData?.code || null,
        accessToken: params.body.accessToken || null,
        userID: params.body.userID || null,
        expiresIn: params.body.expiresIn || null,
        grantedPermissions: params.body.grantedPermissions || null,
        redirectUri: params.body.redirectUri || null,
        setupData: params.body.setupData || null,
        messageEventData: params.body.messageEventData || null,
      },
    });

    if (result.success === false) {
      const status = result.status === "conflict" ? 409 : 422;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json({
      success: true,
      data: {
        whatsappAccount: result.whatsappAccount,
        phoneNumbers: result.phoneNumbers || [],
        validation: result.validation,
        engine: "v2",
      },
    });
  } catch (error) {
    const response = toSafeErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
