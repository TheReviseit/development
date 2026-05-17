import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface KnFileToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: KnFileToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("kn", tool);
}

export default async function KnFileToolPage({ params }: KnFileToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("kn", tool);
}
