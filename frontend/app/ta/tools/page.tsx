import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("ta");
}

export default function TaToolsPage() {
  return renderLocalizedFilesPage("ta");
}
