import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("ta");
}

export default function TaToolsTextToPdfPage() {
  return renderLocalizedTextToPdfPage("ta");
}
