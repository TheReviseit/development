/**
 * Cron worker: process pending WhatsApp webhook subscribe jobs.
 * Schedule: every 1-5 minutes via Vercel Cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { processWebhookSubscribeJobs } from "@/lib/whatsapp/webhook-subscribe-jobs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processWebhookSubscribeJobs(20);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[cron/webhook-subscribe] failed", error);
    return NextResponse.json(
      { error: error.message || "Worker failed" },
      { status: 500 },
    );
  }
}
