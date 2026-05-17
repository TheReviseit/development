import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface EnToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: EnToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("en", tool);
}

export default async function EnToolPage({ params }: EnToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("en", tool);
}
