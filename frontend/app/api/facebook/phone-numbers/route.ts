/**
 * Fetch Phone Numbers API Route
 * Gets all phone numbers for a specific WABA
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getUserByFirebaseUID } from '@/lib/supabase/queries';
import {
  getFacebookAccountByUserId,
  createPhoneNumber,
  getWhatsAppAccountsByUserId,
} from '@/lib/supabase/facebook-whatsapp-queries';
import { createGraphAPIClient } from '@/lib/facebook/graph-api-client';
import { decryptToken, encryptToken } from '@/lib/encryption/crypto';
import crypto from 'crypto';

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
    const { wabaId } = body;

    if (!wabaId) {
      return NextResponse.json(
        { error: 'Missing wabaId' },
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

    // Get WABA record
    const whatsappAccounts = await getWhatsAppAccountsByUserId(user.id);
    const whatsappAccount = whatsappAccounts.find(wa => wa.waba_id === wabaId);

    if (!whatsappAccount) {
      return NextResponse.json(
        { error: 'WhatsApp Business Account not found' },
        { status: 404 }
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(facebookAccount.access_token);

    // Fetch phone numbers from Meta Graph API
    const graphClient = createGraphAPIClient(accessToken);
    const phoneNumbers = await graphClient.getPhoneNumbers(wabaId);

    // Store in database
    for (const phone of phoneNumbers) {
      try {
        // Generate webhook verify token
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const encryptedVerifyToken = encryptToken(verifyToken);

        // Webhook URL (you'll need to configure this based on your domain)
        const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/whatsapp/${phone.id}`;

        await createPhoneNumber({
          whatsapp_account_id: whatsappAccount.id,
          user_id: user.id,
          phone_number_id: phone.id,
          display_phone_number: phone.display_phone_number,
          verified_name: phone.verified_name || null,
          quality_rating: phone.quality_rating || null,
          code_verification_status: phone.code_verification_status || null,
          is_official_business_account: phone.is_official_business_account || false,
          webhook_url: webhookUrl,
          webhook_verify_token: encryptedVerifyToken,
          is_primary: false, // User will set this later
        });
      } catch (error: any) {
        // Ignore duplicate errors
        if (!error.message?.includes('duplicate') && !error.code?.includes('23505')) {
          console.error('Error storing phone number:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: phoneNumbers,
    });
  } catch (error: any) {
    console.error('Error fetching phone numbers:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch phone numbers',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

