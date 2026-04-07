"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

export async function getPaymentUserProfile(firebaseUid: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("full_name, phone")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();
      
    if (error) {
      console.error("Supabase Admin fetch error:", error);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error("Error running getPaymentUserProfile server action:", err);
    return null;
  }
}
