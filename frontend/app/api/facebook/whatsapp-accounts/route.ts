/**
 * Fetch WhatsApp Business Accounts API Route
 * Gets all WABAs for a specific Business Manager
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getUserByFirebaseUID } from '@/lib/supabase/queries';
import {
  getFacebookAccountByUserId,
  createWhatsAppAccount,
  getBusinessManagersByUserId,
} from '@/lib/supabase/facebook-whatsapp-queries';
import { createGraphAPIClient } from '@/lib/facebook/graph-api-client';
import { decryptToken } from '@/lib/encryption/crypto';

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const { businessId } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: 'Missing businessId' },
        { status: 400 }
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

    // Get business manager record
    const businessManagers = await getBusinessManagersByUserId(user.id);
    const businessManager = businessManagers.find(bm => bm.business_id === businessId);

    if (!businessManager) {
      return NextResponse.json(
        { error: 'Business Manager not found' },
        { status: 404 }
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(facebookAccount.access_token);

    // Fetch WhatsApp Business Accounts from Meta Graph API
    const graphClient = createGraphAPIClient(accessToken);
    const whatsappAccounts = await graphClient.getWhatsAppBusinessAccounts(businessId);

    // Store in database
    for (const waba of whatsappAccounts) {
      try {
        await createWhatsAppAccount({
          business_manager_id: businessManager.id,
          user_id: user.id,
          waba_id: waba.id,
          waba_name: waba.name || null,
          account_review_status: waba.account_review_status || null,
          business_verification_status: waba.business_verification_status || null,
          quality_rating: waba.quality_rating || null,
          messaging_limit_tier: null,
        });
      } catch (error: any) {
        // Ignore duplicate errors
        if (!error.message?.includes('duplicate') && !error.code?.includes('23505')) {
          console.error('Error storing WhatsApp account:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: whatsappAccounts,
    });
  } catch (error: any) {
    console.error('Error fetching WhatsApp accounts:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch WhatsApp accounts',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

