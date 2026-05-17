import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("kn");
}

export default function KnToolsTextToPdfPage() {
  return renderLocalizedTextToPdfPage("kn");
}
