import { NextResponse } from "next/server";

export async function POST() {
  console.info(
    "[send-welcome] Deprecated endpoint called; welcome email is sent after product access activation",
  );

  return NextResponse.json({
    success: true,
    skipped: true,
    message: "Welcome email is sent after product access activation.",
  });
}
