/**
 * Supabase Queries for Facebook + WhatsApp Connections
 * Database operations for multi-tenant WhatsApp integration
 */

import { createClient } from "@supabase/supabase-js";
import {
  ConnectedFacebookAccount,
  ConnectedBusinessManager,
  ConnectedWhatsAppAccount,
  ConnectedPhoneNumber,
  WhatsAppMessage,
} from "@/types/facebook-whatsapp.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role key for server-side operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// FACEBOOK ACCOUNTS
// =====================================================

export async function createFacebookAccount(data: {
  user_id: string;
  facebook_user_id: string;
  facebook_user_name: string | null;
  facebook_email: string | null;
  access_token: string; // Should be encrypted before calling this
  token_type: string;
  expires_at: string | null;
  granted_permissions: string[];
}): Promise<ConnectedFacebookAccount> {
  const { data: account, error } = await supabaseAdmin
    .from("connected_facebook_accounts")
    .insert({
      ...data,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;
  return account;
}

export async function getFacebookAccountByUserId(
  userId: string
): Promise<ConnectedFacebookAccount | null> {
  const { data, error } = await supabaseAdmin
    .from("connected_facebook_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function updateFacebookAccount(
  id: string,
  updates: Partial<ConnectedFacebookAccount>
): Promise<ConnectedFacebookAccount> {
  const { data, error } = await supabaseAdmin
    .from("connected_facebook_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function revokeFacebookAccount(id: string): Promise<void> {
  // Soft delete using the function we created
  const { error } = await supabaseAdmin.rpc("soft_delete_facebook_connection", {
    p_facebook_account_id: id,
  });

  if (error) throw error;
}

// =====================================================
// BUSINESS MANAGERS
// =====================================================

export async function createBusinessManager(data: {
  facebook_account_id: string;
  user_id: string;
  business_id: string;
  business_name: string;
  business_email: string | null;
  business_vertical: string | null;
  permitted_roles: string[];
}): Promise<ConnectedBusinessManager> {
  const { data: manager, error } = await supabaseAdmin
    .from("connected_business_managers")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return manager;
}

export async function getBusinessManagersByFacebookAccount(
  facebookAccountId: string
): Promise<ConnectedBusinessManager[]> {
  const { data, error } = await supabaseAdmin
    .from("connected_business_managers")
    .select("*")
    .eq("facebook_account_id", facebookAccountId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

export async function getBusinessManagersByUserId(
  userId: string
): Promise<ConnectedBusinessManager[]> {
  const { data, error } = await supabaseAdmin
    .from("connected_business_managers")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

// =====================================================
// WHATSAPP BUSINESS ACCOUNTS
// =====================================================

export async function createWhatsAppAccount(data: {
  business_manager_id: string;
  user_id: string;
  waba_id: string;
  waba_name: string | null;
  account_review_status: string | null;
  business_verification_status: string | null;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
}): Promise<ConnectedWhatsAppAccount> {
  const { data: account, error } = await supabaseAdmin
    .from("connected_whatsapp_accounts")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return account;
}

export async function getWhatsAppAccountsByBusinessManager(
  businessManagerId: string
): Promise<ConnectedWhatsAppAccount[]> {
  const { data, error } = await supabaseAdmin
    .from("connected_whatsapp_accounts")
    .select("*")
    .eq("business_manager_id", businessManagerId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

export async function getWhatsAppAccountsByUserId(
  userId: string
): Promise<ConnectedWhatsAppAccount[]> {
  const { data, error } = await supabaseAdmin
    .from("connected_whatsapp_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

export async function getWhatsAppAccountByWabaId(
  wabaId: string
): Promise<ConnectedWhatsAppAccount | null> {
  const { data, error } = await supabaseAdmin
    .from("connected_whatsapp_accounts")
    .select("*")
    .eq("waba_id", wabaId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

// =====================================================
// PHONE NUMBERS
// =====================================================

export async function createPhoneNumber(data: {
  whatsapp_account_id: string;
  user_id: string;
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string | null;
  quality_rating: string | null;
  code_verification_status: string | null;
  is_official_business_account: boolean;
  webhook_url: string | null;
  webhook_verify_token: string | null;
  is_primary: boolean;
}): Promise<ConnectedPhoneNumber> {
  // If this is primary, unset other primary numbers for this user
  if (data.is_primary) {
    await supabaseAdmin
      .from("connected_phone_numbers")
      .update({ is_primary: false })
      .eq("user_id", data.user_id)
      .eq("is_primary", true);
  }

  const { data: phoneNumber, error } = await supabaseAdmin
    .from("connected_phone_numbers")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return phoneNumber;
}

export async function getPhoneNumbersByWhatsAppAccount(
  whatsappAccountId: string
): Promise<ConnectedPhoneNumber[]> {
  const { data, error } = await supabaseAdmin
    .from("connected_phone_numbers")
    .select("*")
    .eq("whatsapp_account_id", whatsappAccountId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

export async function getPhoneNumbersByUserId(
  userId: string
): Promise<ConnectedPhoneNumber[]> {
  const { data, error } = await supabaseAdmin
    .from("connected_phone_numbers")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;
  return data || [];
}

export async function getPrimaryPhoneNumber(
  userId: string
): Promise<ConnectedPhoneNumber | null> {
  const { data, error } = await supabaseAdmin
    .from("connected_phone_numbers")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getPhoneNumberByPhoneNumberId(
  phoneNumberId: string
): Promise<ConnectedPhoneNumber | null> {
  const { data, error } = await supabaseAdmin
    .from("connected_phone_numbers")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function updatePhoneNumber(
  id: string,
  updates: Partial<ConnectedPhoneNumber>
): Promise<ConnectedPhoneNumber> {
  const { data, error } = await supabaseAdmin
    .from("connected_phone_numbers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// MESSAGES
// =====================================================

export async function createMessage(data: {
  phone_number_id: string;
  user_id: string;
  message_id: string;
  wamid?: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  message_type: string;
  message_body?: string;
  media_url?: string;
  media_id?: string;
  template_name?: string;
  template_language?: string;
  template_parameters?: Record<string, any>;
  status?: string;
  conversation_id?: string;
  conversation_category?: string;
  conversation_origin?: string;
  metadata?: Record<string, any>;
  sent_at?: string;
}): Promise<WhatsAppMessage> {
  const { data: message, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return message;
}

export async function updateMessageStatus(
  messageId: string,
  updates: {
    status: "sent" | "delivered" | "read" | "failed";
    delivered_at?: string;
    read_at?: string;
    failed_at?: string;
    error_code?: string;
    error_message?: string;
  }
): Promise<WhatsAppMessage> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .update(updates)
    .eq("message_id", messageId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMessagesByUserId(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data || [];
}

export async function getMessageById(
  messageId: string
): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("*")
    .eq("message_id", messageId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

// =====================================================
// WEBHOOK EVENTS
// =====================================================

export async function logWebhookEvent(data: {
  user_id?: string;
  phone_number_id?: string;
  event_type: string;
  webhook_payload: Record<string, any>;
  signature_verified: boolean;
  signature_value?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("webhook_events_log").insert(data);

  if (error) throw error;
}

export async function markWebhookProcessed(
  id: string,
  success: boolean,
  error?: string
): Promise<void> {
  const { error: updateError } = await supabaseAdmin
    .from("webhook_events_log")
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      processing_error: error || null,
    })
    .eq("id", id);

  if (updateError) throw updateError;
}

// =====================================================
// COMPLETE USER CONNECTION VIEW
// =====================================================

export async function getUserWhatsAppConnection(userId: string): Promise<{
  facebookAccount: ConnectedFacebookAccount | null;
  businessManagers: ConnectedBusinessManager[];
  whatsappAccounts: ConnectedWhatsAppAccount[];
  phoneNumbers: ConnectedPhoneNumber[];
  primaryPhoneNumber: ConnectedPhoneNumber | null;
}> {
  const facebookAccount = await getFacebookAccountByUserId(userId);

  if (!facebookAccount) {
    return {
      facebookAccount: null,
      businessManagers: [],
      whatsappAccounts: [],
      phoneNumbers: [],
      primaryPhoneNumber: null,
    };
  }

  const businessManagers = await getBusinessManagersByFacebookAccount(
    facebookAccount.id
  );
  const whatsappAccounts = await getWhatsAppAccountsByUserId(userId);
  const phoneNumbers = await getPhoneNumbersByUserId(userId);
  const primaryPhoneNumber = await getPrimaryPhoneNumber(userId);

  return {
    facebookAccount,
    businessManagers,
    whatsappAccounts,
    phoneNumbers,
    primaryPhoneNumber,
  };
}
