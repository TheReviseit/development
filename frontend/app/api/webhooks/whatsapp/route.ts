/**
 * WhatsApp Webhook Handler
 * Receives and processes incoming WhatsApp messages and status updates
 * from Meta's WhatsApp Cloud API
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getPhoneNumberByPhoneNumberId,
  createMessage,
  updateMessageStatus,
  logWebhookEvent,
  markWebhookProcessed,
} from "@/lib/supabase/facebook-whatsapp-queries";
import { decryptToken } from "@/lib/encryption/crypto";
import { WhatsAppWebhookPayload } from "@/types/facebook-whatsapp.types";

/**
 * Verify webhook signature from Meta
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  appSecret: string,
): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`),
  );
}

/**
 * GET - Webhook verification (Meta requires this)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Verify token (you should configure this in Meta dashboard)
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    { error: "Forbidden - Invalid verify token" },
    { status: 403 },
  );
}

/**
 * POST - Handle incoming webhooks
 */
export async function POST(request: NextRequest) {
  let webhookEventId: string | null = null;

  try {
    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    // Verify signature
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      throw new Error("Facebook App Secret not configured");
    }

    const isValid = verifyWebhookSignature(body, signature, appSecret);

    // Parse payload
    const payload: WhatsAppWebhookPayload = JSON.parse(body);

    // Log webhook event
    const { data: logEntry } = await (async () => {
      try {
        const { supabaseAdmin: supabase } =
          await import("@/lib/supabase/server");
        return await supabase
          .from("webhook_events_log")
          .insert({
            event_type: "whatsapp_webhook",
            webhook_payload: payload,
            signature_verified: isValid,
            signature_value: signature,
          })
          .select()
          .single();
      } catch (error) {
        console.error("Error logging webhook:", error);
        return { data: null };
      }
    })();

    if (logEntry) {
      webhookEventId = logEntry.id;
    }

    // Reject if signature is invalid
    if (!isValid) {
      console.error("Invalid webhook signature");
      if (webhookEventId) {
        await markWebhookProcessed(webhookEventId, false, "Invalid signature");
      }
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Process webhook
    if (payload.object === "whatsapp_business_account") {
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // Get phone number AND associated client with AI configuration
          // This enables multi-tenant routing with client-specific AI processing
          const { supabaseAdmin: supabase } =
            await import("@/lib/supabase/server");

          const { data: phoneNumber, error: phoneError } = await supabase
            .from("connected_phone_numbers")
            .select(
              `
              *,
              user:user_id (
                id,
                ai_config,
                business_name,
                knowledge_base
              )
            `,
            )
            .eq("phone_number_id", value.metadata.phone_number_id)
            .single();

          if (!phoneNumber || phoneError) {
            console.warn(
              `Phone number ${value.metadata.phone_number_id} not found in database`,
            );
            continue;
          }

          // Log client context for debugging
          console.log(
            `📱 [Webhook] Processing message for client: ${
              phoneNumber.user?.business_name || phoneNumber.user_id
            }`,
          );

          // Process incoming messages
          if (value.messages) {
            for (const message of value.messages) {
              try {
                const { supabaseAdmin } = await import("@/lib/supabase/server");

                // Extract media_id based on message type
                // WhatsApp sends media IDs in type-specific paths
                let mediaId: string | undefined;
                if (message.type === "image" && message.image?.id) {
                  mediaId = message.image.id;
                } else if (message.type === "video" && message.video?.id) {
                  mediaId = message.video.id;
                } else if (message.type === "audio" && message.audio?.id) {
                  mediaId = message.audio.id;
                } else if (
                  message.type === "document" &&
                  message.document?.id
                ) {
                  mediaId = message.document.id;
                }

                // Get or create conversation for this contact
                const contactNumber = message.from;
                const { data: existingConversation } = await supabaseAdmin
                  .from("whatsapp_conversations")
                  .select("id")
                  .eq("phone_number_id", phoneNumber.id)
                  .eq("contact_phone", contactNumber)
                  .single();

                let conversationId: string;
                if (existingConversation) {
                  conversationId = existingConversation.id;
                } else {
                  // Create new conversation
                  const { data: newConversation, error: convError } =
                    await supabaseAdmin
                      .from("whatsapp_conversations")
                      .insert({
                        phone_number_id: phoneNumber.id,
                        business_id: phoneNumber.business_manager_id,
                        contact_phone: contactNumber,
                        contact_name:
                          value.contacts?.[0]?.profile?.name || null,
                        status: "active",
                      })
                      .select("id")
                      .single();

                  if (convError || !newConversation) {
                    console.error("Failed to create conversation:", convError);
                    continue;
                  }
                  conversationId = newConversation.id;
                }

                await createMessage({
                  conversation_id: conversationId,
                  business_id: phoneNumber.business_manager_id,
                  wamid: message.id,
                  direction: "inbound",
                  message_type: message.type,
                  content: message.text?.body ?? undefined,
                  media_id: mediaId,
                  status: "delivered",
                });

                console.log(`Stored incoming message ${message.id}`);
              } catch (error) {
                console.error("Error storing message:", error);
              }
            }
          }

          // Process message status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              try {
                const updates: any = {
                  status: status.status,
                };

                if (status.status === "delivered") {
                  updates.delivered_at = new Date(
                    parseInt(status.timestamp) * 1000,
                  ).toISOString();
                } else if (status.status === "read") {
                  updates.read_at = new Date(
                    parseInt(status.timestamp) * 1000,
                  ).toISOString();
                } else if (status.status === "failed") {
                  updates.failed_at = new Date(
                    parseInt(status.timestamp) * 1000,
                  ).toISOString();

                  if (status.errors && status.errors.length > 0) {
                    updates.error_code = status.errors[0].code.toString();
                    updates.error_message = status.errors[0].title;
                  }
                }

                await updateMessageStatus(status.id, updates);

                console.log(
                  `Updated message status: ${status.id} -> ${status.status}`,
                );
              } catch (error) {
                console.error("Error updating message status:", error);
              }
            }
          }
        }
      }
    }

    // Mark webhook as processed
    if (webhookEventId) {
      await markWebhookProcessed(webhookEventId, true);
    }

    // Always return 200 to Meta to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Webhook processing error:", error);

    // Mark webhook as failed
    if (webhookEventId) {
      await markWebhookProcessed(webhookEventId, false, error.message);
    }

    // Still return 200 to Meta to prevent retries for unrecoverable errors
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
