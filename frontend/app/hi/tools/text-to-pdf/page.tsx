import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("hi");
}

export default function HiToolsTextToPdfPage() {
  return renderLocalizedTextToPdfPage("hi");
}
