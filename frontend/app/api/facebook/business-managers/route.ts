/**
 * Fetch Business Managers API Route
 * Gets all Business Managers accessible to the user
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getUserByFirebaseUID } from '@/lib/supabase/queries';
import {
  getFacebookAccountByUserId,
  createBusinessManager,
  getBusinessManagersByUserId,
} from '@/lib/supabase/facebook-whatsapp-queries';
import { createGraphAPIClient } from '@/lib/facebook/graph-api-client';
import { decryptToken } from '@/lib/encryption/crypto';

export async function GET(request: NextRequest) {
  try {
    // Verify user session
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

    // Get Facebook account
    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        { error: 'Facebook account not connected' },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (facebookAccount.expires_at && new Date(facebookAccount.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Facebook token expired. Please reconnect.' },
        { status: 401 }
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(facebookAccount.access_token);

    // Fetch Business Managers from Meta Graph API
    const graphClient = createGraphAPIClient(accessToken);
    const businessManagers = await graphClient.getBusinessManagers();

    // Store in database
    for (const bm of businessManagers) {
      try {
        await createBusinessManager({
          facebook_account_id: facebookAccount.id,
          user_id: user.id,
          business_id: bm.id,
          business_name: bm.name,
          business_email: null,
          business_vertical: null,
          permitted_roles: bm.permitted_roles || [],
        });
      } catch (error: any) {
        // Ignore duplicate errors (business manager already exists)
        if (!error.message?.includes('duplicate') && !error.code?.includes('23505')) {
          console.error('Error storing business manager:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: businessManagers,
    });
  } catch (error: any) {
    console.error('Error fetching business managers:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch business managers',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

