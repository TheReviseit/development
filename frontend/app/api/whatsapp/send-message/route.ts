/**
 * Send WhatsApp Message API Route (Multi-Tenant)
 * Sends messages using the customer's own WhatsApp Business Account
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getUserByFirebaseUID } from '@/lib/supabase/queries';
import {
  getFacebookAccountByUserId,
  getPrimaryPhoneNumber,
  createMessage,
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
    const { to, message, phoneNumberId } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    // Get Facebook account
    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        { 
          error: 'WhatsApp not connected',
          message: 'Please connect your WhatsApp Business Account first'
        },
        { status: 400 }
      );
    }

    // Get phone number to use
    const phoneNumber = phoneNumberId
      ? await (async () => {
          const { getPhoneNumberByPhoneNumberId } = await import('@/lib/supabase/facebook-whatsapp-queries');
          return getPhoneNumberByPhoneNumberId(phoneNumberId);
        })()
      : await getPrimaryPhoneNumber(user.id);

    if (!phoneNumber) {
      return NextResponse.json(
        { 
          error: 'No phone number available',
          message: 'Please connect a WhatsApp Business phone number'
        },
        { status: 400 }
      );
    }

    // Verify user owns this phone number
    if (phoneNumber.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized - phone number belongs to another user' },
        { status: 403 }
      );
    }

    // Check if phone number can send messages
    if (!phoneNumber.can_send_messages || !phoneNumber.is_active) {
      return NextResponse.json(
        { 
          error: 'Phone number not active',
          message: 'This phone number cannot send messages'
        },
        { status: 400 }
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(facebookAccount.access_token);

    // Send message via WhatsApp Cloud API
    const graphClient = createGraphAPIClient(accessToken);
    const response = await graphClient.sendWhatsAppMessage(
      phoneNumber.phone_number_id,
      to,
      message
    );

    // Store message in database
    const messageRecord = await createMessage({
      phone_number_id: phoneNumber.id,
      user_id: user.id,
      message_id: response.messages[0].id,
      wamid: response.messages[0].id,
      direction: 'outbound',
      from_number: phoneNumber.display_phone_number,
      to_number: to,
      message_type: 'text',
      message_body: message,
      status: 'sent',
      sent_at: new Date().toISOString(),
      conversation_origin: 'business_initiated',
    });

    return NextResponse.json({
      success: true,
      data: {
        messageId: response.messages[0].id,
        phoneNumberId: phoneNumber.phone_number_id,
        from: phoneNumber.display_phone_number,
        to,
      },
    });
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', error);
    
    // Parse Meta API errors
    let errorMessage = error.message || 'Failed to send message';
    if (error.message?.includes('[')) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: 'Failed to send message',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

