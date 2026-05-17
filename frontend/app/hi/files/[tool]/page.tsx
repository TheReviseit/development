import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface HiFileToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: HiFileToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("hi", tool);
}

export default async function HiFileToolPage({ params }: HiFileToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("hi", tool);
}
