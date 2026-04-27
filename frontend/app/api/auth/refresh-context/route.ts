/**
 * Context Refresh API
 * ==================
 * Endpoint to refresh expired signed context for idle browsers.
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

import { NextRequest, NextResponse } from 'next/server';
import { domainResolver } from '@/lib/domain/resolver';
import { verifySessionCookieSafe } from '@/lib/firebase-admin';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify user is authenticated
    const sessionCookie = request.cookies.get('session')?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'AUTH_REQUIRED', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const sessionResult = await verifySessionCookieSafe(sessionCookie);
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json(
        { error: 'INVALID_SESSION', message: sessionResult.error || 'Invalid session' },
        { status: 401 }
      );
    }
    
    const session = sessionResult.data;
    
    // Resolve domain from request
    const resolution = domainResolver.resolve(request);
    
    if (!resolution.matched || !resolution.context) {
      return NextResponse.json(
        { error: 'DOMAIN_NOT_RECOGNIZED', message: 'Domain not recognized' },
        { status: 400 }
      );
    }
    
    // Sign new context with user ID (async - Web Crypto API)
    const signedContext = await domainResolver.signContext(resolution.context, session.uid);
    
    return NextResponse.json({
      signedContext,
      domain: resolution.context.domain,
      tenantId: resolution.context.tenantId,
      expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
    });
    
  } catch (error) {
    console.error('[ContextRefresh] Error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to refresh context' },
      { status: 500 }
    );
  }
}
