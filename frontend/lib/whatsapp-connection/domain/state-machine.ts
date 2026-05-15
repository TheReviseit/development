import type { WhatsAppConnectionState } from "./types";

const TRANSITIONS: Record<WhatsAppConnectionState, WhatsAppConnectionState[]> = {
  initiated: ["validating", "cancelled", "expired", "failed"],
  validating: ["locked", "meta_authorized", "conflict", "failed", "needs_user_action"],
  locked: ["meta_authorized", "ownership_checked", "conflict", "failed"],
  meta_authorized: ["ownership_checked", "webhook_subscribed", "conflict", "failed"],
  ownership_checked: ["webhook_subscribed", "phone_registered", "finalizing", "conflict", "failed"],
  webhook_subscribed: ["phone_registered", "finalizing", "needs_user_action", "failed"],
  phone_registered: ["finalizing", "active", "failed"],
  finalizing: ["active", "needs_user_action", "conflict", "failed"],
  active: ["disconnected"],
  cancelled: [],
  conflict: [],
  expired: [],
  failed: [],
  needs_user_action: ["validating", "locked", "active", "disconnected"],
  disconnected: ["validating"],
};

export function canTransition(
  from: WhatsAppConnectionState,
  to: WhatsAppConnectionState,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: WhatsAppConnectionState,
  to: WhatsAppConnectionState,
) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid WhatsApp connection state transition: ${from} -> ${to}`);
  }
}

export function isTerminalState(state: WhatsAppConnectionState): boolean {
  return TRANSITIONS[state]?.length === 0;
}
