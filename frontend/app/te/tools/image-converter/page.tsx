import { localizedImageConverterMetadata, renderLocalizedImageConverterPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedImageConverterMetadata("te");
}

export default function TeToolsImageConverterPage() {
  return renderLocalizedImageConverterPage("te");
}
