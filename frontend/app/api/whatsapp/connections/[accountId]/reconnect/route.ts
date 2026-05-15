import { NextRequest, NextResponse } from "next/server";
import { ReconnectService } from "@/lib/whatsapp-connection/application/reconnect.service";
import { getAuthenticatedConnectionContext } from "@/lib/whatsapp-connection/application/request-context";
import { toSafeErrorResponse, WhatsAppConnectionError } from "@/lib/whatsapp-connection/domain/errors";

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
    const result = await new ReconnectService().reconnect({ context, accountId });
    return NextResponse.json(result);
  } catch (error) {
    const response = toSafeErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
