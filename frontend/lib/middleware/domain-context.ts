/**
 * Domain Context Middleware
 * =======================
 * Injects signed domain context into requests.
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

import { NextRequest, NextResponse } from 'next/server';
import { domainResolver, DomainContext } from '@/lib/domain/resolver';
import { verifySessionCookie } from '@/lib/firebase-admin';

/**
 * Middleware handler that resolves domain and injects context.
 */
export async function domainContextMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const requestId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  try {
    // Resolve domain
    const resolution = domainResolver.resolve(request);
    
    if (!resolution.matched || !resolution.context) {
      console.error(`[DomainContext] ${requestId} - Resolution failed: ${resolution.error}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'DOMAIN_NOT_RECOGNIZED',
          message: resolution.error || 'Unknown domain'
        },
        { status: 400 }
      );
    }
    
    const context = resolution.context;
    
    // Authenticate user (if session cookie present)
    let userId: string | undefined;
    const sessionCookie = request.cookies.get('session')?.value;
    
    if (sessionCookie) {
      try {
        const session = await verifySessionCookie(sessionCookie);
        userId = session.uid;
      } catch (e) {
        // No valid session, continue as anonymous
      }
    }
    
    // Sign context for backend verification
    const signedContext = domainResolver.signContext(context, userId);
    
    // Clone headers and inject context
    const headers = new Headers(request.headers);
    headers.set('x-signed-context', signedContext);
    headers.set('x-tenant-domain', context.domain);
    headers.set('x-tenant-id', context.tenantId);
    headers.set('x-request-id', requestId);
    
    if (userId) {
      headers.set('x-user-id', userId);
    }
    
    console.log(`[DomainContext] ${requestId} - Injected: ${context.domain} (${context.environment})`);
    
    // Continue with modified headers
    return NextResponse.next({
      request: { headers }
    });
    
  } catch (error) {
    console.error(`[DomainContext] ${requestId} - Error:`, error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'MIDDLEWARE_ERROR',
        message: 'Failed to resolve domain context'
      },
      { status: 500 }
    );
  }
}
