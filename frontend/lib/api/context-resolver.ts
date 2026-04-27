/**
 * Context Resolver - Production-Grade Domain Resolution
 * ======================================================
 * 
 * FAANG-level context resolution for API route handlers.
 * Runs in Node.js runtime (not Edge Runtime) for full capabilities.
 * 
 * Responsibilities:
 * - Resolve domain from request Host header
 * - Extract userId from session/JWT
 * - Sign context with HMAC for backend verification
 * - Return unified context object for all API routes
 * 
 * Architecture:
 * This module is the SINGLE source of truth for domain/context resolution.
 * Called at the START of every API route handler that needs domain context.
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 * @runtime Node.js (not Edge Runtime)
 */

import { NextRequest } from 'next/server';
import { domainResolver, DomainContext, ProductDomain } from '@/lib/domain/resolver';
import { verifySessionCookieSafe } from '@/lib/firebase-admin';

// =============================================================================
// TYPES
// =============================================================================

export interface ContextResolutionResult {
  matched: boolean;
  signedContext?: string;
  domain?: ProductDomain;
  tenantId?: string;
  userId?: string;
  error?: string;
  attemptedHost?: string;
}

export interface ResolvedContext extends DomainContext {
  signedContext: string;
  userId?: string;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

class ContextResolutionError extends Error {
  constructor(
    message: string,
    public code: string,
    public attemptedHost?: string
  ) {
    super(message);
    this.name = 'ContextResolutionError';
  }
}

// =============================================================================
// MAIN RESOLVER FUNCTION
// =============================================================================

/**
 * Resolve domain context from request.
 * 
 * This is the SINGLE source of truth for domain resolution across all API routes.
 * Runs in Node.js runtime (not Edge) for full access to crypto and database.
 * 
 * @param request - NextRequest object from API route handler
 * @returns ContextResolutionResult with signed context or error
 * 
 * @example
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const context = await resolveContext(request);
 *   
 *   if (!context.matched) {
 *     return NextResponse.json(
 *       { error: context.error },
 *       { status: 400 }
 *     );
 *   }
 *   
 *   // Use context.signedContext, context.domain, context.tenantId
 * }
 * ```
 */
export async function resolveContext(
  request: NextRequest
): Promise<ContextResolutionResult> {
  const requestId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  try {
    // -------------------------------------------------------------------------
    // STEP 1: Resolve domain from request
    // -------------------------------------------------------------------------
    const resolution = domainResolver.resolve(request);
    
    if (!resolution.matched || !resolution.context) {
      console.error(`[ContextResolver] ${requestId} - Resolution failed: ${resolution.error}`);
      return {
        matched: false,
        error: resolution.error || 'Domain not recognized',
        attemptedHost: extractHostForDebug(request),
      };
    }
    
    const context = resolution.context;
    
    // -------------------------------------------------------------------------
    // STEP 2: Extract userId from session (if authenticated)
    // -------------------------------------------------------------------------
    let userId: string | undefined;
    
    // Try session cookie first (primary auth method)
    const sessionCookie = request.cookies.get('session')?.value;
    
    if (sessionCookie) {
      try {
        const result = await verifySessionCookieSafe(sessionCookie);
        if (result.success && result.data) {
          userId = result.data.uid;
          console.log(`[ContextResolver] ${requestId} - Authenticated user: ${userId?.substring(0, 8)}...`);
        }
      } catch (error) {
        // Session invalid or expired - continue as anonymous
        console.log(`[ContextResolver] ${requestId} - Session invalid, continuing as anonymous`);
      }
    }
    
    // Fallback: Try to extract from Authorization header (JWT)
    if (!userId) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const [, payloadBase64] = token.split('.');
          if (payloadBase64) {
            const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
            const payload = JSON.parse(payloadJson);
            userId = payload.sub || payload.user_id;
          }
        } catch (error) {
          // Invalid token format - ignore
          console.log(`[ContextResolver] ${requestId} - Could not extract user from Bearer token`);
        }
      }
    }
    
    // -------------------------------------------------------------------------
    // STEP 3: Sign context for backend verification
    // -------------------------------------------------------------------------
    const signedContext = await domainResolver.signContext(context, userId);
    
    console.log(`[ContextResolver] ${requestId} - Resolved: ${context.domain} (${context.environment}) for user ${userId?.substring(0, 8) || 'anon'}...`);
    
    return {
      matched: true,
      signedContext,
      domain: context.domain,
      tenantId: context.tenantId,
      userId,
    };
    
  } catch (error) {
    console.error(`[ContextResolver] ${requestId} - Unexpected error:`, error);
    return {
      matched: false,
      error: error instanceof Error ? error.message : 'Failed to resolve context',
      attemptedHost: extractHostForDebug(request),
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract host header for debugging purposes.
 */
function extractHostForDebug(request: NextRequest): string {
  return request.headers.get('host') || 
         request.headers.get('x-forwarded-host') || 
         new URL(request.url).hostname ||
         'unknown';
}

/**
 * Validate that context is fully resolved and ready for use.
 * Throws if context is invalid.
 */
export function assertResolvedContext(
  context: ContextResolutionResult
): asserts context is ContextResolutionResult & { matched: true; signedContext: string; domain: ProductDomain; tenantId: string } {
  if (!context.matched) {
    throw new ContextResolutionError(
      context.error || 'Context not resolved',
      'CONTEXT_NOT_RESOLVED',
      context.attemptedHost
    );
  }
  
  if (!context.signedContext || !context.domain || !context.tenantId) {
    throw new ContextResolutionError(
      'Context resolved but missing required fields',
      'CONTEXT_INCOMPLETE',
      context.attemptedHost
    );
  }
}

/**
 * Get context or return null (for optional context scenarios).
 */
export async function getContextSafe(
  request: NextRequest
): Promise<ResolvedContext | null> {
  const result = await resolveContext(request);
  
  if (!result.matched || !result.signedContext) {
    return null;
  }
  
  // Re-resolve to get full DomainContext
  const resolution = domainResolver.resolve(request);
  if (!resolution.context) {
    return null;
  }
  
  return {
    ...resolution.context,
    signedContext: result.signedContext,
    userId: result.userId,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ContextResolutionError };
export default resolveContext;
