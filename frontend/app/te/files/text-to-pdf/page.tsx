import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("te");
}

export default function TeTextToPdfPage() {
  return renderLocalizedTextToPdfPage("te");
}
