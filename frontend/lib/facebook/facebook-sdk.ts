/**
 * Facebook SDK Integration
 * Handles Facebook Login and SDK initialization
 */

import { REQUIRED_FACEBOOK_PERMISSIONS } from "@/types/facebook-whatsapp.types";

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
        options?: { scope: string; auth_type?: string; return_scopes?: boolean }
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

      const scope = REQUIRED_FACEBOOK_PERMISSIONS.join(",");
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
          scope,
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
   * Uses Meta's pre-configured onboarding flow
   * @returns Promise with setup information
   */
  public async launchEmbeddedSignup(): Promise<{
    success: boolean;
    accessToken?: string;
    userID?: string;
    expiresIn?: number;
    grantedPermissions?: string[];
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

      window.FB.login(
        (response) => {
          console.log("🔵 [Facebook SDK] Embedded signup response:", response);
          console.log(
            "🔵 [Facebook SDK] Full response structure:",
            JSON.stringify(response, null, 2)
          );

          if (response.authResponse) {
            const { accessToken, userID, expiresIn } = response.authResponse;
            console.log(
              "✅ [Facebook SDK] Embedded signup successful, userID:",
              userID
            );
            console.log(
              "🔍 [Facebook SDK] Access token present:",
              !!accessToken
            );
            console.log(
              "🔍 [Facebook SDK] Auth response keys:",
              Object.keys(response.authResponse)
            );

            // Extract setup info from the response
            // Meta returns this data when user completes embedded signup
            const setupData: any = {};

            // The auth response may contain setup info in different formats
            // depending on Meta's API version
            if ((response.authResponse as any).code) {
              // If using authorization code flow
              setupData.code = (response.authResponse as any).code;
            }

            // Check if there's additional setup data in the response
            if ((response as any).setup) {
              Object.assign(setupData, (response as any).setup);
            }

            // Get granted permissions
            // Note: FB.api may fail on HTTP (localhost), so we handle this gracefully
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
                // If permissions check fails (common on HTTP/localhost),
                // we still have a valid auth response with token and userID
                console.warn(
                  "⚠️ [Facebook SDK] Failed to fetch permissions (likely due to HTTP restriction):",
                  error.message
                );
                console.log(
                  "✅ [Facebook SDK] Proceeding with auth data from response"
                );
                resolve({
                  success: true,
                  accessToken,
                  userID,
                  expiresIn,
                  grantedPermissions: ["public_profile", "email"], // Assume basic permissions
                  setupData,
                });
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
          scope: REQUIRED_FACEBOOK_PERMISSIONS.join(","),
          auth_type: "rerequest",
          return_scopes: true,
          config_id: configId,
          extras: {
            setup: {},
          },
        } as any
      );
    });
  }
}

// Export singleton instance
export const facebookSDK = FacebookSDK.getInstance();
