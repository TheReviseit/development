import type { ReactNode } from "react";
import { renderLocalizedFilesLayout } from "@/lib/i18n/localized-files-pages";

export default function EnFilesLayout({ children }: { children: ReactNode }) {
  return renderLocalizedFilesLayout("en", children);
}
