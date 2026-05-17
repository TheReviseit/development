import { localizedTextToPdfMetadata, renderLocalizedTextToPdfPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedTextToPdfMetadata("ml");
}

export default function MlTextToPdfPage() {
  return renderLocalizedTextToPdfPage("ml");
}
