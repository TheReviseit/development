import VideoWhatsappConverterShell from "@/components/file-tools/VideoWhatsappConverterShell";

export const metadata = {
  title: "Video Converter for WhatsApp | Flowauxi Tools",
};

export default function DashboardVideoConverterForWhatsappPage() {
  return <VideoWhatsappConverterShell basePath="/dashboard/files" />;
}
