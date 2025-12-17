/**
 * Facebook SDK Integration
 * Handles Facebook Login and SDK initialization
 */

import {
  FACEBOOK_LOGIN_PERMISSIONS,
  WHATSAPP_EMBEDDED_SIGNUP_PERMISSIONS,
} from "@/types/facebook-whatsapp.types";

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: {
      init: (params: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
        status?: boolean;
      }) => void;
      login: (
        callback: (response: any) => void,
        options?: {
          scope: string;
          auth_type?: string;
          return_scopes?: boolean;
          config_id?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          redirect_uri?: string; // CRITICAL: Required for code exchange to work
          extras?: {
            setup?: Record<string, any>;
            feature?: string;
            sessionInfoVersion?: number;
          };
        }
      ) => void;
      logout: (callback: () => void) => void;
      getLoginStatus: (callback: (response: any) => void) => void;
      api: (
        path: string,
        method: string | Record<string, any>,
        params?: Record<string, any>,
        callback?: (response: any) => void
      ) => void;
    };
  }
}

class FacebookSDK {
  private static instance: FacebookSDK;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): FacebookSDK {
    if (!FacebookSDK.instance) {
      FacebookSDK.instance = new FacebookSDK();
    }
    return FacebookSDK.instance;
  }

  /**
   * Initialize Facebook SDK
   * Only call this once on page load
   */
  public async init(): Promise<void> {
    // Return existing promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.isInitialized) {
      return Promise.resolve();
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        // Check if app ID is configured
        const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
        console.log(
          "[Facebook SDK] Initializing with App ID:",
          appId ? `${appId.substring(0, 6)}...` : "MISSING"
        );

        if (!appId) {
          const error = new Error(
            "Facebook App ID not configured. Please set NEXT_PUBLIC_FACEBOOK_APP_ID in your .env file"
          );
          console.error("[Facebook SDK] Init failed:", error.message);
          reject(error);
          return;
        }

        // Check if SDK is already loaded
        if (window.FB) {
          console.log("[Facebook SDK] Already loaded, skipping initialization");
          this.isInitialized = true;
          resolve();
          return;
        }

        // Set timeout to prevent hanging forever
        const timeout = setTimeout(() => {
          const error = new Error(
            "Facebook SDK loading timeout. Check if the script is blocked by your browser or extensions."
          );
          console.error("[Facebook SDK] Timeout after 30s:", error.message);
          reject(error);
        }, 30000); // 30 second timeout

        // Load Facebook SDK script
        window.fbAsyncInit = () => {
          clearTimeout(timeout);
          console.log("[Facebook SDK] fbAsyncInit callback triggered");

          try {
            window.FB.init({
              appId: appId,
              cookie: true,
              xfbml: true,
              version: "v21.0", // Use latest stable version
              status: true,
            });

            console.log("[Facebook SDK] Initialized successfully");
            this.isInitialized = true;
            resolve();
          } catch (initError) {
            console.error("[Facebook SDK] FB.init() failed:", initError);
            reject(
              new Error(`Failed to initialize Facebook SDK: ${initError}`)
            );
          }
        };

        // Inject SDK script
        if (!document.getElementById("facebook-jssdk")) {
          console.log("[Facebook SDK] Injecting SDK script...");
          const script = document.createElement("script");
          script.id = "facebook-jssdk";
          script.src = "https://connect.facebook.net/en_US/sdk.js";
          script.async = true;
          script.defer = true;
          script.crossOrigin = "anonymous";

          script.onerror = (event) => {
            clearTimeout(timeout);
            const error = new Error(
              "Failed to load Facebook SDK script. Possible causes:\n" +
                "1. Network/internet connection issues\n" +
                "2. Browser extensions blocking Facebook (disable ad blockers)\n" +
                "3. Corporate firewall blocking connect.facebook.net\n" +
                "4. Script Content Security Policy restrictions"
            );
            console.error(
              "[Facebook SDK] Script load error:",
              error.message,
              event
            );
            reject(error);
          };

          script.onload = () => {
            console.log(
              "[Facebook SDK] Script file loaded, waiting for fbAsyncInit..."
            );
          };

          document.body.appendChild(script);
        } else {
          console.log("[Facebook SDK] Script already exists in DOM");
        }
      } catch (error) {
        console.error("[Facebook SDK] Initialization exception:", error);
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * Login with Facebook and request required permissions
   * @returns Promise with login response
   */
  public async login(): Promise<{
    success: boolean;
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
    grantedPermissions?: string[];
    error?: string;
  }> {
    await this.init();

    return new Promise((resolve) => {
      if (!window.FB) {
        resolve({ success: false, error: "Facebook SDK not loaded" });
        return;
      }

      const scope = FACEBOOK_LOGIN_PERMISSIONS.join(",");
      console.log("🔵 [Facebook SDK] Requesting permissions:", scope);

      window.FB.login(
        (response) => {
          console.log("🔵 [Facebook SDK] Login response:", response);

          if (response.authResponse) {
            const { accessToken, userID, expiresIn } = response.authResponse;
            console.log("✅ [Facebook SDK] Auth successful, userID:", userID);

            // Get granted permissions
            this.getGrantedPermissions(accessToken)
              .then((grantedPermissions) => {
                console.log(
                  "✅ [Facebook SDK] Granted permissions:",
                  grantedPermissions
                );
                resolve({
                  success: true,
                  accessToken,
                  userID,
                  expiresIn,
                  grantedPermissions,
                });
              })
              .catch((error) => {
                // If permissions check fails, assume basic permissions are granted
                // since Facebook login succeeded
                console.warn(
                  "⚠️ [Facebook SDK] Failed to fetch permissions, assuming basic permissions granted:",
                  error
                );
                resolve({
                  success: true,
                  accessToken,
                  userID,
                  expiresIn,
                  grantedPermissions: ["public_profile", "email"], // Assume basic permissions
                });
              });
          } else {
            const errorMsg =
              response.status === "not_authorized"
                ? "User cancelled login or did not fully authorize"
                : "Login failed";
            console.error(
              "❌ [Facebook SDK] Login failed:",
              errorMsg,
              response
            );
            resolve({
              success: false,
              error: errorMsg,
            });
          }
        },
        {
          scope: FACEBOOK_LOGIN_PERMISSIONS.join(","),
          auth_type: "rerequest", // Re-request declined permissions
          return_scopes: true,
        }
      );
    });
  }

  /**
   * Check current login status
   */
  public async getLoginStatus(): Promise<{
    connected: boolean;
    accessToken?: string;
    userID?: string;
  }> {
    await this.init();

    return new Promise((resolve) => {
      if (!window.FB) {
        resolve({ connected: false });
        return;
      }

      window.FB.getLoginStatus((response) => {
        if (response.status === "connected") {
          resolve({
            connected: true,
            accessToken: response.authResponse.accessToken,
            userID: response.authResponse.userID,
          });
        } else {
          resolve({ connected: false });
        }
      });
    });
  }

  /**
   * Logout from Facebook
   */
  public async logout(): Promise<void> {
    await this.init();

    return new Promise((resolve) => {
      if (!window.FB) {
        resolve();
        return;
      }

      window.FB.logout(() => {
        resolve();
      });
    });
  }

  /**
   * Get list of granted permissions
   */
  private async getGrantedPermissions(accessToken: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!window.FB) {
        reject(new Error("Facebook SDK not loaded"));
        return;
      }

      window.FB.api(
        "/me/permissions",
        "GET",
        { access_token: accessToken },
        (response) => {
          if (response && !response.error) {
            const granted = response.data
              .filter((perm: any) => perm.status === "granted")
              .map((perm: any) => perm.permission);
            resolve(granted);
          } else {
            reject(
              new Error(response.error?.message || "Failed to get permissions")
            );
          }
        }
      );
    });
  }

  /**
   * Check if specific permissions are granted
   */
  public async checkPermissions(requiredPermissions: string[]): Promise<{
    allGranted: boolean;
    missingPermissions: string[];
  }> {
    try {
      const status = await this.getLoginStatus();
      if (!status.connected || !status.accessToken) {
        return {
          allGranted: false,
          missingPermissions: requiredPermissions,
        };
      }

      const grantedPermissions = await this.getGrantedPermissions(
        status.accessToken
      );
      const missingPermissions = requiredPermissions.filter(
        (perm) => !grantedPermissions.includes(perm)
      );

      return {
        allGranted: missingPermissions.length === 0,
        missingPermissions,
      };
    } catch (error) {
      return {
        allGranted: false,
        missingPermissions: requiredPermissions,
      };
    }
  }

  /**
   * Launch Embedded Signup with Configuration
   * Uses Meta's pre-configured onboarding flow with Authorization Code Flow (v21+ required)
   * @returns Promise with setup information including authorization code for backend exchange
   */
  public async launchEmbeddedSignup(): Promise<{
    success: boolean;
    code?: string; // Authorization code for backend exchange
    accessToken?: string; // Fallback if token returned
    userID?: string;
    expiresIn?: number;
    grantedPermissions?: string[] | null; // null = unknown (HTTP limitation)
    setupData?: {
      businessId?: string;
      wabaId?: string;
      phoneNumberId?: string;
    };
    error?: string;
  }> {
    await this.init();

    const configId = process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID;
    if (!configId) {
      return {
        success: false,
        error:
          "Facebook Configuration ID not set. Please set NEXT_PUBLIC_FACEBOOK_CONFIG_ID",
      };
    }

    return new Promise((resolve) => {
      if (!window.FB) {
        resolve({ success: false, error: "Facebook SDK not loaded" });
        return;
      }

      // Log the redirect_uri being used - use origin only to avoid trailing slash issues
      const redirectUri =
        typeof window !== "undefined"
          ? window.location.origin + "/"
          : undefined;
      console.log(
        "🔵 [Facebook SDK] Using redirect_uri for OAuth:",
        redirectUri
      );

      window.FB.login(
        (response) => {
          console.log("🔵 [Facebook SDK] Embedded signup response:", response);
          console.log(
            "🔵 [Facebook SDK] Full response structure:",
            JSON.stringify(response, null, 2)
          );

          if (response.authResponse) {
            // IMPORTANT: With response_type=code (Authorization Code Flow),
            // authResponse contains 'code' instead of 'accessToken'
            const authCode = (response.authResponse as any).code;
            const accessToken = response.authResponse.accessToken;
            const userID = response.authResponse.userID;
            const expiresIn = response.authResponse.expiresIn;

            console.log("✅ [Facebook SDK] Embedded signup successful");
            console.log(
              "🔍 [Facebook SDK] Authorization code present:",
              !!authCode
            );
            console.log(
              "🔍 [Facebook SDK] Access token present:",
              !!accessToken
            );
            console.log("🔍 [Facebook SDK] User ID:", userID);
            console.log(
              "🔍 [Facebook SDK] Auth response keys:",
              Object.keys(response.authResponse)
            );

            // ================================================================
            // CRITICAL: Extract setup info from the ROOT level of the response
            // Meta returns business_id, waba_id, phone_number_id at the ROOT
            // of the FB.login() callback response, NOT inside authResponse
            // ================================================================

            // Log the FULL response structure to help debug
            console.log(
              "🔍 [Facebook SDK] Full response keys:",
              Object.keys(response)
            );
            console.log(
              "🔍 [Facebook SDK] Checking root-level IDs from Meta..."
            );

            // Extract IDs from root level (this is where Meta puts them)
            const businessId = (response as any).business_id || undefined;
            const wabaId = (response as any).waba_id || undefined;
            const phoneNumberId =
              (response as any).phone_number_id || undefined;

            // Log what we found
            console.log("✅ [Facebook SDK] Extracted from root level:", {
              business_id: businessId || "NOT FOUND",
              waba_id: wabaId || "NOT FOUND",
              phone_number_id: phoneNumberId || "NOT FOUND",
            });

            // Build setupData object with all captured IDs
            const setupData: {
              businessId?: string;
              wabaId?: string;
              phoneNumberId?: string;
            } = {
              businessId,
              wabaId,
              phoneNumberId,
            };

            // Warn if critical IDs are missing
            if (!wabaId) {
              console.warn(
                "⚠️ [Facebook SDK] waba_id NOT found in response!",
                "This may cause 'No WhatsApp Business Account found' error.",
                "Full response:",
                JSON.stringify(response, null, 2)
              );
            }

            console.log("🔍 [Facebook SDK] Final setupData:", setupData);

            if (authCode) {
              console.log(
                "✅ [Facebook SDK] Using Authorization Code Flow (v21+ compliant)"
              );
              resolve({
                success: true,
                code: authCode,
                userID,
                grantedPermissions: null,
                setupData,
              });
              return;
            }

            // Fallback: If we got an access token (Implicit Flow - deprecated but may still work)
            if (accessToken) {
              console.warn(
                "⚠️ [Facebook SDK] Using Implicit Flow fallback - consider updating to Code Flow"
              );

              // Get granted permissions (may fail on HTTP)
              this.getGrantedPermissions(accessToken)
                .then((grantedPermissions) => {
                  console.log(
                    "✅ [Facebook SDK] Granted permissions:",
                    grantedPermissions
                  );
                  resolve({
                    success: true,
                    accessToken,
                    userID,
                    expiresIn,
                    grantedPermissions,
                    setupData,
                  });
                })
                .catch((error) => {
                  console.warn(
                    "⚠️ [Facebook SDK] Failed to fetch permissions:",
                    error.message
                  );
                  console.log(
                    "⚠️ [Facebook SDK] This is normal on HTTP/localhost. Backend will validate."
                  );

                  // Return NULL to indicate "unknown" rather than "none granted"
                  resolve({
                    success: true,
                    accessToken,
                    userID,
                    expiresIn,
                    grantedPermissions: null,
                    setupData,
                  });
                });
              return;
            }

            // Neither code nor token - unexpected state
            console.error(
              "❌ [Facebook SDK] No code or accessToken in response"
            );
            resolve({
              success: false,
              error: "Authentication response missing code or accessToken",
            });
          } else {
            const errorMsg =
              response.status === "not_authorized"
                ? "User cancelled or did not complete the setup"
                : "Login failed";
            console.error(
              "❌ [Facebook SDK] Embedded signup failed:",
              errorMsg,
              response
            );
            resolve({
              success: false,
              error: errorMsg,
            });
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          scope: WHATSAPP_EMBEDDED_SIGNUP_PERMISSIONS.join(","),
          redirect_uri:
            typeof window !== "undefined"
              ? window.location.origin + "/"
              : undefined,
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: 2,
          },
        }
      );
    });
  }

  public async loginForBusiness(): Promise<{
    success: boolean;
    code?: string;
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
    grantedPermissions?: string[] | null;
    error?: string;
  }> {
    await this.init();

    return new Promise((resolve) => {
      if (!window.FB) {
        resolve({ success: false, error: "Facebook SDK not loaded" });
        return;
      }

      const scope = FACEBOOK_LOGIN_PERMISSIONS.join(",");

      console.log(
        "🔵 [Facebook SDK] loginForBusiness - Requesting permissions:",
        scope
      );
      console.log("🔵 [Facebook SDK] NOTE: No config_id used for this flow");

      const redirectUri =
        typeof window !== "undefined"
          ? window.location.origin + "/"
          : undefined;
      console.log("🔵 [Facebook SDK] Using redirect_uri:", redirectUri);

      window.FB.login(
        (response) => {
          console.log("🔵 [Facebook SDK] loginForBusiness response:", response);

          if (response.authResponse) {
            const authCode = (response.authResponse as any).code;
            const accessToken = response.authResponse.accessToken;
            const userID = response.authResponse.userID;
            const expiresIn = response.authResponse.expiresIn;

            console.log("✅ [Facebook SDK] loginForBusiness successful");
            console.log(
              "🔍 [Facebook SDK] Authorization code present:",
              !!authCode
            );
            console.log(
              "🔍 [Facebook SDK] Access token present:",
              !!accessToken
            );
            console.log("🔍 [Facebook SDK] User ID:", userID);

            if (authCode) {
              console.log("✅ [Facebook SDK] Using Authorization Code Flow");
              resolve({
                success: true,
                code: authCode,
                userID,
                grantedPermissions: null,
              });
              return;
            }

            if (accessToken) {
              console.warn("⚠️ [Facebook SDK] Using Implicit Flow fallback");
              this.getGrantedPermissions(accessToken)
                .then((grantedPermissions) => {
                  resolve({
                    success: true,
                    accessToken,
                    userID,
                    expiresIn,
                    grantedPermissions,
                  });
                })
                .catch(() => {
                  resolve({
                    success: true,
                    accessToken,
                    userID,
                    expiresIn,
                    grantedPermissions: null,
                  });
                });
              return;
            }

            resolve({
              success: false,
              error: "No code or accessToken in response",
            });
          } else {
            const errorMsg =
              response.status === "not_authorized"
                ? "User cancelled or did not authorize"
                : "Login failed";
            console.error(
              "❌ [Facebook SDK] loginForBusiness failed:",
              errorMsg
            );
            resolve({
              success: false,
              error: errorMsg,
            });
          }
        },
        {
          response_type: "code",
          override_default_response_type: true,
          scope,
          auth_type: "rerequest",
          return_scopes: true,
          redirect_uri: redirectUri,
        }
      );
    });
  }
}

export const facebookSDK = FacebookSDK.getInstance();
