/**
 * Order ID Generation Utility
 * ===========================
 * Centralized, consistent order_id generation for enterprise-grade order management.
 *
 * FORMAT: First 8 characters of UUID, UPPERCASE
 * EXAMPLE: "28C2CF22"
 *
 * This utility ensures the SAME format is used across:
 * - Frontend API routes (Next.js)
 * - Backend services (Python)
 * - Database triggers (PostgreSQL)
 *
 * IMPORTANT: The database has a trigger that auto-generates order_id,
 * but we also generate it client-side as a defensive mechanism.
 */

/**
 * Generates a short, human-readable order ID from a UUID.
 *
 * @param uuid - The full UUID (e.g., "28c2cf22-1234-5678-9abc-def012345678")
 * @returns Short order ID (e.g., "28C2CF22")
 *
 * @example
 * const orderId = generateOrderId("28c2cf22-1234-5678-9abc-def012345678");
 * // Returns: "28C2CF22"
 */
export function generateOrderId(uuid: string): string {
  if (!uuid || typeof uuid !== "string") {
    // Fallback: Generate timestamp-based ID if UUID is invalid
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${timestamp.slice(-4)}${random}`.slice(0, 8);
  }

  // Remove hyphens and take first 8 characters, then uppercase
  const cleanUuid = uuid.replace(/-/g, "");
  return cleanUuid.substring(0, 8).toUpperCase();
}

/**
 * Generates invoice number from order_id.
 *
 * @param orderId - The short order ID (e.g., "28C2CF22")
 * @returns Invoice number (e.g., "INV-28C2CF22")
 */
export function generateInvoiceNumber(orderId: string): string {
  return `INV-${orderId}`;
}

/**
 * Validates that an order_id matches the expected format.
 *
 * @param orderId - The order ID to validate
 * @returns true if valid format, false otherwise
 */
export function isValidOrderId(orderId: string): boolean {
  if (!orderId || typeof orderId !== "string") {
    return false;
  }

  // Format: 8 uppercase alphanumeric characters
  const orderIdRegex = /^[A-Z0-9]{8}$/;
  return orderIdRegex.test(orderId);
}

/**
 * Normalizes an order_id to the standard format.
 * Useful when order_id might come from different sources.
 *
 * @param orderId - The order ID to normalize
 * @returns Normalized order ID (uppercase, trimmed)
 */
export function normalizeOrderId(orderId: string): string {
  if (!orderId || typeof orderId !== "string") {
    return "";
  }

  return orderId.trim().toUpperCase().slice(0, 8);
}
