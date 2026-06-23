/**
 * Deterministic Idempotency Key Generator
 * =======================================
 * FAANG-grade idempotency key generation for billing operations.
 * 
 * Critical Requirements:
 * - Keys must be DETERMINISTIC for same operation (retries work)
 * - Keys must be UNIQUE across different operations
 * - Keys must include user context to prevent cross-user collisions
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

/**
 * Generate deterministic idempotency key for checkout.
 * 
 * Pattern: SHA256(userId + planSlug + timestamp_bucket)
 * 
 * Why deterministic?
 * - Same user + plan + time bucket = same key
 * - Network retry uses same key → idempotency hit
 * - Different time bucket = different key (allows re-subscription later)
 * 
 * @param userId - Firebase Auth user ID
 * @param planSlug - Plan being purchased (e.g., 'business')
 * @param tenantDomain - Domain context (e.g., 'shop')
 * @returns Deterministic idempotency key
 */
export async function generateCheckoutIdempotencyKey(
  userId: string,
  planSlug: string,
  tenantDomain: string
): Promise<string> {
  const timeBucket = getTimeBucket(1);
  const hash = await sha256Hex([userId, tenantDomain, planSlug, timeBucket].join(':'));
  return `chk_${hash.substring(0, 32)}`;
}

/**
 * Generate idempotency key for subscription modification.
 */
export async function generateSubscriptionModifyKey(
  userId: string,
  subscriptionId: string,
  action: 'cancel' | 'upgrade' | 'downgrade'
): Promise<string> {
  const timeBucket = getTimeBucket(1);
  const hash = await sha256Hex([userId, subscriptionId, action, timeBucket].join(':'));
  return `mod_${hash.substring(0, 32)}`;
}

/**
 * Generate idempotency key for payment retry.
 */
export async function generatePaymentRetryKey(
  userId: string,
  invoiceId: string
): Promise<string> {
  const timeBucket = getTimeBucket(0.083);
  const hash = await sha256Hex([userId, invoiceId, timeBucket].join(':'));
  return `retry_${hash.substring(0, 32)}`;
}

/**
 * Generate deterministic idempotency key for payment verification.
 * Used by the verify-subscription endpoint retry logic.
 *
 * Deterministic: same user + subscription + payment = same key
 * This ensures network retries hit the Redis idempotency cache.
 */
export async function generateVerifyIdempotencyKey(
  userId: string,
  razorpaySubscriptionId: string,
  razorpayPaymentId: string
): Promise<string> {
  const hash = await sha256Hex([userId, razorpaySubscriptionId, razorpayPaymentId].join(':'));
  return `ver_${hash.substring(0, 32)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getTimeBucket(hours: number): string {
  const now = new Date();
  const bucketMs = hours * 60 * 60 * 1000;
  const bucketTime = Math.floor(now.getTime() / bucketMs) * bucketMs;
  return new Date(bucketTime).toISOString().slice(0, 13);
}

/**
 * Validate idempotency key format.
 */
export function isValidIdempotencyKey(key: string): boolean {
  const pattern = /^(chk|mod|retry|ver)_[a-f0-9]{32}$/;
  return pattern.test(key);
}

/**
 * Extract components from idempotency key (for debugging).
 */
export function parseIdempotencyKey(key: string): {
  type: string;
  valid: boolean;
} {
  if (!isValidIdempotencyKey(key)) {
    return { type: 'invalid', valid: false };
  }
  const prefix = key.split('_')[0];
  const typeMap: Record<string, string> = {
    'chk': 'checkout',
    'mod': 'modify',
    'retry': 'retry',
    'ver': 'verify',
  };
  return {
    type: typeMap[prefix] || 'unknown',
    valid: true,
  };
}
