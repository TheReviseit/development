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

import { createHash } from 'crypto';

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
export function generateCheckoutIdempotencyKey(
  userId: string,
  planSlug: string,
  tenantDomain: string
): string {
  // Time bucket: 1-hour window
  // Same user trying same plan within 1 hour = same key (prevents duplicates)
  // After 1 hour = new key (allows re-subscription)
  const timeBucket = getTimeBucket(1); // 1-hour buckets
  
  // Deterministic components
  const components = [
    userId,
    tenantDomain,
    planSlug,
    timeBucket,
  ].join(':');
  
  // Hash for fixed length and format
  const hash = createHash('sha256')
    .update(components)
    .digest('hex')
    .substring(0, 32); // 32 chars is enough
  
  // Prefix for readability
  return `chk_${hash}`;
}

/**
 * Generate idempotency key for subscription modification.
 */
export function generateSubscriptionModifyKey(
  userId: string,
  subscriptionId: string,
  action: 'cancel' | 'upgrade' | 'downgrade'
): string {
  const timeBucket = getTimeBucket(1); // 1-hour window
  
  const components = [
    userId,
    subscriptionId,
    action,
    timeBucket,
  ].join(':');
  
  const hash = createHash('sha256')
    .update(components)
    .digest('hex')
    .substring(0, 32);
  
  return `mod_${hash}`;
}

/**
 * Generate idempotency key for payment retry.
 */
export function generatePaymentRetryKey(
  userId: string,
  invoiceId: string
): string {
  // Shorter bucket for retries (5 minutes)
  const timeBucket = getTimeBucket(0.083); // 5-minute buckets
  
  const components = [
    userId,
    invoiceId,
    timeBucket,
  ].join(':');
  
  const hash = createHash('sha256')
    .update(components)
    .digest('hex')
    .substring(0, 32);
  
  return `retry_${hash}`;
}

/**
 * Get time bucket for grouping operations.
 * 
 * @param hours - Bucket size in hours (1 = 1-hour buckets)
 * @returns Time bucket string (e.g., "2024-07-26-14" for 2pm hour)
 */
function getTimeBucket(hours: number): string {
  const now = new Date();
  const bucketMs = hours * 60 * 60 * 1000;
  const bucketTime = Math.floor(now.getTime() / bucketMs) * bucketMs;
  return new Date(bucketTime).toISOString().slice(0, 13); // YYYY-MM-DD-HH
}

/**
 * Validate idempotency key format.
 */
export function isValidIdempotencyKey(key: string): boolean {
  // Pattern: prefix_32hexchars
  const pattern = /^(chk|mod|retry)_[a-f0-9]{32}$/;
  return pattern.test(key);
}

/**
 * Extract components from idempotency key (for debugging).
 * Note: One-way hash, cannot reverse. Just validates format.
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
  };
  
  return {
    type: typeMap[prefix] || 'unknown',
    valid: true,
  };
}
