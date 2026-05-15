import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ConnectionAttemptService } from "@/lib/whatsapp-connection/application/connection-attempt.service";
import { getAuthenticatedConnectionContext } from "@/lib/whatsapp-connection/application/request-context";
import { toSafeErrorResponse } from "@/lib/whatsapp-connection/domain/errors";

const createAttemptSchema = z.object({
  wabaId: z.string().trim().min(1).optional().nullable(),
  phoneNumberId: z.string().trim().min(1).optional().nullable(),
  normalizedE164: z.string().trim().min(4).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedConnectionContext(request);
    const body = await request.json().catch(() => ({}));
    const input = createAttemptSchema.parse(body);
    const service = new ConnectionAttemptService();
    const result = await service.createAttempt(context, {
      ...input,
      idempotencyKey: input.idempotencyKey || request.headers.get("Idempotency-Key") || undefined,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
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
