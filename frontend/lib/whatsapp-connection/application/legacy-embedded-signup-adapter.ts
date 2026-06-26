import { NextRequest } from "next/server";
import { ConnectionAttemptService } from "./connection-attempt.service";
import { getAuthenticatedConnectionContext } from "./request-context";
import { toSafeErrorResponse } from "../domain/errors";
import type { EmbeddedSignupServerTimer } from "@/lib/perf/embedded-signup";
import {
  attachEmbeddedSignupPerfHeaders,
  jsonWithEmbeddedSignupPerf,
  logEmbeddedSignupTiming,
} from "@/lib/perf/embedded-signup";

export function isWhatsAppConnectionEngineV2Enabled() {
  return process.env.WA_CONNECTION_ENGINE_V2_ENABLED === "true";
}

export async function handleEmbeddedSignupWithConnectionEngineV2(params: {
  request: NextRequest;
  body: any;
  timer?: EmbeddedSignupServerTimer;
}) {
  const timer = params.timer;
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
      if (timer) {
        return jsonWithEmbeddedSignupPerf(result, timer, { status });
      }
      return Response.json(result, { status });
    }

    const payload = {
      success: true,
      data: {
        whatsappAccount: result.whatsappAccount,
        phoneNumbers: result.phoneNumbers || [],
        webhookStatus:
          (result.whatsappAccount as { webhook_status?: string } | undefined)
            ?.webhook_status ?? "pending",
        validation: result.validation,
        engine: "v2",
      },
    };

    if (timer) {
      return jsonWithEmbeddedSignupPerf(payload, timer);
    }

    return Response.json(payload);
  } catch (error) {
    if (timer) {
      logEmbeddedSignupTiming(timer, { engine: "v2", error: true });
      const response = toSafeErrorResponse(error);
      const json = Response.json(response.body, { status: response.status });
      attachEmbeddedSignupPerfHeaders(json, timer);
      return json;
    }
    const response = toSafeErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
