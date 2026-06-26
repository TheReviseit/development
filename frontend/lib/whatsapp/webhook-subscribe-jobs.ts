/**
 * Durable webhook subscribe job queue for WhatsApp embedded signup.
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service-client";
import { decryptToken } from "@/lib/encryption/crypto";

const GRAPH_VERSION = "v24.0";
const RETRY_DELAYS_MS = [30_000, 120_000, 300_000, 900_000, 1_800_000];

export type WebhookJobStatus = "pending" | "completed" | "failed";
export type WebhookAccountStatus = "pending" | "active" | "failed";

export interface EnqueueWebhookSubscribeJobInput {
  wabaId: string;
  userId: string;
  whatsappAccountId: string;
  facebookAccountId: string;
  correlationId?: string | null;
}

export async function enqueueWebhookSubscribeJob(
  input: EnqueueWebhookSubscribeJobInput,
): Promise<void> {
  const supabase = getSupabaseServiceClient({ timeoutMs: 5000 });

  const { error: accountError } = await supabase
    .from("connected_whatsapp_accounts")
    .update({ webhook_status: "pending" })
    .eq("id", input.whatsappAccountId);

  if (accountError) {
    throw accountError;
  }

  const { data: existing } = await supabase
    .from("whatsapp_webhook_subscribe_jobs")
    .select("id")
    .eq("waba_id", input.wabaId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing?.id) {
    return;
  }

  const { error: insertError } = await supabase
    .from("whatsapp_webhook_subscribe_jobs")
    .insert({
      waba_id: input.wabaId,
      user_id: input.userId,
      whatsapp_account_id: input.whatsappAccountId,
      facebook_account_id: input.facebookAccountId,
      status: "pending",
      attempt_count: 0,
      next_retry_at: new Date().toISOString(),
      correlation_id: input.correlationId ?? null,
    });

  if (insertError) {
    throw insertError;
  }
}

async function subscribeWabaWebhook(
  wabaId: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.ok) {
    return { ok: true };
  }

  const errorData = await response.json().catch(() => ({}));
  return {
    ok: false,
    error:
      errorData?.error?.message ||
      `Meta webhook subscribe failed (${response.status})`,
  };
}

function nextRetryAt(attemptCount: number): string {
  const delayMs =
    RETRY_DELAYS_MS[Math.min(attemptCount, RETRY_DELAYS_MS.length - 1)] ??
    RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delayMs).toISOString();
}

export async function processWebhookSubscribeJobs(limit = 10): Promise<{
  processed: number;
  completed: number;
  retried: number;
  failed: number;
  queueDepth: number;
}> {
  const supabase = getSupabaseServiceClient({ timeoutMs: 8000 });
  const now = new Date().toISOString();

  const { data: jobs, error: fetchError } = await supabase
    .from("whatsapp_webhook_subscribe_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    throw fetchError;
  }

  const { count: queueDepth } = await supabase
    .from("whatsapp_webhook_subscribe_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const { data: facebookAccount, error: tokenError } = await supabase
      .from("connected_facebook_accounts")
      .select("access_token, status")
      .eq("id", job.facebook_account_id)
      .maybeSingle();

    if (tokenError || !facebookAccount?.access_token) {
      await markJobRetryOrFailed(supabase, job, "Missing Facebook access token");
      retried += 1;
      continue;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(facebookAccount.access_token);
    } catch {
      await markJobRetryOrFailed(supabase, job, "Failed to decrypt access token");
      retried += 1;
      continue;
    }

    const result = await subscribeWabaWebhook(job.waba_id, accessToken);
    if (result.ok) {
      await supabase
        .from("whatsapp_webhook_subscribe_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", job.id);

      await supabase
        .from("connected_whatsapp_accounts")
        .update({ webhook_status: "active" })
        .eq("id", job.whatsapp_account_id);

      completed += 1;
      continue;
    }

    const exhausted = job.attempt_count + 1 >= job.max_attempts;
    if (exhausted) {
      await supabase
        .from("whatsapp_webhook_subscribe_jobs")
        .update({
          status: "failed",
          attempt_count: job.attempt_count + 1,
          last_error: result.error ?? "Unknown webhook subscribe error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      await supabase
        .from("connected_whatsapp_accounts")
        .update({ webhook_status: "failed" })
        .eq("id", job.whatsapp_account_id);

      console.error("WEBHOOK_SUBSCRIBE_EXHAUSTED", {
        correlation_id: job.correlation_id,
        waba_id: job.waba_id,
        user_id: job.user_id,
        error: result.error,
      });

      failed += 1;
      continue;
    }

    await supabase
      .from("whatsapp_webhook_subscribe_jobs")
      .update({
        attempt_count: job.attempt_count + 1,
        next_retry_at: nextRetryAt(job.attempt_count),
        last_error: result.error ?? "Unknown webhook subscribe error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    retried += 1;
  }

  if ((queueDepth ?? 0) > 10) {
    console.warn("WEBHOOK_SUBSCRIBE_QUEUE_DEPTH_HIGH", {
      queue_depth: queueDepth,
    });
  }

  return {
    processed: jobs?.length ?? 0,
    completed,
    retried,
    failed,
    queueDepth: queueDepth ?? 0,
  };
}

async function markJobRetryOrFailed(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  job: {
    id: string;
    attempt_count: number;
    max_attempts: number;
    whatsapp_account_id: string;
    correlation_id: string | null;
    waba_id: string;
    user_id: string;
  },
  errorMessage: string,
) {
  const exhausted = job.attempt_count + 1 >= job.max_attempts;
  if (exhausted) {
    await supabase
      .from("whatsapp_webhook_subscribe_jobs")
      .update({
        status: "failed",
        attempt_count: job.attempt_count + 1,
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await supabase
      .from("connected_whatsapp_accounts")
      .update({ webhook_status: "failed" })
      .eq("id", job.whatsapp_account_id);

    console.error("WEBHOOK_SUBSCRIBE_EXHAUSTED", {
      correlation_id: job.correlation_id,
      waba_id: job.waba_id,
      user_id: job.user_id,
      error: errorMessage,
    });
    return;
  }

  await supabase
    .from("whatsapp_webhook_subscribe_jobs")
    .update({
      attempt_count: job.attempt_count + 1,
      next_retry_at: nextRetryAt(job.attempt_count),
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

export async function getWebhookStatusForWaba(
  userId: string,
  wabaId: string,
): Promise<WebhookAccountStatus | null> {
  const supabase = getSupabaseServiceClient({ timeoutMs: 3000 });
  const { data, error } = await supabase
    .from("connected_whatsapp_accounts")
    .select("webhook_status")
    .eq("user_id", userId)
    .eq("waba_id", wabaId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data?.webhook_status) return null;
  return data.webhook_status as WebhookAccountStatus;
}
