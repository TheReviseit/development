import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("kn");
}

export default function KnToolsPage() {
  return renderLocalizedFilesPage("kn");
}
