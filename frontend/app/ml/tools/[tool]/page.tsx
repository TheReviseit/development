import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface MlToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: MlToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("ml", tool);
}

export default async function MlToolPage({ params }: MlToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("ml", tool);
}
