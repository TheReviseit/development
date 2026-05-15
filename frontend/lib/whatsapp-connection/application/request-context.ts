import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { detectProductFromRequest, getRequestContext } from "@/lib/auth-helpers";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { WhatsAppConnectionRepository } from "../infra/whatsapp-connection.repository";
import type {
  AuthenticatedConnectionContext,
  RequestSecurityContext,
  TenantContext,
} from "../domain/types";
import { WhatsAppConnectionError } from "../domain/errors";

export function buildSecurityContext(request: NextRequest): RequestSecurityContext {
  const ctx = getRequestContext(request);
  return {
    requestId: ctx.request_id,
    ipAddress: ctx.ip_address,
    userAgent: ctx.user_agent,
    origin: request.headers.get("origin"),
    traceparent: ctx.traceparent,
  };
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("host");
  if (!host) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new WhatsAppConnectionError("INVALID_ORIGIN", "Invalid request origin", 403);
  }

  if (originHost !== host) {
    throw new WhatsAppConnectionError(
      "INVALID_ORIGIN",
      "Invalid request origin",
      403,
      { originHost, host },
    );
  }
}

export async function getAuthenticatedConnectionContext(
  request: NextRequest,
  repository = new WhatsAppConnectionRepository(),
): Promise<AuthenticatedConnectionContext> {
  assertSameOrigin(request);

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) {
    throw new WhatsAppConnectionError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
  const firebaseUid = decodedClaims.uid;
  const user = await getUserByFirebaseUID(firebaseUid);
  if (!user) {
    throw new WhatsAppConnectionError("USER_NOT_FOUND", "User not found", 404);
  }

  const productDomain = detectProductFromRequest(request);
  const tenantData = await repository.resolveTenant({
    userId: user.id,
    firebaseUid,
    productDomain,
  });

  const tenant: TenantContext = {
    ...tenantData,
    productDomain,
    user,
  };

  return {
    request,
    user,
    firebaseUid,
    productDomain,
    tenant,
    requestContext: buildSecurityContext(request),
  };
}
