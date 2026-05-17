import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("te");
}

export default function TeFilesPage() {
  return renderLocalizedFilesPage("te");
}
