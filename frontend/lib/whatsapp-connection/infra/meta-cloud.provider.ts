import nodeCrypto from "crypto";
import {
  createGraphAPIClient,
  MetaGraphAPIClient,
} from "@/lib/facebook/graph-api-client";
import { encryptToken } from "@/lib/encryption/crypto";
import { withTimeout } from "@/lib/server/fetchWithTimeout";
import type { EmbeddedSignupFinalizeInput, MetaValidationResult } from "../domain/types";
import { WhatsAppConnectionError } from "../domain/errors";
import { normalizeWhatsAppPhone } from "./whatsapp-connection.repository";

const GRAPH_VERSION = "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new WhatsAppConnectionError(
      "META_CONFIG_MISSING",
      `${name} is not configured`,
      500,
    );
  }
  return value;
}

function getWebhookUrl(origin?: string | null) {
  return (
    process.env.WHATSAPP_WEBHOOK_URL ||
    process.env.META_WEBHOOK_URL ||
    (process.env.NEXT_PUBLIC_BASE_URL
      ? `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}/api/webhooks/whatsapp`
      : origin
        ? `${origin.replace(/\/$/, "")}/api/webhooks/whatsapp`
        : null)
  );
}

export class MetaCloudConnectionProvider {
  async validateEmbeddedSignup(params: {
    input: EmbeddedSignupFinalizeInput & { redirectUri?: string | null };
    origin?: string | null;
  }): Promise<MetaValidationResult> {
    const setupData = params.input.setupData || {};
    const messageData = params.input.messageEventData || {};
    const code = params.input.code || setupData.code || null;
    const setupWabaId = setupData.wabaId || setupData.waba_id || messageData.waba_id || null;
    const setupPhoneId =
      setupData.phoneNumberId ||
      setupData.phone_number_id ||
      messageData.phone_number_id ||
      null;
    const businessId =
      setupData.businessId || setupData.business_id || messageData.business_id || null;

    let accessToken = params.input.accessToken || null;
    let expiresIn = params.input.expiresIn || null;
    let facebookUserId = params.input.userID || null;

    if (!accessToken && code) {
      const tokenData = await this.exchangeAuthorizationCode(code, params.input.redirectUri);
      accessToken = tokenData.access_token;
      expiresIn = tokenData.expires_in || expiresIn;
    }

    if (!accessToken) {
      throw new WhatsAppConnectionError(
        "META_TOKEN_MISSING",
        "Meta authorization token was not returned. Please try the setup again.",
        422,
      );
    }

    try {
      const longLived = await withTimeout(
        MetaGraphAPIClient.exchangeToken(accessToken),
        8000,
        "META_LONG_LIVED_TOKEN_TIMEOUT",
      );
      accessToken = longLived.access_token;
      expiresIn = longLived.expires_in || expiresIn;
    } catch {
      // Meta may already return a business/system-user token in embedded signup.
      // Keep the validated token and continue.
    }

    const graph = createGraphAPIClient(accessToken);
    const tokenValidation = await withTimeout(
      graph.validateToken(),
      8000,
      "META_TOKEN_VALIDATION_TIMEOUT",
    );

    if (!tokenValidation.isValid) {
      throw new WhatsAppConnectionError(
        "META_TOKEN_INVALID",
        tokenValidation.error || "Meta token validation failed",
        422,
      );
    }

    facebookUserId = facebookUserId || tokenValidation.user_id || null;

    const [profile, permissions] = await Promise.all([
      this.safeGetProfile(graph),
      this.getGrantedPermissions(accessToken, tokenValidation.scopes || []),
    ]);

    if (!facebookUserId && profile?.id) {
      facebookUserId = profile.id;
    }

    if (!facebookUserId) {
      throw new WhatsAppConnectionError(
        "META_USER_MISSING",
        "Meta user identity could not be resolved.",
        422,
      );
    }

    if (!permissions.includes("whatsapp_business_management")) {
      throw new WhatsAppConnectionError(
        "MISSING_WHATSAPP_PERMISSION",
        "Please grant WhatsApp Business management permission in Meta.",
        403,
        { permissions },
      );
    }

    const wabaId = setupWabaId || (await this.findWabaId(graph, businessId));
    if (!wabaId) {
      throw new WhatsAppConnectionError(
        "WABA_NOT_FOUND",
        "No WhatsApp Business Account was returned by Meta.",
        422,
      );
    }

    const waba = await withTimeout(
      graph.getWABADetails(wabaId),
      8000,
      "META_WABA_DETAILS_TIMEOUT",
    );

    const phoneNumberId = setupPhoneId || (await this.findPhoneNumberId(graph, wabaId));
    if (!phoneNumberId) {
      throw new WhatsAppConnectionError(
        "PHONE_NUMBER_NOT_FOUND",
        "No WhatsApp phone number was returned by Meta.",
        422,
      );
    }

    const phone = await withTimeout(
      graph.getPhoneNumberDetails(phoneNumberId),
      8000,
      "META_PHONE_DETAILS_TIMEOUT",
    );

    const tokenExpiresAt =
      expiresIn && Number.isFinite(expiresIn)
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    return {
      accessToken,
      encryptedAccessToken: encryptToken(accessToken),
      tokenExpiresAt,
      facebookUserId,
      facebookUserName: profile?.name || null,
      facebookEmail: profile?.email || null,
      permissions,
      businessId,
      businessName: null,
      wabaId,
      wabaName: waba.name || null,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      normalizedE164: normalizeWhatsAppPhone(phone.display_phone_number),
      verifiedName: phone.verified_name || null,
      accountReviewStatus: waba.account_review_status || null,
      businessVerificationStatus: waba.business_verification_status || null,
      qualityRating: phone.quality_rating || waba.quality_rating || null,
      messagingLimitTier: null,
      codeVerificationStatus: phone.code_verification_status || null,
      isOfficialBusinessAccount: Boolean(phone.is_official_business_account),
      platformType: phone.platform_type || "CLOUD_API",
      webhookSubscribed: false,
      phoneRegistered: false,
      alreadyRegistered: false,
      warnings: [],
    };
  }

  async activateConnection(params: {
    meta: MetaValidationResult;
    origin?: string | null;
  }): Promise<MetaValidationResult> {
    const webhookSubscribed = await this.subscribeWebhook({
      accessToken: params.meta.accessToken,
      wabaId: params.meta.wabaId,
      origin: params.origin,
    });
    const registration = await this.registerPhoneNumber({
      accessToken: params.meta.accessToken,
      phoneNumberId: params.meta.phoneNumberId,
    });

    return {
      ...params.meta,
      webhookSubscribed,
      phoneRegistered: registration.registered,
      alreadyRegistered: registration.alreadyRegistered,
      warnings: registration.warning
        ? [...params.meta.warnings, registration.warning]
        : params.meta.warnings,
    };
  }

  private async exchangeAuthorizationCode(code: string, redirectUri?: string | null) {
    const appId = requiredEnv("NEXT_PUBLIC_FACEBOOK_APP_ID");
    const appSecret = requiredEnv("FACEBOOK_APP_SECRET");
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("code", code);
    if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);

    const response = await withTimeout(fetch(url.toString()), 8000, "META_CODE_EXCHANGE_TIMEOUT");
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new WhatsAppConnectionError(
        "META_CODE_EXCHANGE_FAILED",
        data.error?.message || "Failed to exchange Meta authorization code",
        422,
      );
    }
    return data as { access_token: string; expires_in?: number };
  }

  private async safeGetProfile(graph: ReturnType<typeof createGraphAPIClient>) {
    try {
      return await withTimeout(graph.getUserProfile(), 6000, "META_PROFILE_TIMEOUT");
    } catch {
      return null;
    }
  }

  private async getGrantedPermissions(accessToken: string, fallbackScopes: string[]) {
    try {
      const url = new URL(`${GRAPH_BASE}/me/permissions`);
      url.searchParams.set("access_token", accessToken);
      const response = await withTimeout(fetch(url.toString()), 6000, "META_PERMISSIONS_TIMEOUT");
      const data = await response.json();
      if (!response.ok || data.error) return fallbackScopes;
      const granted =
        data.data
          ?.filter((permission: any) => permission.status === "granted")
          ?.map((permission: any) => permission.permission) || [];
      return [...new Set([...granted, ...fallbackScopes])];
    } catch {
      return fallbackScopes;
    }
  }

  private async findWabaId(
    graph: ReturnType<typeof createGraphAPIClient>,
    businessId: string | null,
  ) {
    if (!businessId) return null;
    const accounts = await withTimeout(
      graph.getWhatsAppBusinessAccounts(businessId),
      8000,
      "META_WABA_LIST_TIMEOUT",
    );
    return accounts[0]?.id || null;
  }

  private async findPhoneNumberId(graph: ReturnType<typeof createGraphAPIClient>, wabaId: string) {
    const phones = await withTimeout(
      graph.getPhoneNumbers(wabaId),
      8000,
      "META_PHONE_LIST_TIMEOUT",
    );
    return phones[0]?.id || null;
  }

  private async subscribeWebhook(params: {
    accessToken: string;
    wabaId: string;
    origin?: string | null;
  }) {
    const webhookUrl = getWebhookUrl(params.origin);
    const verifyToken =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_WEBHOOK_VERIFY_TOKEN;

    if (!webhookUrl || !verifyToken || webhookUrl.includes("localhost")) {
      return false;
    }

    try {
      const response = await withTimeout(
        fetch(`${GRAPH_BASE}/${params.wabaId}/subscribed_apps`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.accessToken}`,
          },
          body: JSON.stringify({
            override_callback_uri: webhookUrl,
            verify_token: verifyToken,
            subscribed_fields: ["messages", "account_update"],
          }),
        }),
        8000,
        "META_WEBHOOK_SUBSCRIBE_TIMEOUT",
      );
      const data = await response.json().catch(() => ({}));
      return response.ok && data.success === true;
    } catch {
      return false;
    }
  }

  private async registerPhoneNumber(params: { accessToken: string; phoneNumberId: string }) {
    const pin = nodeCrypto.randomInt(100000, 1000000).toString();
    try {
      const response = await withTimeout(
        fetch(`${GRAPH_BASE}/${params.phoneNumberId}/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin,
          }),
        }),
        8000,
        "META_PHONE_REGISTER_TIMEOUT",
      );

      if (response.ok) {
        return { registered: true, alreadyRegistered: false };
      }

      const data = await response.json().catch(() => ({}));
      if (data?.error?.code === 33) {
        return { registered: true, alreadyRegistered: true };
      }

      return {
        registered: false,
        alreadyRegistered: false,
        warning: data?.error?.message || "Meta phone registration failed",
      };
    } catch (error) {
      return {
        registered: false,
        alreadyRegistered: false,
        warning: error instanceof Error ? error.message : "Meta phone registration failed",
      };
    }
  }
}
