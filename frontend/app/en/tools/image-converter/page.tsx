import { localizedImageConverterMetadata, renderLocalizedImageConverterPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedImageConverterMetadata("en");
}

export default function EnToolsImageConverterPage() {
  return renderLocalizedImageConverterPage("en");
}
