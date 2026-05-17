import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("en");
}

export default function EnToolsPage() {
  return renderLocalizedFilesPage("en");
}
