import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface TaToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: TaToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("ta", tool);
}

export default async function TaToolPage({ params }: TaToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("ta", tool);
}
