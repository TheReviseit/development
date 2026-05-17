import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("ml");
}

export default function MlToolsPage() {
  return renderLocalizedFilesPage("ml");
}
