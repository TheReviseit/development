import FilesToolHub from "@/components/file-tools/FilesToolHub";

export const metadata = {
  title: "Tools | Flowauxi",
  description: "Choose a PDF or document tool in Flowauxi Tools.",
};

export default function ToolsPage() {
  return <FilesToolHub basePath="/tools" />;
}
