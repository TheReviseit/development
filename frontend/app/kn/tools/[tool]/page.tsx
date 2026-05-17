import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface KnToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: KnToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("kn", tool);
}

export default async function KnToolPage({ params }: KnToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("kn", tool);
}
