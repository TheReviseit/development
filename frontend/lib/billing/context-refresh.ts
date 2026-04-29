/**
 * Signed Context Refresh Handler
 * ==============================
 * Handles refresh of expired signed context for idle browsers.
 * 
 * Problem: Signed context has 5-minute TTL. If user is idle for 6+ minutes,
 * context expires and API calls fail.
 * 
 * Solution: Automatic refresh before expiration + user-friendly handling.
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

import { domainResolver, DomainContext } from '@/lib/domain/resolver';

const CONTEXT_REFRESH_THRESHOLD_MS = 4 * 60 * 1000; // Refresh at 4 minutes (before 5-min expiry)
const REFRESH_RETRY_ATTEMPTS = 3;
const REFRESH_RETRY_DELAY_MS = 1000;

interface ContextState {
  context: DomainContext | null;
  signedContext: string | null;
  obtainedAt: number;
  expiresAt: number;
}

let currentState: ContextState = {
  context: null,
  signedContext: null,
  obtainedAt: 0,
  expiresAt: 0,
};

let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Initialize context from server-provided data.
 * Call this on page load with the signed context from middleware.
 */
export async function initializeContext(signedContext: string): Promise<void> {
  const verified = await domainResolver.verifyContext(signedContext);
  
  if (!verified) {
    console.error('[ContextRefresh] Failed to verify initial context');
    return;
  }
  
  const now = Date.now();
  currentState = {
    context: verified,
    signedContext,
    obtainedAt: now,
    expiresAt: now + (5 * 60 * 1000), // 5-minute expiry
  };
  
  // Schedule refresh before expiry
  scheduleRefresh();
  
  console.log('[ContextRefresh] Context initialized, expires at:', new Date(currentState.expiresAt));
}

/**
 * Get current signed context (with automatic refresh if needed).
 */
export async function getSignedContext(): Promise<string | null> {
  const now = Date.now();
  
  // Check if context is still valid
  if (currentState.signedContext && now < currentState.expiresAt - 30000) {
    // Context valid for at least 30 more seconds
    return currentState.signedContext;
  }
  
  // Context expired or expiring soon - refresh
  if (now >= currentState.expiresAt) {
    console.log('[ContextRefresh] Context expired, refreshing...');
  } else {
    console.log('[ContextRefresh] Context expiring soon, proactive refresh...');
  }
  
  const refreshed = await refreshContext();
  return refreshed;
}

/**
 * Refresh context from server.
 */
async function refreshContext(): Promise<string | null> {
  try {
    // Call server to get fresh signed context
    const response = await fetch('/api/auth/refresh-context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });
    
    if (!response.ok) {
      throw new Error(`Refresh failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.signedContext) {
      throw new Error('No signed context in response');
    }
    
    // Verify and store new context
    const verified = await domainResolver.verifyContext(data.signedContext);
    if (!verified) {
      throw new Error('Refreshed context failed verification');
    }
    
    const now = Date.now();
    currentState = {
      context: verified,
      signedContext: data.signedContext,
      obtainedAt: now,
      expiresAt: now + (5 * 60 * 1000),
    };
    
    // Reschedule refresh
    scheduleRefresh();
    
    console.log('[ContextRefresh] Context refreshed successfully');
    return data.signedContext;
    
  } catch (error) {
    console.error('[ContextRefresh] Refresh failed:', error);
    return null;
  }
}

/**
 * Schedule automatic refresh before expiry.
 */
function scheduleRefresh(): void {
  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  
  const now = Date.now();
  const timeUntilRefresh = currentState.expiresAt - now - CONTEXT_REFRESH_THRESHOLD_MS;
  
  if (timeUntilRefresh > 0) {
    refreshTimer = setTimeout(() => {
      console.log('[ContextRefresh] Proactive refresh triggered');
      refreshContext();
    }, timeUntilRefresh);
  }
}

/**
 * Check if context is valid (for UI state).
 */
export function isContextValid(): boolean {
  return !!currentState.signedContext && Date.now() < currentState.expiresAt;
}

/**
 * Get context expiry info for UI display.
 */
export function getContextExpiryInfo(): {
  valid: boolean;
  expiresInSeconds: number;
  shouldWarn: boolean;
} {
  const now = Date.now();
  const expiresInMs = currentState.expiresAt - now;
  const expiresInSeconds = Math.max(0, Math.floor(expiresInMs / 1000));
  
  return {
    valid: expiresInMs > 0,
    expiresInSeconds,
    shouldWarn: expiresInMs < 60000, // Warn if less than 1 minute
  };
}

/**
 * Handle user activity to prevent expiry during active use.
 * Call this on user interactions (clicks, typing, etc).
 */
export function onUserActivity(): void {
  const now = Date.now();
  const timeUntilExpiry = currentState.expiresAt - now;
  
  // If context expires in less than 2 minutes and user is active, refresh
  if (timeUntilExpiry < 2 * 60 * 1000 && timeUntilExpiry > 0) {
    console.log('[ContextRefresh] User activity detected, refreshing context');
    refreshContext();
  }
}

/**
 * Cleanup on page unload.
 */
export function cleanupContext(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
