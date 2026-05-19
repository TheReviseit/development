import OcrUploadShell from "@/components/file-tools/OcrUploadShell";

export const metadata = {
  title: "OCR | Flowauxi Tools",
  description: "Extract searchable text from images with Flowauxi Tools.",
};

export default function PublicOcrToolsPage() {
  return <OcrUploadShell basePath="/tools" />;
}
