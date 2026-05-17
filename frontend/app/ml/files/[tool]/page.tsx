import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface MlFileToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: MlFileToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("ml", tool);
}

export default async function MlFileToolPage({ params }: MlFileToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("ml", tool);
}
