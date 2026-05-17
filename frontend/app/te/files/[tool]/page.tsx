import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface TeFileToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: TeFileToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("te", tool);
}

export default async function TeFileToolPage({ params }: TeFileToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("te", tool);
}
