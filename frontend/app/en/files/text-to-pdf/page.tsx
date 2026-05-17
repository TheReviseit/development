import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("en");
}

export default function EnTextToPdfPage() {
  return renderLocalizedTextToPdfPage("en");
}
