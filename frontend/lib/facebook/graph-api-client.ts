/**
 * Meta Graph API Client
 * Handles communication with Facebook Graph API
 * Server-side only - includes access token handling
 */

import {
  MetaBusinessManager,
  MetaWhatsAppBusinessAccount,
  MetaPhoneNumber,
  MetaGraphAPIResponse,
  MetaGraphAPIError,
} from "@/types/facebook-whatsapp.types";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphAPIClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Make a GET request to Graph API
   */
  private async get<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${GRAPH_API_BASE_URL}${endpoint}`);

    // Add access token
    url.searchParams.append("access_token", this.accessToken);

    // Add additional params
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw this.handleError(data.error || data);
    }

    return data;
  }

  /**
   * Make a POST request to Graph API
   */
  private async post<T>(
    endpoint: string,
    body: Record<string, any> = {}
  ): Promise<T> {
    const url = new URL(`${GRAPH_API_BASE_URL}${endpoint}`);
    url.searchParams.append("access_token", this.accessToken);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw this.handleError(data.error || data);
    }

    return data;
  }

  /**
   * Handle Graph API errors with detailed context
   */
  private handleError(error: MetaGraphAPIError): Error {
    const message = error.message || "Unknown Graph API error";
    const code = error.code || 0;
    const subcode = error.error_subcode || 0;
    const type = error.type || "UnknownError";
    const traceId = error.fbtrace_id || "N/A";

    // Map common error codes to user-friendly messages
    let userMessage = message;

    switch (code) {
      case 190: // Invalid token
        userMessage =
          "Your Facebook session has expired. Please reconnect your account.";
        break;
      case 200: // Permission error
      case 10: // Permission denied
        userMessage =
          "Missing required permissions. Please grant all requested permissions when connecting.";
        break;
      case 4: // Rate limit
      case 17: // Rate limit
      case 32: // Rate limit
      case 613: // Rate limit
        userMessage = "Too many requests. Please wait a moment and try again.";
        break;
      case 368: // Temporarily blocked
        userMessage =
          "Your account is temporarily blocked from this action. Please try again later.";
        break;
      case 100: // Invalid parameter
        userMessage = `Invalid request: ${message}`;
        break;
      case 803: // Some of the aliases you requested do not exist
      case 804: // Cannot access the object
        userMessage =
          "The requested WhatsApp resource was not found or is not accessible.";
        break;
      default:
        userMessage = message;
    }

    const errorObj = new Error(userMessage);
    (errorObj as any).originalMessage = message;
    (errorObj as any).code = code;
    (errorObj as any).subcode = subcode;
    (errorObj as any).type = type;
    (errorObj as any).traceId = traceId;

    return errorObj;
  }

  /**
   * Get user's basic profile information
   */
  public async getUserProfile(): Promise<{
    id: string;
    name: string;
    email?: string;
  }> {
    const data = await this.get<{
      id: string;
      name: string;
      email?: string;
    }>("/me", { fields: "id,name,email" });

    return data;
  }

  /**
   * Get user's Business Managers
   * These are the businesses the user has access to
   */
  public async getBusinessManagers(): Promise<MetaBusinessManager[]> {
    const response = await this.get<MetaGraphAPIResponse<MetaBusinessManager>>(
      "/me/businesses",
      { fields: "id,name,created_time,verification_status,permitted_roles" }
    );

    return response.data || [];
  }

  /**
   * Get WhatsApp Business Accounts owned by a Business Manager
   */
  public async getWhatsAppBusinessAccounts(
    businessId: string
  ): Promise<MetaWhatsAppBusinessAccount[]> {
    const response = await this.get<
      MetaGraphAPIResponse<MetaWhatsAppBusinessAccount>
    >(`/${businessId}/owned_whatsapp_business_accounts`, {
      fields:
        "id,name,account_review_status,business_verification_status,currency,message_template_namespace,quality_rating,timezone_id",
    });

    return response.data || [];
  }

  /**
   * Get phone numbers associated with a WhatsApp Business Account
   */
  public async getPhoneNumbers(wabaId: string): Promise<MetaPhoneNumber[]> {
    const response = await this.get<MetaGraphAPIResponse<MetaPhoneNumber>>(
      `/${wabaId}/phone_numbers`,
      {
        fields:
          "id,display_phone_number,verified_name,quality_rating,code_verification_status,is_official_business_account,platform_type",
      }
    );

    return response.data || [];
  }

  /**
   * Send a WhatsApp message
   */
  public async sendWhatsAppMessage(
    phoneNumberId: string,
    to: string,
    message: string
  ): Promise<{
    messaging_product: string;
    contacts: Array<{ input: string; wa_id: string }>;
    messages: Array<{ id: string }>;
  }> {
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };

    const response = await this.post<{
      messaging_product: string;
      contacts: Array<{ input: string; wa_id: string }>;
      messages: Array<{ id: string }>;
    }>(`/${phoneNumberId}/messages`, body);

    return response;
  }

  /**
   * Send a WhatsApp template message
   */
  public async sendTemplateMessage(
    phoneNumberId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: Array<{
      type: "header" | "body" | "button";
      parameters: Array<{
        type:
          | "text"
          | "currency"
          | "date_time"
          | "image"
          | "document"
          | "video";
        text?: string;
        currency?: {
          fallback_value: string;
          code: string;
          amount_1000: number;
        };
        date_time?: { fallback_value: string };
        image?: { link: string };
        document?: { link: string; filename: string };
        video?: { link: string };
      }>;
    }>
  ): Promise<{
    messaging_product: string;
    contacts: Array<{ input: string; wa_id: string }>;
    messages: Array<{ id: string }>;
  }> {
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: components || [],
      },
    };

    const response = await this.post<{
      messaging_product: string;
      contacts: Array<{ input: string; wa_id: string }>;
      messages: Array<{ id: string }>;
    }>(`/${phoneNumberId}/messages`, body);

    return response;
  }

  /**
   * Get WhatsApp Business Account details
   */
  public async getWABADetails(
    wabaId: string
  ): Promise<MetaWhatsAppBusinessAccount> {
    const data = await this.get<MetaWhatsAppBusinessAccount>(`/${wabaId}`, {
      fields:
        "id,name,account_review_status,business_verification_status,currency,message_template_namespace,quality_rating,timezone_id",
    });

    return data;
  }

  /**
   * Get phone number details
   */
  public async getPhoneNumberDetails(
    phoneNumberId: string
  ): Promise<MetaPhoneNumber> {
    const data = await this.get<MetaPhoneNumber>(`/${phoneNumberId}`, {
      fields:
        "id,display_phone_number,verified_name,quality_rating,code_verification_status,is_official_business_account,platform_type",
    });

    return data;
  }

  /**
   * Register a webhook for WhatsApp messages
   */
  public async subscribeToWebhook(
    wabaId: string,
    callbackUrl: string,
    verifyToken: string,
    fields: string[] = ["messages"]
  ): Promise<{ success: boolean }> {
    const body = {
      override_callback_uri: callbackUrl,
      verify_token: verifyToken,
      subscribed_fields: fields,
    };

    const response = await this.post<{ success: boolean }>(
      `/${wabaId}/subscribed_apps`,
      body
    );

    return response;
  }

  /**
   * Get message templates for a WABA
   */
  public async getMessageTemplates(wabaId: string): Promise<
    Array<{
      name: string;
      language: string;
      status: string;
      category: string;
      id: string;
    }>
  > {
    const response = await this.get<
      MetaGraphAPIResponse<{
        name: string;
        language: string;
        status: string;
        category: string;
        id: string;
      }>
    >(`/${wabaId}/message_templates`, {
      fields: "name,language,status,category,id",
    });

    return response.data || [];
  }

  /**
   * Validate access token using /debug_token endpoint
   *
   * CRITICAL: /debug_token requires App Access Token (app_id|app_secret) as the
   * access_token parameter, NOT a user access token. The input_token parameter
   * is the token being inspected (the user token).
   *
   * @see https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-session-info
   */
  public async validateToken(): Promise<{
    isValid: boolean;
    app_id?: string;
    application?: string;
    expires_at?: number;
    user_id?: string;
    scopes?: string[];
    error?: string;
  }> {
    try {
      const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;

      if (!appId || !appSecret) {
        console.error("❌ [validateToken] Missing Facebook App credentials");
        return { isValid: false, error: "Missing app credentials" };
      }

      // App Access Token format: {app_id}|{app_secret}
      const appAccessToken = `${appId}|${appSecret}`;

      const url = new URL(`${GRAPH_API_BASE_URL}/debug_token`);
      // CRITICAL: access_token must be App Access Token, NOT user token
      url.searchParams.append("access_token", appAccessToken);
      // input_token is the user token we want to validate
      url.searchParams.append("input_token", this.accessToken);

      console.log(
        "🔍 [validateToken] Calling /debug_token with App Access Token..."
      );

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error(
          "❌ [validateToken] API error:",
          data.error?.message || data
        );
        return {
          isValid: false,
          error: data.error?.message || "Token validation API error",
        };
      }

      const tokenData = data.data;

      // Validate that the token belongs to our app
      if (tokenData.app_id !== appId) {
        console.error(
          "❌ [validateToken] Token app_id mismatch!",
          `Expected: ${appId}, Got: ${tokenData.app_id}`
        );
        return {
          isValid: false,
          error: `Token belongs to different app (${tokenData.app_id})`,
        };
      }

      console.log("✅ [validateToken] Token validation result:", {
        is_valid: tokenData.is_valid,
        app_id: tokenData.app_id,
        user_id: tokenData.user_id,
        expires_at: tokenData.expires_at
          ? new Date(tokenData.expires_at * 1000).toISOString()
          : "never/unknown",
        scopes: tokenData.scopes,
      });

      return {
        isValid: tokenData.is_valid === true,
        app_id: tokenData.app_id,
        application: tokenData.application,
        expires_at: tokenData.expires_at,
        user_id: tokenData.user_id,
        scopes: tokenData.scopes,
      };
    } catch (error: any) {
      console.error("❌ [validateToken] Exception:", error.message);
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  public static async exchangeToken(shortLivedToken: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error("Facebook App credentials not configured");
    }

    const url = new URL(`${GRAPH_API_BASE_URL}/oauth/access_token`);
    url.searchParams.append("grant_type", "fb_exchange_token");
    url.searchParams.append("client_id", appId);
    url.searchParams.append("client_secret", appSecret);
    url.searchParams.append("fb_exchange_token", shortLivedToken);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error?.message || "Token exchange failed");
    }

    return data;
  }
}

/**
 * Helper function to create a Graph API client with a user's access token
 */
export function createGraphAPIClient(accessToken: string): MetaGraphAPIClient {
  return new MetaGraphAPIClient(accessToken);
}
