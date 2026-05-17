import type { ReactNode } from "react";
import { renderLocalizedFilesLayout } from "@/lib/i18n/localized-files-pages";

export default function EnToolsLayout({ children }: { children: ReactNode }) {
  return renderLocalizedFilesLayout("en", children);
}
