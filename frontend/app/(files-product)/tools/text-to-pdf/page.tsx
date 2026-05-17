import ToolShell from "@/components/file-tools/ToolShell";

export const metadata = {
  title: "Text to PDF | Flowauxi Tools",
  description: "Create secure PDFs from text with Flowauxi Tools.",
};

export default function PublicTextToPdfToolsPage() {
  return <ToolShell mode="public" basePath="/tools" />;
}
