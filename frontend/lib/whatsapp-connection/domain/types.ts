import type { NextRequest } from "next/server";
import type { ProductDomain } from "@/types/auth.types";
import type { User } from "@/lib/supabase/queries";

export type WhatsAppConnectionState =
  | "initiated"
  | "validating"
  | "locked"
  | "meta_authorized"
  | "ownership_checked"
  | "webhook_subscribed"
  | "phone_registered"
  | "finalizing"
  | "active"
  | "cancelled"
  | "conflict"
  | "expired"
  | "failed"
  | "needs_user_action"
  | "disconnected";

export type WhatsAppAccountStatus =
  | "pending"
  | "active"
  | "reconnecting"
  | "needs_user_action"
  | "stale"
  | "expired"
  | "disconnected"
  | "revoked"
  | "failed";

export interface TenantContext {
  tenantId: string;
  mappingId: string;
  userId: string;
  firebaseUid: string;
  productDomain: ProductDomain;
  user: User;
}

export interface RequestSecurityContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  origin: string | null;
  traceparent: string | null;
}

export interface AuthenticatedConnectionContext {
  request: NextRequest;
  user: User;
  firebaseUid: string;
  productDomain: ProductDomain;
  tenant: TenantContext;
  requestContext: RequestSecurityContext;
}

export interface CreateAttemptInput {
  provider?: "meta_cloud_api";
  productDomain?: ProductDomain;
  idempotencyKey?: string;
  resourceKey?: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  normalizedE164?: string | null;
  requestContext?: Record<string, unknown>;
}

export interface CreateAttemptResult {
  attemptId: string;
  attemptToken: string;
  tenantId: string;
  expiresAt: string;
  state: WhatsAppConnectionState;
}

export interface EmbeddedSignupFinalizeInput {
  code?: string | null;
  accessToken?: string | null;
  userID?: string | null;
  expiresIn?: number | null;
  grantedPermissions?: string[] | null;
  setupData?: {
    wabaId?: string | null;
    waba_id?: string | null;
    phoneNumberId?: string | null;
    phone_number_id?: string | null;
    businessId?: string | null;
    business_id?: string | null;
    code?: string | null;
  } | null;
  messageEventData?: {
    waba_id?: string | null;
    phone_number_id?: string | null;
    business_id?: string | null;
    event?: string | null;
    session_id?: string | null;
  } | null;
}

export interface MetaValidationResult {
  accessToken: string;
  encryptedAccessToken: string;
  tokenExpiresAt: string | null;
  facebookUserId: string;
  facebookUserName: string | null;
  facebookEmail: string | null;
  permissions: string[];
  businessId: string | null;
  businessName: string | null;
  wabaId: string;
  wabaName: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  normalizedE164: string | null;
  verifiedName: string | null;
  accountReviewStatus: string | null;
  businessVerificationStatus: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  codeVerificationStatus: string | null;
  isOfficialBusinessAccount: boolean;
  platformType: string | null;
  webhookSubscribed: boolean;
  phoneRegistered: boolean;
  alreadyRegistered: boolean;
  warnings: string[];
}

export interface ValidationDecision {
  allowed: boolean;
  code?: string;
  status?: "conflict" | "needs_user_action" | "rate_limited" | "invalid_request";
  message?: string;
  details?: Record<string, unknown>;
}

export interface FinalizeConnectionResult {
  success: boolean;
  status?: string;
  code?: string;
  message?: string;
  accountId?: string;
  sessionId?: string;
  attemptId?: string;
  whatsappAccount?: Record<string, unknown>;
  phoneNumbers?: Array<Record<string, unknown>>;
  validation?: Record<string, unknown>;
}
