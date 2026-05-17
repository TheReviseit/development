import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

interface I18nProviderProps {
  children: ReactNode;
}

export default function I18nProvider({ children }: I18nProviderProps) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
