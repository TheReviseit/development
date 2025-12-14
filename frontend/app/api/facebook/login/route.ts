/**
 * Facebook Login API Route
 * Handles Facebook OAuth callback and stores connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getUserByFirebaseUID } from '@/lib/supabase/queries';
import {
  createFacebookAccount,
  getFacebookAccountByUserId,
  updateFacebookAccount,
} from '@/lib/supabase/facebook-whatsapp-queries';
import { createGraphAPIClient, MetaGraphAPIClient } from '@/lib/facebook/graph-api-client';
import { encryptToken } from '@/lib/encryption/crypto';

export async function POST(request: NextRequest) {
  try {
    // Verify user session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized - No session' },
        { status: 401 }
      );
    }

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    const firebaseUID = decodedClaims.uid;

    // Get user from database
    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      accessToken,
      userID,
      expiresIn,
      grantedPermissions = [],
    } = body;

    if (!accessToken || !userID) {
      return NextResponse.json(
        { error: 'Missing required fields: accessToken, userID' },
        { status: 400 }
      );
    }

    // Exchange short-lived token for long-lived token (60 days)
    let longLivedToken: string;
    let tokenExpiresIn: number;
    
    try {
      const exchangeResult = await MetaGraphAPIClient.exchangeToken(accessToken);
      longLivedToken = exchangeResult.access_token;
      tokenExpiresIn = exchangeResult.expires_in;
    } catch (error) {
      console.error('Token exchange failed:', error);
      // Fallback to short-lived token if exchange fails
      longLivedToken = accessToken;
      tokenExpiresIn = expiresIn;
    }

    // Get user profile from Facebook
    const graphClient = createGraphAPIClient(longLivedToken);
    const profile = await graphClient.getUserProfile();

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + tokenExpiresIn * 1000).toISOString();

    // Encrypt the access token
    const encryptedToken = encryptToken(longLivedToken);

    // Check if Facebook account already exists
    const existingAccount = await getFacebookAccountByUserId(user.id);

    let facebookAccount;
    if (existingAccount) {
      // Update existing account
      facebookAccount = await updateFacebookAccount(existingAccount.id, {
        access_token: encryptedToken,
        expires_at: expiresAt,
        granted_permissions: grantedPermissions,
        status: 'active',
        facebook_user_name: profile.name,
        facebook_email: profile.email || null,
        connection_error: null,
      });
    } else {
      // Create new account
      facebookAccount = await createFacebookAccount({
        user_id: user.id,
        facebook_user_id: userID,
        facebook_user_name: profile.name,
        facebook_email: profile.email || null,
        access_token: encryptedToken,
        token_type: 'Bearer',
        expires_at: expiresAt,
        granted_permissions: grantedPermissions,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        facebookAccount: {
          ...facebookAccount,
          access_token: '[ENCRYPTED]', // Don't send encrypted token to client
        },
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
        },
      },
    });
  } catch (error: any) {
    console.error('Facebook login error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process Facebook login',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET - Check Facebook connection status
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const facebookAccount = await getFacebookAccountByUserId(user.id);

    if (!facebookAccount) {
      return NextResponse.json({
        connected: false,
        account: null,
      });
    }

    // Check if token is expired
    const isExpired = facebookAccount.expires_at
      ? new Date(facebookAccount.expires_at) < new Date()
      : false;

    return NextResponse.json({
      connected: facebookAccount.status === 'active' && !isExpired,
      account: {
        ...facebookAccount,
        access_token: '[ENCRYPTED]',
      },
      isExpired,
    });
  } catch (error: any) {
    console.error('Error checking Facebook connection:', error);
    return NextResponse.json(
      {
        error: 'Failed to check connection',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// DELETE - Revoke Facebook connection
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        { error: 'No Facebook account connected' },
        { status: 404 }
      );
    }

    // Soft delete the connection (cascades to all related data)
    const { revokeFacebookAccount } = await import('@/lib/supabase/facebook-whatsapp-queries');
    await revokeFacebookAccount(facebookAccount.id);

    return NextResponse.json({
      success: true,
      message: 'Facebook connection revoked',
    });
  } catch (error: any) {
    console.error('Error revoking Facebook connection:', error);
    return NextResponse.json(
      {
        error: 'Failed to revoke connection',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

