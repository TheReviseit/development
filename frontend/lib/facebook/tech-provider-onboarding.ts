/**
 * Tech Provider Customer Onboarding Service
 *
 * Handles the complete onboarding flow for business customers after Embedded Signup:
 * 1. Exchange token code for business token
 * 2. Subscribe to webhooks on customer's WABA
 * 3. Register customer's phone number
 *
 * Documentation: https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-tech-providers
 */

import {
  createGraphAPIClient,
  MetaGraphAPIClient,
} from "@/lib/facebook/graph-api-client";

interface OnboardCustomerParams {
  code: string; // Authorization code from Embedded Signup
  wabaId: string; // WhatsApp Business Account ID
  phoneNumberId: string; // Business phone number ID
  pin?: string; // Optional 6-digit PIN for phone number (defaults to random)
}

interface OnboardingResult {
  success: boolean;
  businessToken?: string;
  webhookSubscribed?: boolean;
  phoneRegistered?: boolean;
  error?: string;
  details?: any;
}

export class TechProviderOnboardingService {
  /**
   * Complete customer onboarding flow
   */
  static async onboardCustomer(
    params: OnboardCustomerParams
  ): Promise<OnboardingResult> {
    const { code, wabaId, phoneNumberId, pin } = params;

    try {
      console.log("🚀 [Onboarding] Starting customer onboarding...", {
        wabaId,
        phoneNumberId,
        hasCode: !!code,
      });

      // Step 1: Exchange token code for business token
      console.log("📝 [Onboarding] Step 1: Exchanging token code...");
      const businessToken = await this.exchangeTokenForBusinessToken(code);

      if (!businessToken) {
        throw new Error("Failed to obtain business token");
      }

      console.log("✅ [Onboarding] Business token obtained");

      // Step 2: Subscribe to webhooks on customer's WABA
      console.log("📝 [Onboarding] Step 2: Subscribing to WABA webhooks...");
      const webhookSubscribed = await this.subscribeToWABAWebhooks(
        wabaId,
        businessToken
      );

      if (!webhookSubscribed) {
        console.warn(
          "⚠️ [Onboarding] Webhook subscription failed, but continuing..."
        );
      } else {
        console.log("✅ [Onboarding] Webhooks subscribed");
      }

      // Step 3: Register customer's phone number
      console.log("📝 [Onboarding] Step 3: Registering phone number...");
      const registrationPin = pin || this.generateRandomPin();
      const phoneRegistered = await this.registerPhoneNumber(
        phoneNumberId,
        businessToken,
        registrationPin
      );

      if (!phoneRegistered) {
        console.warn(
          "⚠️ [Onboarding] Phone registration failed, but customer can complete this manually"
        );
      } else {
        console.log("✅ [Onboarding] Phone number registered");
      }

      console.log("🎉 [Onboarding] Customer onboarding completed successfully");

      return {
        success: true,
        businessToken,
        webhookSubscribed,
        phoneRegistered,
      };
    } catch (error: any) {
      console.error("❌ [Onboarding] Onboarding failed:", error);
      return {
        success: false,
        error: error.message || "Onboarding failed",
        details: error,
      };
    }
  }

  /**
   * Step 1: Exchange token code for business integration system user access token
   */
  private static async exchangeTokenForBusinessToken(
    code: string
  ): Promise<string> {
    try {
      const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;

      if (!appId || !appSecret) {
        throw new Error("Facebook App ID or Secret not configured");
      }

      console.log("🔄 [Onboarding] Exchanging code for business token...");

      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        code: code,
      });

      const response = await fetch(
        `https://graph.facebook.com/v24.0/oauth/access_token?${params.toString()}`,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [Onboarding] Token exchange failed:", errorData);
        throw new Error(errorData.error?.message || "Failed to exchange token");
      }

      const data = await response.json();
      const businessToken = data.access_token;

      if (!businessToken) {
        throw new Error("No access token in response");
      }

      console.log("✅ [Onboarding] Business token obtained successfully");
      return businessToken;
    } catch (error: any) {
      console.error("❌ [Onboarding] Token exchange error:", error);
      throw error;
    }
  }

  /**
   * Step 2: Subscribe to webhooks on customer's WABA
   */
  private static async subscribeToWABAWebhooks(
    wabaId: string,
    businessToken: string
  ): Promise<boolean> {
    try {
      console.log(
        `🔄 [Onboarding] Subscribing to webhooks for WABA ${wabaId}...`
      );

      const response = await fetch(
        `https://graph.facebook.com/v24.0/${wabaId}/subscribed_apps`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${businessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error(
          "❌ [Onboarding] Webhook subscription failed:",
          errorData
        );
        return false;
      }

      const data = await response.json();
      console.log("✅ [Onboarding] Webhook subscription response:", data);

      return data.success === true;
    } catch (error: any) {
      console.error("❌ [Onboarding] Webhook subscription error:", error);
      return false;
    }
  }

  /**
   * Step 3: Register customer's phone number for Cloud API use
   */
  private static async registerPhoneNumber(
    phoneNumberId: string,
    businessToken: string,
    pin: string
  ): Promise<boolean> {
    try {
      console.log(
        `🔄 [Onboarding] Registering phone number ${phoneNumberId}...`
      );

      const response = await fetch(
        `https://graph.facebook.com/v24.0/${phoneNumberId}/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${businessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: pin,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [Onboarding] Phone registration failed:", errorData);
        return false;
      }

      const data = await response.json();
      console.log("✅ [Onboarding] Phone registration response:", data);

      return data.success === true;
    } catch (error: any) {
      console.error("❌ [Onboarding] Phone registration error:", error);
      return false;
    }
  }

  /**
   * Optional: Send test message to verify phone number is working
   */
  static async sendTestMessage(
    phoneNumberId: string,
    businessToken: string,
    recipientNumber: string,
    messageText: string = "Test message from your WhatsApp Business Account!"
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(
        `📤 [Onboarding] Sending test message from ${phoneNumberId} to ${recipientNumber}...`
      );

      const response = await fetch(
        `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${businessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientNumber,
            type: "text",
            text: {
              body: messageText,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [Onboarding] Test message failed:", errorData);
        return {
          success: false,
          error: errorData.error?.message || "Failed to send test message",
        };
      }

      const data = await response.json();
      const messageId = data.messages?.[0]?.id;

      console.log("✅ [Onboarding] Test message sent:", messageId);

      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      console.error("❌ [Onboarding] Test message error:", error);
      return {
        success: false,
        error: error.message || "Failed to send test message",
      };
    }
  }

  /**
   * Generate a random 6-digit PIN for phone number registration
   */
  private static generateRandomPin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
