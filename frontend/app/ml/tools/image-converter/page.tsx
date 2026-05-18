import { localizedImageConverterMetadata, renderLocalizedImageConverterPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedImageConverterMetadata("ml");
}

export default function MlToolsImageConverterPage() {
  return renderLocalizedImageConverterPage("ml");
}
