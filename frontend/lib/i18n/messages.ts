import "server-only";

import englishMessages from "../../messages/en.json";
import { DEFAULT_LOCALE } from "@/constants/languages";
import type { Locale } from "@/types/i18n";

type MessageTree = Record<string, unknown>;

export async function loadLocaleMessages(locale: Locale): Promise<MessageTree> {
  const localeMessages = (await import(`../../messages/${locale}.json`)).default as MessageTree;

  if (locale === DEFAULT_LOCALE) {
    return englishMessages;
  }

  return mergeWithEnglishFallback(englishMessages, localeMessages);
}

function mergeWithEnglishFallback(base: MessageTree, override: MessageTree): MessageTree {
  const merged: MessageTree = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];

    if (isMessageTree(baseValue) && isMessageTree(value)) {
      merged[key] = mergeWithEnglishFallback(baseValue, value);
      continue;
    }

    merged[key] = isUsableMessageValue(value) ? value : baseValue;
  }

  return merged;
}

function isMessageTree(value: unknown): value is MessageTree {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUsableMessageValue(value: unknown) {
  if (typeof value !== "string") return value !== undefined && value !== null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== "?";
}
