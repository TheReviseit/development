import { notFound } from "next/navigation";
import FileToolComingSoon from "@/components/file-tools/FileToolComingSoon";
import VideoWhatsappConverterShell from "@/components/file-tools/VideoWhatsappConverterShell";
import { getFileToolBySlug } from "@/lib/file-tools/tool-catalog";

interface FileToolPlaceholderPageProps {
  params: Promise<{ tool: string }>;
}

export async function generateMetadata({ params }: FileToolPlaceholderPageProps) {
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

export default async function FileToolPlaceholderPage({ params }: FileToolPlaceholderPageProps) {
  const { tool: slug } = await params;
  const tool = getFileToolBySlug(slug);
  if (!tool) notFound();

  if (tool.slug === "video-converter-for-whatsapp") {
    return <VideoWhatsappConverterShell basePath="/files" />;
  }

  return <FileToolComingSoon tool={tool} backHref="/tools" />;
}
