import { localizedImageConverterMetadata, renderLocalizedImageConverterPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedImageConverterMetadata("hi");
}

export default function HiToolsImageConverterPage() {
  return renderLocalizedImageConverterPage("hi");
}
