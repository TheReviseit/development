import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, userName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Send welcome email
    try {
      const { sendEmail } = await import("@/lib/email/resend");
      const { generateEmailHtml } = await import("@/lib/email/email-templates");

      const emailHtml = generateEmailHtml("welcome-verified", { userName });

      if (emailHtml) {
        const result = await sendEmail({
          to: email,
          subject: "Welcome to Flowauxi! 🎉",
          html: emailHtml,
        });

        if (!result.success) {
          console.error("Failed to send welcome email:", result.error);
          return NextResponse.json(
            { error: "Failed to send welcome email" },
            { status: 500 }
          );
        }

        console.log(`✅ Welcome email sent to ${email}`);
      }
    } catch (emailError) {
      console.error("Error sending welcome email:", emailError);
      return NextResponse.json(
        { error: "Failed to send welcome email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Welcome email sent successfully",
    });
  } catch (error) {
    console.error("Send welcome email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
