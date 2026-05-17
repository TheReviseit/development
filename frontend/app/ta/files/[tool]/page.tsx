import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface TaFileToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: TaFileToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("ta", tool);
}

export default async function TaFileToolPage({ params }: TaFileToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("ta", tool);
}
