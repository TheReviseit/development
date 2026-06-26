/**
 * Optimized legacy embedded signup handler.
 * Parallel Meta fan-out, reduced Graph calls, async webhook queue.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  createFacebookAccount,
  getFacebookAccountByUserId,
  updateFacebookAccount,
  createWhatsAppAccount,
  createPhoneNumber,
  createBusinessManager,
  getBusinessManagersByUserId,
  getWhatsAppAccountByWabaId,
  getPhoneNumberByPhoneNumberId,
  updatePhoneNumber,
  updateWhatsAppAccount,
} from "@/lib/supabase/facebook-whatsapp-queries";
import {
  createGraphAPIClient,
  MetaGraphAPIClient,
} from "@/lib/facebook/graph-api-client";
import { encryptToken } from "@/lib/encryption/crypto";
import {
  EmbeddedSignupServerTimer,
  jsonWithEmbeddedSignupPerf,
} from "@/lib/perf/embedded-signup";
import { enqueueWebhookSubscribeJob, processWebhookSubscribeJobs } from "@/lib/whatsapp/webhook-subscribe-jobs";
import type { ConnectedWhatsAppAccount } from "@/types/facebook-whatsapp.types";

const GRAPH_VERSION = "v24.0";

async function getConnectionConflictOrResumeAction(params: {
  currentUserId: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
}) {
  const [phone, waba] = await Promise.all([
    params.phoneNumberId
      ? getPhoneNumberByPhoneNumberId(params.phoneNumberId)
      : Promise.resolve(null),
    params.wabaId
      ? getWhatsAppAccountByWabaId(params.wabaId)
      : Promise.resolve(null),
  ]);

  const existingPhone = phone && !phone.deleted_at ? phone : null;
  const existingWaba = waba && !waba.deleted_at ? waba : null;
  const existing = existingPhone || existingWaba;
  if (!existing) return null;

  const sameWorkspace = existing.user_id === params.currentUserId;
  if (sameWorkspace) return null;

  const isPhoneConflict = Boolean(existingPhone);
  return NextResponse.json(
    {
      success: false,
      code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
      status: "conflict",
      error:
        "This WhatsApp number is already connected to another workspace.",
      message: "Ask the owner to disconnect it before trying again.",
      resource: isPhoneConflict ? "phone_number" : "whatsapp_business_account",
    },
    { status: 409 },
  );
}

function hasCompleteSetupData(setupData: Record<string, unknown>): boolean {
  const wabaId = setupData.wabaId || setupData.waba_id;
  const phoneNumberId = setupData.phoneNumberId || setupData.phone_number_id;
  const businessId = setupData.businessId || setupData.business_id;
  return Boolean(wabaId && phoneNumberId && businessId);
}

async function fetchBusinessMeta(businessId: string, accessToken: string) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${businessId}?fields=id,name,verification_status&access_token=${accessToken}`,
  );
  if (!response.ok) return { name: "WhatsApp Business" };
  return response.json();
}

async function resolvePermissions(
  longLivedToken: string,
  debugScopes: string[] | undefined,
): Promise<string[]> {
  const scopes = debugScopes ?? [];
  const hasWhatsappScope = scopes.includes("whatsapp_business_management");
  if (hasWhatsappScope) {
    return scopes;
  }

  const permissionsResponse = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${longLivedToken}`,
  );
  if (!permissionsResponse.ok) return scopes;
  const permissionsData = await permissionsResponse.json();
  const granted =
    permissionsData.data
      ?.filter((p: { status: string }) => p.status === "granted")
      ?.map((p: { permission: string }) => p.permission) ?? [];
  return [...new Set([...granted, ...scopes])];
}

async function exchangeAuthorizationCode(authorizationCode: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const step1Url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
  );
  step1Url.searchParams.append(
    "client_id",
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
  );
  step1Url.searchParams.append(
    "client_secret",
    process.env.FACEBOOK_APP_SECRET || "",
  );
  step1Url.searchParams.append("code", authorizationCode);

  const step1Response = await fetch(step1Url.toString());
  if (!step1Response.ok) {
    const errorData = await step1Response.json();
    if (
      errorData?.error?.code === 100 &&
      errorData?.error?.message?.includes("code")
    ) {
      throw Object.assign(new Error("SESSION_EXPIRED"), {
        status: 400,
        payload: {
          error: "This connection session has expired",
          hint: "Please close this window and click 'Connect WhatsApp' again.",
          action: "RESTART_FLOW",
          details: errorData,
        },
      });
    }
    throw Object.assign(new Error("TOKEN_EXCHANGE_FAILED"), {
      status: 400,
      payload: {
        error: "Failed to exchange authorization code",
        details: errorData,
      },
    });
  }

  const step1Data = await step1Response.json();
  const shortLivedToken = step1Data.access_token as string;

  const step2Url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
  );
  step2Url.searchParams.append("grant_type", "fb_exchange_token");
  step2Url.searchParams.append(
    "client_id",
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
  );
  step2Url.searchParams.append(
    "client_secret",
    process.env.FACEBOOK_APP_SECRET || "",
  );
  step2Url.searchParams.append("fb_exchange_token", shortLivedToken);

  const step2Response = await fetch(step2Url.toString());
  if (!step2Response.ok) {
    return {
      accessToken: shortLivedToken,
      expiresIn: step1Data.expires_in || 3600,
    };
  }

  const step2Data = await step2Response.json();
  return {
    accessToken: step2Data.access_token,
    expiresIn: step2Data.expires_in,
  };
}

async function resolveWabaIdFallback(
  longLivedToken: string,
): Promise<string | null> {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const wabaResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/whatsapp_business_accounts?access_token=${longLivedToken}`,
    );
    if (wabaResponse.ok) {
      const wabaData = await wabaResponse.json();
      if (wabaData.data?.length > 0) {
        return wabaData.data[0].id as string;
      }
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  return null;
}

export async function handleLegacyEmbeddedSignup(params: {
  user: { id: string };
  body: Record<string, any>;
  timer: EmbeddedSignupServerTimer;
}): Promise<Response> {
  const { user, body, timer } = params;
  let setupData = body.setupData || {};

  let {
    accessToken,
    userID,
    expiresIn,
    code,
    grantedPermissions = null,
  } = body;

  const authorizationCode = code || setupData.code;

  const tokenPhaseStart = Date.now();
  if (!accessToken && authorizationCode) {
    try {
      const exchanged = await exchangeAuthorizationCode(authorizationCode);
      accessToken = exchanged.accessToken;
      expiresIn = exchanged.expiresIn;
    } catch (error: any) {
      timer.record("token_exchange", tokenPhaseStart);
      if (error.payload) {
        return jsonWithEmbeddedSignupPerf(error.payload, timer, {
          status: error.status ?? 500,
        });
      }
      return jsonWithEmbeddedSignupPerf(
        {
          error: "Failed to process authorization code",
          message: error.message,
        },
        timer,
        { status: 500 },
      );
    }
  }

  let longLivedToken: string = accessToken;
  let tokenExpiresIn: number = expiresIn || 3600;

  if (!authorizationCode && accessToken) {
    try {
      const exchangeResult = await MetaGraphAPIClient.exchangeToken(accessToken);
      longLivedToken = exchangeResult.access_token;
      tokenExpiresIn = exchangeResult.expires_in;
    } catch {
      // use provided token
    }
  }

  if (!tokenExpiresIn || Number.isNaN(tokenExpiresIn)) {
    tokenExpiresIn = 3600;
  }
  timer.record("token_exchange", tokenPhaseStart);

  const graphClient = createGraphAPIClient(longLivedToken);
  const tokenValidation = await graphClient.validateToken();
  if (!tokenValidation.isValid) {
    return jsonWithEmbeddedSignupPerf(
      { error: "Invalid access token" },
      timer,
      { status: 401 },
    );
  }

  userID = userID || tokenValidation.user_id || null;
  if (!longLivedToken || !userID) {
    return jsonWithEmbeddedSignupPerf(
      { error: "Missing required fields: accessToken and userID" },
      timer,
      { status: 400 },
    );
  }

  const validatedPermissions = await resolvePermissions(
    longLivedToken,
    tokenValidation.scopes,
  );
  grantedPermissions = validatedPermissions;

  if (!validatedPermissions.includes("whatsapp_business_management")) {
    return jsonWithEmbeddedSignupPerf(
      {
        error: "Missing required permission: whatsapp_business_management",
        hint: "Please complete the WhatsApp Embedded Signup and grant WhatsApp access.",
        grantedPermissions: validatedPermissions,
      },
      timer,
      { status: 403 },
    );
  }

  const existingAccount = await getFacebookAccountByUserId(user.id);
  const needsProfile =
    !existingAccount?.facebook_user_name || !existingAccount?.facebook_email;

  const metaFanoutStart = Date.now();
  const profilePromise = needsProfile
    ? graphClient.getUserProfile().catch(() => null)
    : Promise.resolve(null);

  let wabaId = setupData.wabaId || setupData.waba_id;
  let phoneNumberId = setupData.phoneNumberId || setupData.phone_number_id;
  const businessId = setupData.businessId || setupData.business_id;

  if (!wabaId) {
    wabaId = await resolveWabaIdFallback(longLivedToken);
  }

  if (!wabaId) {
    timer.record("meta_fanout", metaFanoutStart);
    return jsonWithEmbeddedSignupPerf(
      {
        error: "No WhatsApp Business Account found",
        hint: "The WABA ID was not returned from Embedded Signup and the API fallback also failed.",
        setupData: body.setupData,
        grantedPermissions,
      },
      timer,
      { status: 404 },
    );
  }

  const [profile, businessMeta, wabaDetails, phoneDetails] = await Promise.all([
    profilePromise,
    businessId ? fetchBusinessMeta(businessId, longLivedToken) : null,
    graphClient.getWABADetails(wabaId),
    phoneNumberId
      ? graphClient.getPhoneNumberDetails(phoneNumberId).catch(() => null)
      : Promise.resolve(null),
  ]);
  timer.record("meta_fanout", metaFanoutStart);

  const conflictStart = Date.now();
  const conflict = await getConnectionConflictOrResumeAction({
    currentUserId: user.id,
    wabaId,
    phoneNumberId: phoneNumberId || null,
  });
  timer.record("conflict_check", conflictStart);
  if (conflict) {
    return jsonWithEmbeddedSignupPerf(await conflict.json(), timer, {
      status: conflict.status,
    });
  }

  const dbStart = Date.now();
  const expiresAt = new Date(Date.now() + tokenExpiresIn * 1000).toISOString();
  const encryptedToken = encryptToken(longLivedToken);

  let facebookAccount;
  if (existingAccount) {
    facebookAccount = await updateFacebookAccount(existingAccount.id, {
      access_token: encryptedToken,
      expires_at: expiresAt,
      granted_permissions: [
        ...(existingAccount.granted_permissions || []),
        ...validatedPermissions.filter(
          (p) => !existingAccount.granted_permissions?.includes(p),
        ),
      ],
      status: "active",
      facebook_user_name: profile?.name ?? existingAccount.facebook_user_name,
      facebook_email: profile?.email ?? existingAccount.facebook_email ?? null,
      connection_error: null,
    });
  } else {
    facebookAccount = await createFacebookAccount({
      user_id: user.id,
      facebook_user_id: userID,
      facebook_user_name: profile?.name ?? null,
      facebook_email: profile?.email ?? null,
      access_token: encryptedToken,
      token_type: "Bearer",
      expires_at: expiresAt,
      granted_permissions: grantedPermissions || [],
    });
  }

  let businessManagerId: string | null = null;
  const existingManagers = await getBusinessManagersByUserId(user.id);
  const matchingManager = existingManagers.find(
    (bm) => bm.business_id === businessId,
  );
  if (matchingManager) {
    businessManagerId = matchingManager.id;
  } else if (businessId && facebookAccount) {
    try {
      const newBusinessManager = await createBusinessManager({
        facebook_account_id: facebookAccount.id,
        user_id: user.id,
        business_id: businessId,
        business_name: businessMeta?.name || "WhatsApp Business",
        business_email: null,
        business_vertical: null,
        permitted_roles: ["ADMIN"],
      });
      businessManagerId = newBusinessManager.id;
    } catch (bmError: any) {
      if (
        bmError.message?.includes("duplicate") ||
        bmError.code?.includes("23505")
      ) {
        const refreshedManagers = await getBusinessManagersByUserId(user.id);
        if (refreshedManagers.length > 0) {
          businessManagerId = refreshedManagers[0].id;
        }
      } else {
        throw bmError;
      }
    }
  }

  if (!businessManagerId) {
    timer.record("db_finalize", dbStart);
    return jsonWithEmbeddedSignupPerf(
      {
        error: "Failed to create WhatsApp Business Account",
        hint: "Could not create or find a Business Manager. Please try the connection flow again.",
      },
      timer,
      { status: 500 },
    );
  }

  let storedWABA: ConnectedWhatsAppAccount | undefined;
  try {
    storedWABA = await createWhatsAppAccount({
      business_manager_id: businessManagerId,
      user_id: user.id,
      waba_id: wabaId,
      waba_name: wabaDetails.name || null,
      account_review_status: wabaDetails.account_review_status || null,
      business_verification_status:
        wabaDetails.business_verification_status || null,
      messaging_limit_tier: null,
      webhook_status: "pending",
    });
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.code?.includes("23505")) {
      const existingWABA = await getWhatsAppAccountByWabaId(wabaId);
      if (existingWABA && existingWABA.user_id !== user.id) {
        timer.record("db_finalize", dbStart);
        return jsonWithEmbeddedSignupPerf(
          {
            success: false,
            code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
            status: "conflict",
            error:
              "This WhatsApp Business account is already connected to another workspace.",
          },
          timer,
          { status: 409 },
        );
      }
      if (existingWABA) {
        storedWABA = await updateWhatsAppAccount(existingWABA.id, {
          business_manager_id: businessManagerId,
          waba_name: wabaDetails.name || existingWABA.waba_name,
          account_review_status:
            wabaDetails.account_review_status ||
            existingWABA.account_review_status,
          business_verification_status:
            wabaDetails.business_verification_status ||
            existingWABA.business_verification_status,
          messaging_limit_tier: existingWABA.messaging_limit_tier,
          is_active: true,
        });
      }
    } else {
      throw error;
    }
  }

  if (!storedWABA) {
    timer.record("db_finalize", dbStart);
    return jsonWithEmbeddedSignupPerf(
      { error: "Failed to store WhatsApp Business Account" },
      timer,
      { status: 500 },
    );
  }

  const allPhoneNumbers: any[] = [];
if (phoneNumberId && !phoneDetails) {
    timer.record("db_finalize", dbStart);
    return jsonWithEmbeddedSignupPerf(
      {
        error: "Failed to fetch WhatsApp phone number details",
        phoneNumberId,
      },
      timer,
      { status: 500 },
    );
  }

  if (phoneNumberId && phoneDetails) {
    try {
      const verifyToken = crypto.randomBytes(32).toString("hex");
      const encryptedVerifyToken = encryptToken(verifyToken);
      const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/whatsapp/${phoneNumberId}`;

      const storedPhone = await createPhoneNumber({
        whatsapp_account_id: storedWABA.id,
        user_id: user.id,
        phone_number_id: phoneNumberId,
        display_phone_number: phoneDetails.display_phone_number,
        verified_name: phoneDetails.verified_name || null,
        code_verification_status: phoneDetails.code_verification_status || null,
        is_official_business_account:
          phoneDetails.is_official_business_account || false,
        webhook_url: webhookUrl,
        webhook_verify_token: encryptedVerifyToken,
        is_primary: true,
        is_active: true,
        can_send_messages: true,
      });
      allPhoneNumbers.push(storedPhone);
    } catch (error: any) {
      if (error.message?.includes("duplicate") || error.code?.includes("23505")) {
        const existingPhone = await getPhoneNumberByPhoneNumberId(phoneNumberId);
        if (existingPhone && existingPhone.user_id !== user.id) {
          timer.record("db_finalize", dbStart);
          return jsonWithEmbeddedSignupPerf(
            {
              success: false,
              code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
              status: "conflict",
              error:
                "This WhatsApp phone number is already connected to another workspace.",
            },
            timer,
            { status: 409 },
          );
        }
        if (existingPhone) {
          const updatedPhone = await updatePhoneNumber(existingPhone.id, {
            whatsapp_account_id: storedWABA.id,
            is_active: true,
            can_send_messages: true,
            is_primary: true,
          });
          allPhoneNumbers.push(updatedPhone);
        }
      } else {
        throw error;
      }
    }
  } else if (!phoneNumberId) {
    const phoneNumbers = await graphClient.getPhoneNumbers(wabaId);
    for (const phone of phoneNumbers) {
      try {
        const verifyToken = crypto.randomBytes(32).toString("hex");
        const encryptedVerifyToken = encryptToken(verifyToken);
        const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/whatsapp/${phone.id}`;
        const storedPhone = await createPhoneNumber({
          whatsapp_account_id: storedWABA.id,
          user_id: user.id,
          phone_number_id: phone.id,
          display_phone_number: phone.display_phone_number,
          verified_name: phone.verified_name || null,
          code_verification_status: phone.code_verification_status || null,
          is_official_business_account:
            phone.is_official_business_account || false,
          webhook_url: webhookUrl,
          webhook_verify_token: encryptedVerifyToken,
          is_primary: allPhoneNumbers.length === 0,
          is_active: true,
          can_send_messages: true,
        });
        allPhoneNumbers.push(storedPhone);
      } catch (error: any) {
        if (error.message?.includes("duplicate") || error.code?.includes("23505")) {
          const existingPhone = await getPhoneNumberByPhoneNumberId(phone.id);
          if (existingPhone && existingPhone.user_id !== user.id) {
            timer.record("db_finalize", dbStart);
            return jsonWithEmbeddedSignupPerf(
              {
                success: false,
                code: "WHATSAPP_NUMBER_ALREADY_CONNECTED",
                status: "conflict",
                error:
                  "This WhatsApp phone number is already connected to another workspace.",
              },
              timer,
              { status: 409 },
            );
          }
          if (existingPhone) {
            const updatedPhone = await updatePhoneNumber(existingPhone.id, {
              whatsapp_account_id: storedWABA.id,
              is_active: true,
              can_send_messages: true,
              is_primary: allPhoneNumbers.length === 0,
            });
            allPhoneNumbers.push(updatedPhone);
          }
        }
      }
    }
  }

  if (storedWABA.is_active !== true) {
    storedWABA = await updateWhatsAppAccount(storedWABA.id, {
      is_active: true,
    });
  }
  timer.record("db_finalize", dbStart);

  const webhookEnqueueStart = Date.now();
  let webhookStatus: "pending" | "active" | "failed" = "pending";
  try {
    await enqueueWebhookSubscribeJob({
      wabaId,
      userId: user.id,
      whatsappAccountId: storedWABA.id,
      facebookAccountId: facebookAccount.id,
      correlationId: timer.correlationId,
    });
    void processWebhookSubscribeJobs(1).catch((workerError) => {
      console.error("[embedded-signup] immediate webhook worker failed", workerError);
    });
  } catch (enqueueError) {
    console.error("[embedded-signup] webhook enqueue failed", enqueueError);
    webhookStatus = "failed";
  }
  timer.record("webhook_enqueue", webhookEnqueueStart);

  const shouldRegisterPhoneOnConnect =
    process.env.WA_EMBEDDED_SIGNUP_REGISTER_PHONE_ON_CONNECT === "true";
  const phoneRegistrationResults = allPhoneNumbers.map((phone) => ({
    phoneNumberId: phone.phone_number_id,
    registered: false,
    skipped: !shouldRegisterPhoneOnConnect,
    errorMessage: shouldRegisterPhoneOnConnect
      ? "Phone registration not implemented on optimized path"
      : "Cloud API phone registration deferred",
  }));

  return jsonWithEmbeddedSignupPerf(
    {
      success: true,
      data: {
        facebookAccount: {
          ...facebookAccount,
          access_token: "[ENCRYPTED]",
        },
        whatsappAccount: {
          ...storedWABA,
          webhook_status: webhookStatus,
        },
        phoneNumbers: allPhoneNumbers,
        businessManagerLinked: !!businessManagerId,
        webhookStatus,
        phoneRegistration: phoneRegistrationResults,
        summary: {
          step: 2,
          description: "WhatsApp Embedded Signup completed",
          wabaName: storedWABA?.waba_name,
          phoneNumbersCount: allPhoneNumbers.length,
          previousStepCompleted: !!businessManagerId,
          allPhonesRegistered: false,
          registrationDeferred: !shouldRegisterPhoneOnConnect,
          setupDataComplete: hasCompleteSetupData(setupData),
        },
      },
    },
    timer,
  );
}
