"use client";

import { useLocale } from "next-intl";
import { getLocaleMetadata } from "@/constants/languages";

export function useLocaleMetadata() {
  return getLocaleMetadata(useLocale());
}
