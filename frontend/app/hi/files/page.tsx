import { localizedFilesMetadata, renderLocalizedFilesPage } from "@/lib/i18n/localized-files-pages";

export async function generateMetadata() {
  return localizedFilesMetadata("hi");
}

export default function HiFilesPage() {
  return renderLocalizedFilesPage("hi");
}
