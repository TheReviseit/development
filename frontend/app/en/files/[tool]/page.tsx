import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface EnFileToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: EnFileToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("en", tool);
}

export default async function EnFileToolPage({ params }: EnFileToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("en", tool);
}
