import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user ID from Firebase token
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

// Appointment interface matching database schema
interface Appointment {
  id?: string;
  user_id: string;
  customer_name: string;
  customer_phone: string;
  date: string;
  time: string;
  duration: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  source: "ai" | "manual";
  service?: string;
  notes?: string;
}

// GET - List all appointments for current user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    // Optional filters
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let query = supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .order("time", { ascending: true });

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (date) {
      query = query.eq("date", date);
    }
    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json(
        { error: "Failed to fetch appointments" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Error in GET /api/appointments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create a new appointment
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      customer_name,
      customer_phone,
      date,
      time,
      duration = 60,
      status = "pending",
      source = "manual",
      service,
      notes,
    } = body;

    // Validate required fields
    if (!customer_name || !customer_phone || !date || !time) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: customer_name, customer_phone, date, time",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Check for overlapping appointments
    const { data: existing, error: checkError } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .eq("date", date)
      .neq("status", "cancelled");

    if (checkError) {
      console.error("Error checking existing appointments:", checkError);
    }

    // Simple overlap check (can be enhanced for duration-based checking)
    const overlap = existing?.find((apt: Appointment) => apt.time === time);
    if (overlap) {
      return NextResponse.json(
        { error: "Time slot already booked", conflicting_appointment: overlap },
        { status: 409 }
      );
    }

    // Create appointment
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        user_id: userId,
        customer_name,
        customer_phone,
        date,
        time,
        duration,
        status,
        source,
        service,
        notes,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating appointment:", error);
      return NextResponse.json(
        { error: "Failed to create appointment" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/appointments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
