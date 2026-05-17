import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("ml");
}

export default function MlToolsTextToPdfPage() {
  return renderLocalizedTextToPdfPage("ml");
}
