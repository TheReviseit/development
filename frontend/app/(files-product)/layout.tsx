import type { ReactNode } from "react";
import FilesProductChrome from "@/components/file-tools/FilesProductChrome";

interface FilesProductLayoutProps {
  children: ReactNode;
}

export default function FilesProductLayout({ children }: FilesProductLayoutProps) {
  return <FilesProductChrome>{children}</FilesProductChrome>;
}
