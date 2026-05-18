import { localizedImageConverterMetadata, renderLocalizedImageConverterPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedImageConverterMetadata("ta");
}

export default function TaToolsImageConverterPage() {
  return renderLocalizedImageConverterPage("ta");
}
