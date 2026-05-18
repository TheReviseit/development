import { localizedImageConverterMetadata, renderLocalizedImageConverterPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedImageConverterMetadata("kn");
}

export default function KnToolsImageConverterPage() {
  return renderLocalizedImageConverterPage("kn");
}
