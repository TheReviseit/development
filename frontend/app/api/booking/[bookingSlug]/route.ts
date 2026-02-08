import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// GET /api/booking/[bookingSlug]
// Fetch booking page data (services, hours, etc.)
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingSlug: string }> },
) {
  try {
    const { bookingSlug } = await params;

    // Look up business by booking_slug OR user_id (for backward compatibility)
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("*")
      .or(`booking_slug.eq.${bookingSlug},user_id.eq.${bookingSlug}`)
      .maybeSingle();

    if (businessError) {
      console.error("[Booking API] Business lookup error:", businessError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch business" },
        { status: 500 },
      );
    }

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Booking page not found" },
        { status: 404 },
      );
    }

    // Fetch ACTIVE services from the services table
    const { data: dbServices, error: servicesError } = await supabase
      .from("services")
      .select("*")
      .eq("user_id", business.user_id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (servicesError) {
      console.error("[Booking API] Services fetch error:", servicesError);
    }

    // Transform services to booking page format
    let services: Array<{
      id: string;
      name: string;
      description?: string;
      category?: string;
      duration: number;
      price: number;
      currency: string;
      imageUrl?: string;
      paymentMode?: "online" | "cash" | "both";
    }> = [];

    if (dbServices && dbServices.length > 0) {
      services = dbServices.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || undefined,
        category: s.category || undefined, // FIXED: Was missing!
        duration:
          s.duration_enabled && s.duration_minutes ? s.duration_minutes : 60,
        price:
          s.price_type === "fixed" || s.price_type === "hourly"
            ? s.price_amount || 0
            : s.price_range_min || 0,
        currency: "INR",
        imageUrl: s.image_url || undefined,
        paymentMode: s.payment_mode || "cash",
      }));
    }

    // Fallback to legacy services from store_capabilities or ai_capabilities
    if (services.length === 0) {
      const { data: capabilities } = await supabase
        .from("store_capabilities")
        .select("*")
        .eq("user_id", business.user_id)
        .maybeSingle();

      if (capabilities?.booking_services?.length > 0) {
        services = capabilities.booking_services;
      } else {
        const { data: aiCapabilities } = await supabase
          .from("ai_capabilities")
          .select("appointment_services")
          .eq("user_id", business.user_id)
          .maybeSingle();

        if (aiCapabilities?.appointment_services?.length > 0) {
          services = aiCapabilities?.appointment_services;
        }
      }
    }

    // Get business hours from capabilities
    let hours = {};
    let fields = [];
    let slotDuration = 60;
    let bufferMinutes = 0;
    let advanceDays = 30;

    const { data: capabilities } = await supabase
      .from("store_capabilities")
      .select("*")
      .eq("user_id", business.user_id)
      .maybeSingle();

    if (capabilities) {
      hours = capabilities.booking_hours || {};
      fields = capabilities.booking_fields || [];
      slotDuration = capabilities.booking_slot_duration || 60;
      bufferMinutes = capabilities.booking_buffer_minutes || 0;
      advanceDays = capabilities.booking_advance_days || 30;
    } else {
      const { data: aiCapabilities } = await supabase
        .from("ai_capabilities")
        .select("appointment_business_hours, appointment_fields")
        .eq("user_id", business.user_id)
        .maybeSingle();

      if (aiCapabilities) {
        hours = aiCapabilities?.appointment_business_hours || {};
        fields = aiCapabilities?.appointment_fields || [];
      }
    }

    // Fetch AI capabilities for social links and business description
    const { data: aiProfile } = await supabase
      .from("ai_capabilities")
      .select("profile_business_description")
      .eq("user_id", business.user_id)
      .maybeSingle();

    // Get social links from businesses table (primary source)
    // The data might be stored as a JSON string, so we need to parse it
    let socialData: Record<string, string> = {};
    try {
      if (business.social_media) {
        socialData =
          typeof business.social_media === "string"
            ? JSON.parse(business.social_media)
            : business.social_media;
      }
    } catch (e) {
      console.error("[Booking API] Error parsing social_media:", e);
    }

    // Build response
    const response = {
      success: true,
      data: {
        id: business.id,
        businessName: business.businessName || business.business_name,
        logoUrl: business.logoUrl || business.logo_url,
        bannerUrl: business.bannerUrl || business.banner_url,
        description:
          aiProfile?.profile_business_description || business.description || "",
        timezone: business.timezone || "Asia/Kolkata",
        contact: {
          phone: business.phone,
          email: business.email,
          whatsapp: business.whatsappNumber || business.whatsapp_number,
        },
        location: business.location || {
          address: business.address,
          city: business.city,
          state: business.state,
        },
        social: {
          instagram: socialData.instagram || null,
          facebook: socialData.facebook || null,
          twitter: socialData.twitter || null,
          linkedin: socialData.linkedin || null,
          youtube: socialData.youtube || null,
        },
        services: services,
        hours: hours,
        fields: fields,
        slotDuration: slotDuration,
        bufferMinutes: bufferMinutes,
        advanceDays: advanceDays,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Booking API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
