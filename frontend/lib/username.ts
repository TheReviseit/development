/**
 * Username Utilities
 * Frontend helpers for username validation, availability checking, and resolution
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Validate username format (client-side, no API call)
 */
export function validateUsernameFormat(username: string): {
  valid: boolean;
  error?: string;
} {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: "Username is required" };
  }

  const trimmed = username.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return {
      valid: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    };
  }

  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  const lowercase = trimmed.toLowerCase();

  if (!USERNAME_REGEX.test(lowercase)) {
    return {
      valid: false,
      error:
        "Username can only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphens)",
    };
  }

  if (lowercase.includes("--")) {
    return {
      valid: false,
      error: "Username cannot contain consecutive hyphens",
    };
  }

  return { valid: true };
}

/**
 * Check username availability (with server call)
 * Should be debounced on the calling side (300ms recommended)
 */
export async function checkUsernameAvailability(username: string): Promise<{
  available: boolean;
  valid: boolean;
  error?: string;
  suggestions?: string[];
}> {
  try {
    const response = await fetch("/api/username/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to check username availability:", error);
    return {
      available: false,
      valid: false,
      error: "Network error. Please try again.",
    };
  }
}

/**
 * Debounced version of checkUsernameAvailability
 * Use this in forms to avoid spamming the API
 */
export const checkUsernameAvailabilityDebounced = debounce(
  checkUsernameAvailability,
  300,
);

/**
 * Resolve username to user_id (for internal use)
 * Uses sessionStorage caching to avoid repeated lookups
 */
export async function resolveUsernameToUserId(
  username: string,
): Promise<string | null> {
  if (!username) return null;

  const cacheKey = `username:${username.toLowerCase()}`;

  // Check cache first
  if (typeof sessionStorage !== "undefined") {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { userId, timestamp } = JSON.parse(cached);
        // Cache valid for 5 minutes
        if (Date.now() - timestamp < 300000) {
          return userId;
        }
      } catch (e) {
        // Invalid cache, ignore
      }
    }
  }

  // Fetch from server (this would typically go through your store API)
  // For now, return null (will be implemented when integrating with store API)
  return null;
}

/**
 * Generate username from name
 * Sanitizes input to create a valid username base
 */
export function generateUsername(name: string): string {
  if (!name) return "";

  // Convert to lowercase
  let username = name.toLowerCase();

  // Replace spaces and underscores with hyphens
  username = username.replace(/[\s_]+/g, "-");

  // Remove all non-alphanumeric except hyphens
  username = username.replace(/[^a-z0-9-]/g, "");

  // Remove consecutive hyphens
  username = username.replace(/-+/g, "-");

  // Remove leading/trailing hyphens
  username = username.replace(/^-+|-+$/g, "");

  // Truncate to max length
  if (username.length > USERNAME_MAX_LENGTH) {
    username = username.substring(0, USERNAME_MAX_LENGTH).replace(/-+$/, "");
  }

  return username;
}

/**
 * Claim username (sets to pending)
 */
export async function claimUsername(username: string): Promise<{
  success: boolean;
  error?: string;
  status?: string;
}> {
  try {
    const response = await fetch("/api/username/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to claim username:", error);
    return {
      success: false,
      error: "Network error. Please try again.",
    };
  }
}

/**
 * Confirm pending username (activates it)
 */
export async function confirmUsername(): Promise<{
  success: boolean;
  error?: string;
  username?: string;
}> {
  try {
    const response = await fetch("/api/username/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to confirm username:", error);
    return {
      success: false,
      error: "Network error. Please try again.",
    };
  }
}

/**
 * Get current user's username status
 */
export async function getCurrentUsername(): Promise<{
  success: boolean;
  username?: string;
  status?: string;
  changeCount?: number;
  canChange?: boolean;
  error?: string;
}> {
  try {
    const response = await fetch("/api/username/current");
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to get current username:", error);
    return {
      success: false,
      error: "Network error. Please try again.",
    };
  }
}

/**
 * Get username suggestions
 */
export async function getUsernameSuggestions(base: string): Promise<string[]> {
  try {
    const response = await fetch("/api/username/suggest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ base }),
    });

    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    console.error("Failed to get username suggestions:", error);
    return [];
  }
}
