import FilesToolHub from "@/components/file-tools/FilesToolHub";

export const metadata = {
  title: "Tools | Flowauxi",
};

export default function DashboardFilesPage() {
  return <FilesToolHub basePath="/files" showDashboardActions />;
}
