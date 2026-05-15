import crypto from "crypto";
import type { TenantContext } from "../domain/types";
import { WhatsAppConnectionError } from "../domain/errors";

const TOKEN_VERSION = "wa-at-v1";
const DEFAULT_TTL_SECONDS = 10 * 60;

function getSecret() {
  return (
    process.env.WA_CONNECTION_ATTEMPT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.FIREBASE_SESSION_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  const secret = getSecret();
  if (!secret) {
    throw new WhatsAppConnectionError(
      "ATTEMPT_TOKEN_SECRET_MISSING",
      "WhatsApp attempt token secret is not configured",
      500,
    );
  }
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAttemptToken(params: {
  tenant: TenantContext;
  attemptId: string;
  ttlSeconds?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const body = {
    v: TOKEN_VERSION,
    tid: params.tenant.tenantId,
    uid: params.tenant.userId,
    product: params.tenant.productDomain,
    aid: params.attemptId,
    iat: issuedAt,
    exp: expiresAt,
  };

  const payload = base64Url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

export function hashAttemptToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyAttemptToken(params: {
  token: string | null;
  tenant: TenantContext;
  attemptId: string;
}) {
  if (!params.token) {
    throw new WhatsAppConnectionError(
      "ATTEMPT_TOKEN_REQUIRED",
      "Connection attempt token is required",
      403,
    );
  }

  const [payload, signature] = params.token.split(".");
  if (!payload || !signature) {
    throw new WhatsAppConnectionError("ATTEMPT_TOKEN_INVALID", "Invalid attempt token", 403);
  }

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new WhatsAppConnectionError("ATTEMPT_TOKEN_INVALID", "Invalid attempt token", 403);
  }

  const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    v: string;
    tid: string;
    uid: string;
    product: string;
    aid: string;
    exp: number;
  };

  const now = Math.floor(Date.now() / 1000);
  if (
    body.v !== TOKEN_VERSION ||
    body.tid !== params.tenant.tenantId ||
    body.uid !== params.tenant.userId ||
    body.product !== params.tenant.productDomain ||
    body.aid !== params.attemptId ||
    body.exp < now
  ) {
    throw new WhatsAppConnectionError("ATTEMPT_TOKEN_INVALID", "Invalid attempt token", 403);
  }
}
