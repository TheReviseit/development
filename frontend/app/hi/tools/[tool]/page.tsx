import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface HiToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: HiToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("hi", tool);
}

export default async function HiToolPage({ params }: HiToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("hi", tool);
}
