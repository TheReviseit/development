import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { aiEnabled } = await request.json();

    if (typeof aiEnabled !== "boolean") {
      return NextResponse.json(
        { error: "aiEnabled must be a boolean" },
        { status: 400 }
      );
    }

    // Update the conversation's ai_enabled field
    const { data, error } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ ai_enabled: aiEnabled })
      .eq("id", conversationId)
      .select()
      .single();

    if (error) {
      console.error("Error updating AI toggle:", error);
      return NextResponse.json(
        { error: "Failed to update AI setting", details: error.message },
        { status: 500 }
      );
    }

    console.log(
      `🤖 AI ${
        aiEnabled ? "enabled" : "disabled"
      } for conversation ${conversationId}`
    );

    return NextResponse.json({
      success: true,
      data: {
        conversationId,
        aiEnabled,
      },
    });
  } catch (error: any) {
    console.error("Error toggling AI:", error);
    return NextResponse.json(
      { error: "Failed to toggle AI", message: error.message },
      { status: 500 }
    );
  }
}
