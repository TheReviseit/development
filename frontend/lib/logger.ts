/**
 * Safe Logging Utility
 * Prevents sensitive data (PII, secrets) from being logged
 */

type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Mask email addresses for privacy
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";

  const maskedLocal =
    local.length > 2
      ? `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}`
      : `${local[0]}***`;

  return `${maskedLocal}@${domain}`;
}

/**
 * Recursively mask sensitive data in objects
 */
function maskSensitiveData(data: any): any {
  if (typeof data === "string") {
    // Mask email patterns
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return data.replace(emailRegex, (email) => maskEmail(email));
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  if (data && typeof data === "object") {
    const masked: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Sensitive keys to mask completely
      const sensitiveKeys = [
        "password",
        "token",
        "secret",
        "apiKey",
        "api_key",
        "api_secret",
        "accessToken",
        "refreshToken",
        "sessionId",
      ];

      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        masked[key] = "***REDACTED***";
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    return masked;
  }

  return data;
}

/**
 * Safe logger instance
 */
export const logger = {
  /**
   * Log informational message
   */
  info: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logData = data ? maskSensitiveData(data) : "";
    console.log(`[${timestamp}] [INFO] ${message}`, logData || "");
  },

  /**
   * Log warning message
   */
  warn: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logData = data ? maskSensitiveData(data) : "";
    console.warn(`[${timestamp}] [WARN] ${message}`, logData || "");
  },

  /**
   * Log error message
   * Only logs error message in production, full stack in development
   */
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();

    if (process.env.NODE_ENV === "production") {
      // In production, only log error message
      const errorMsg = error?.message || error || "";
      console.error(`[${timestamp}] [ERROR] ${message}`, errorMsg);
    } else {
      // In development, log full error details
      console.error(`[${timestamp}] [ERROR] ${message}`, {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      });
    }
  },

  /**
   * Log debug message (only in development)
   */
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV !== "production") {
      const timestamp = new Date().toISOString();
      const logData = data ? maskSensitiveData(data) : "";
      console.debug(`[${timestamp}] [DEBUG] ${message}`, logData || "");
    }
  },
};

/**
 * Example usage:
 *
 * import { logger } from "@/lib/logger";
 *
 * logger.info("User created", { email: "user@example.com", name: "John" });
 * // Output: [2025-12-10T...] [INFO] User created { email: "u***r@example.com", name: "John" }
 *
 * logger.error("Failed to send email", error);
 * // Production: [2025-12-10T...] [ERROR] Failed to send email Connection timeout
 * // Development: [2025-12-10T...] [ERROR] Failed to send email { message: "...", stack: "...", code: "..." }
 */
