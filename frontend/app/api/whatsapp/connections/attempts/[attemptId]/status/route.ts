import { NextRequest, NextResponse } from "next/server";
import { ConnectionAttemptService } from "@/lib/whatsapp-connection/application/connection-attempt.service";
import { getAuthenticatedConnectionContext } from "@/lib/whatsapp-connection/application/request-context";
import { toSafeErrorResponse } from "@/lib/whatsapp-connection/domain/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const { attemptId } = await params;
    const context = await getAuthenticatedConnectionContext(request);
    const service = new ConnectionAttemptService();
    const result = await service.getAttemptStatus(context, attemptId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const response = toSafeErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
