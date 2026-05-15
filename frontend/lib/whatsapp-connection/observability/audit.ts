import { supabaseAdmin } from "@/lib/supabase/server";
import type { TenantContext } from "../domain/types";

export async function writeWhatsAppAudit(params: {
  tenant: TenantContext;
  attemptId?: string;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("whatsapp_audit_logs").insert({
    tenant_id: params.tenant.tenantId,
    user_id: params.tenant.userId,
    attempt_id: params.attemptId || null,
    action: params.action,
    actor_type: "system",
    actor_id: params.tenant.userId,
    summary: params.summary,
    details: params.details || {},
  });
}
