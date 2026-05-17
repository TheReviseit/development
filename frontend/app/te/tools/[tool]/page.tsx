import { localizedFileToolMetadata, renderLocalizedFileToolPage } from "@/lib/i18n/localized-files-pages";

interface TeToolPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: TeToolPageProps) {
  const { tool } = await params;
  return localizedFileToolMetadata("te", tool);
}

export default async function TeToolPage({ params }: TeToolPageProps) {
  const { tool } = await params;
  return renderLocalizedFileToolPage("te", tool);
}
