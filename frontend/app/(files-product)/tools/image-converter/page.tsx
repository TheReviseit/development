import ImageConverterShell from "@/components/file-tools/ImageConverterShell";

export async function generateMetadata() {
  return {
    title: "Image Converter | Flowauxi Tools",
    description: "Convert JPG, PNG, WebP, and supported image formats with Flowauxi Tools.",
  };
}

export default function ToolsImageConverterPage() {
  return <ImageConverterShell basePath="/tools" />;
}
