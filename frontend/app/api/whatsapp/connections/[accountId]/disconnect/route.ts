import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ReconnectService } from "@/lib/whatsapp-connection/application/reconnect.service";
import { getAuthenticatedConnectionContext } from "@/lib/whatsapp-connection/application/request-context";
import { toSafeErrorResponse, WhatsAppConnectionError } from "@/lib/whatsapp-connection/domain/errors";

const disconnectSchema = z.object({
  reason: z.string().max(240).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    if (!request.headers.get("Idempotency-Key")) {
      throw new WhatsAppConnectionError(
        "MISSING_IDEMPOTENCY_KEY",
        "Idempotency-Key header is required",
        400,
      );
    }

    const { accountId } = await params;
    const context = await getAuthenticatedConnectionContext(request);
    const body = disconnectSchema.parse(await request.json().catch(() => ({})));
    const result = await new ReconnectService().disconnect({
      context,
      accountId,
      reason: body.reason,
    });

    return NextResponse.json(result);
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
