import { notFound } from "next/navigation";
import FileToolComingSoon from "@/components/file-tools/FileToolComingSoon";
import { getFileToolBySlug } from "@/lib/file-tools/tool-catalog";

interface DashboardFileToolPlaceholderPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: DashboardFileToolPlaceholderPageProps) {
  const { tool: slug } = await params;
  const tool = getFileToolBySlug(slug);
  if (!tool) {
    return { title: "Tools | Flowauxi" };
  }
  return {
    title: `${tool.name} | Flowauxi Tools`,
    description: tool.description,
  };
}

export default async function DashboardFileToolPlaceholderPage({
  params,
}: DashboardFileToolPlaceholderPageProps) {
  const { tool: slug } = await params;
  const tool = getFileToolBySlug(slug);
  if (!tool) notFound();

  return <FileToolComingSoon tool={tool} backHref="/dashboard/files" />;
}
