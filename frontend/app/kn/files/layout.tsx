import type { ReactNode } from "react";
import { renderLocalizedFilesLayout } from "@/lib/i18n/localized-files-pages";

export default function KnFilesLayout({ children }: { children: ReactNode }) {
  return renderLocalizedFilesLayout("kn", children);
}
