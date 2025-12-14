/**
 * Security Utilities for Facebook/WhatsApp Integration
 * CSRF protection, OAuth state validation, and webhook signature verification
 */

import crypto from 'crypto';

/**
 * Generate a secure random state for OAuth flow
 * Used to prevent CSRF attacks during Facebook Login
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Validate OAuth state
 * Compares the state returned from OAuth provider with the expected state
 */
export function validateOAuthState(
  receivedState: string,
  expectedState: string
): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedState),
      Buffer.from(expectedState)
    );
  } catch {
    return false;
  }
}

/**
 * Verify Meta webhook signature
 * Meta signs all webhook requests with your app secret
 */
export function verifyMetaWebhookSignature(
  payload: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature || !appSecret) {
    return false;
  }

  try {
    // Remove 'sha256=' prefix if present
    const signatureHash = signature.replace('sha256=', '');

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    // Compare using timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signatureHash),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a secure webhook verify token
 * Used during webhook setup with Meta
 */
export function generateWebhookVerifyToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a value for storage (one-way)
 * Useful for storing verification tokens that don't need to be decrypted
 */
export function hashValue(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

/**
 * Sanitize phone number to E.164 format
 * Removes all non-digit characters
 */
export function sanitizePhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Ensure it starts with country code (no + sign)
  return digits;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  const sanitized = sanitizePhoneNumber(phoneNumber);
  
  // E.164 format: 1-15 digits
  return /^\d{1,15}$/.test(sanitized);
}

/**
 * Rate limiting helper
 * Simple in-memory rate limiter (use Redis in production)
 */
class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  /**
   * Check if an identifier has exceeded the rate limit
   */
  public checkLimit(
    identifier: string,
    maxAttempts: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    // No previous attempts or window expired
    if (!record || now > record.resetTime) {
      const resetTime = now + windowMs;
      this.attempts.set(identifier, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: maxAttempts - 1,
        resetTime,
      };
    }

    // Increment attempt count
    if (record.count < maxAttempts) {
      record.count++;
      return {
        allowed: true,
        remaining: maxAttempts - record.count,
        resetTime: record.resetTime,
      };
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  /**
   * Reset attempts for an identifier
   */
  public reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Clear all expired entries (cleanup)
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.attempts.entries()) {
      if (now > value.resetTime) {
        this.attempts.delete(key);
      }
    }
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);
}

/**
 * Validate Facebook access token format
 */
export function isValidFacebookToken(token: string): boolean {
  // Facebook tokens are typically alphanumeric with some special chars
  // Length varies but usually 100-300 characters
  return /^[A-Za-z0-9_\-|]+$/.test(token) && token.length >= 50;
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars) {
    return '*'.repeat(data.length);
  }
  
  return data.substring(0, visibleChars) + '*'.repeat(data.length - visibleChars);
}

/**
 * Check if token is expired or expiring soon
 */
export function isTokenExpiringSoon(
  expiresAt: string | null,
  thresholdDays: number = 7
): { expired: boolean; expiringSoon: boolean; daysUntilExpiry: number } {
  if (!expiresAt) {
    return { expired: false, expiringSoon: false, daysUntilExpiry: Infinity };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysUntilExpiry = Math.floor(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    expired: expiry < now,
    expiringSoon: daysUntilExpiry <= thresholdDays && daysUntilExpiry >= 0,
    daysUntilExpiry,
  };
}

/**
 * Validate Meta permissions
 * Returns missing required permissions
 */
export function validateMetaPermissions(
  grantedPermissions: string[],
  requiredPermissions: string[]
): {
  valid: boolean;
  missingPermissions: string[];
} {
  const missing = requiredPermissions.filter(
    (perm) => !grantedPermissions.includes(perm)
  );

  return {
    valid: missing.length === 0,
    missingPermissions: missing,
  };
}

/**
 * Validate webhook payload structure
 */
export function isValidWhatsAppWebhook(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  // Check required fields
  if (payload.object !== 'whatsapp_business_account') {
    return false;
  }

  if (!Array.isArray(payload.entry)) {
    return false;
  }

  return true;
}

/**
 * Generate CSRF token for form submissions
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(
  receivedToken: string,
  storedToken: string
): boolean {
  if (!receivedToken || !storedToken) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedToken),
      Buffer.from(storedToken)
    );
  } catch {
    return false;
  }
}

