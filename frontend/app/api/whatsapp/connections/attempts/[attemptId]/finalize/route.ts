import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ConnectionAttemptService } from "@/lib/whatsapp-connection/application/connection-attempt.service";
import { getAuthenticatedConnectionContext } from "@/lib/whatsapp-connection/application/request-context";
import { toSafeErrorResponse, WhatsAppConnectionError } from "@/lib/whatsapp-connection/domain/errors";

const finalizeSchema = z.object({
  code: z.string().trim().min(1).optional().nullable(),
  accessToken: z.string().trim().min(1).optional().nullable(),
  userID: z.string().trim().min(1).optional().nullable(),
  expiresIn: z.number().optional().nullable(),
  grantedPermissions: z.array(z.string()).optional().nullable(),
  redirectUri: z.string().url().optional().nullable(),
  setupData: z
    .object({
      wabaId: z.string().optional().nullable(),
      waba_id: z.string().optional().nullable(),
      phoneNumberId: z.string().optional().nullable(),
      phone_number_id: z.string().optional().nullable(),
      businessId: z.string().optional().nullable(),
      business_id: z.string().optional().nullable(),
      code: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  messageEventData: z
    .object({
      waba_id: z.string().optional().nullable(),
      phone_number_id: z.string().optional().nullable(),
      business_id: z.string().optional().nullable(),
      event: z.string().optional().nullable(),
      session_id: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const { attemptId } = await params;
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey && process.env.WA_CONNECTION_REQUIRE_IDEMPOTENCY_KEY === "true") {
      throw new WhatsAppConnectionError(
        "MISSING_IDEMPOTENCY_KEY",
        "Idempotency-Key header is required",
        400,
      );
    }

    const attemptToken = request.headers.get("X-WhatsApp-Attempt-Token");
    const context = await getAuthenticatedConnectionContext(request);
    const body = finalizeSchema.parse(await request.json().catch(() => ({})));
    const service = new ConnectionAttemptService();
    const result = await service.finalizeAttempt({
      context,
      attemptId,
      attemptToken,
      idempotencyKey,
      input: body,
    });

    const status =
      result.success === false && result.status === "conflict"
        ? 409
        : result.success === false && result.status === "needs_user_action"
          ? 422
          : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, code: "INVALID_REQUEST", error: "Invalid request", details: error.flatten() },
        { status: 400 },
      );
    }
    const response = toSafeErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
