"use client";

import { useEffect, useRef, useState } from "react";
import type { TextPdfGenerateRequest } from "./contracts";
import { saveTextPdfDraft } from "./api-client";
import { TEXT_TO_PDF_LIMITS } from "./limits";

const LOCAL_DRAFT_KEY = "flowauxi:file-tools:text-to-pdf:draft";

export function loadLocalTextPdfDraft(): TextPdfGenerateRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as TextPdfGenerateRequest) : null;
  } catch {
    return null;
  }
}

export function clearLocalTextPdfDraft() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY);
  }
}

export function useTextPdfAutosave(args: {
  enabled: boolean;
  authenticated: boolean;
  draft: TextPdfGenerateRequest;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastPayloadRef = useRef("");

  useEffect(() => {
    if (!args.enabled) return;
    const payload = JSON.stringify(args.draft);
    if (payload === lastPayloadRef.current) return;

    const timer = window.setTimeout(async () => {
      lastPayloadRef.current = payload;
      setStatus("saving");
      try {
        if (args.authenticated) {
          await saveTextPdfDraft(args.draft);
        } else {
          window.localStorage.setItem(LOCAL_DRAFT_KEY, payload);
        }
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, TEXT_TO_PDF_LIMITS.autosaveDebounceMs);

    return () => window.clearTimeout(timer);
  }, [args.authenticated, args.draft, args.enabled]);

  return status;
}
