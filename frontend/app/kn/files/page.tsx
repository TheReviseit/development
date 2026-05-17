import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("kn");
}

export default function KnFilesPage() {
  return renderLocalizedFilesPage("kn");
}
