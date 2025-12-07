import { supabase } from "./client";
import { supabaseAdmin } from "./server";

// Database type definitions
export interface User {
  id: string;
  firebase_uid: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  user_id: string;
  business_name: string;
  category: string;
  website?: string;
  address?: string;
  logo_url?: string;
  timezone: string;
  language?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConnection {
  id: string;
  business_id: string;
  provider_type: "cloud_api" | "gupshup" | "twilio" | "360dialog";
  phone_number: string;
  phone_number_id?: string;
  business_id_meta?: string;
  api_token: string; // Encrypted
  default_sender_name: string;
  messaging_category?: "transactional" | "marketing";
  status: "connected" | "pending" | "failed";
  test_number?: string;
  created_at: string;
  updated_at: string;
}

// User queries
export async function getUserByFirebaseUID(firebaseUID: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("firebase_uid", firebaseUID)
    .single();

  if (error) {
    console.error("Error fetching user:", error);
    return null;
  }
  return data as User;
}

export async function createUser(userData: {
  firebase_uid: string;
  full_name: string;
  email: string;
  phone?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert([userData])
    .select()
    .single();

  if (error) {
    console.error("Error creating user:", error);
    throw error;
  }
  return data as User;
}

export async function updateUser(firebaseUID: string, updates: Partial<User>) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("firebase_uid", firebaseUID)
    .select()
    .single();

  if (error) {
    console.error("Error updating user:", error);
    throw error;
  }
  return data as User;
}

// Business queries
export async function getBusinessByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 is "not found" error
    console.error("Error fetching business:", error);
    return null;
  }
  return data as Business | null;
}

export async function createOrUpdateBusiness(
  userId: string,
  businessData: Omit<Business, "id" | "user_id" | "created_at" | "updated_at">
) {
  // Check if business exists
  const existing = await getBusinessByUserId(userId);

  if (existing) {
    // Update existing
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .update(businessData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating business:", error);
      throw error;
    }
    return data as Business;
  } else {
    // Create new
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .insert([{ ...businessData, user_id: userId }])
      .select()
      .single();

    if (error) {
      console.error("Error creating business:", error);
      throw error;
    }
    return data as Business;
  }
}

// WhatsApp connection queries
export async function getWhatsAppConnection(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching WhatsApp connection:", error);
    return null;
  }
  return data as WhatsAppConnection | null;
}

export async function createOrUpdateWhatsAppConnection(
  businessId: string,
  connectionData: Omit<
    WhatsAppConnection,
    "id" | "business_id" | "created_at" | "updated_at"
  >
) {
  // Check if connection exists
  const existing = await getWhatsAppConnection(businessId);

  if (existing) {
    // Update existing
    const { data, error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update(connectionData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating WhatsApp connection:", error);
      throw error;
    }
    return data as WhatsAppConnection;
  } else {
    // Create new
    const { data, error } = await supabaseAdmin
      .from("whatsapp_connections")
      .insert([{ ...connectionData, business_id: businessId }])
      .select()
      .single();

    if (error) {
      console.error("Error creating WhatsApp connection:", error);
      throw error;
    }
    return data as WhatsAppConnection;
  }
}

// Mark onboarding as complete
export async function markOnboardingComplete(firebaseUID: string) {
  return updateUser(firebaseUID, { onboarding_completed: true });
}
