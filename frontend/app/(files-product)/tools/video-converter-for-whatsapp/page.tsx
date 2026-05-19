import VideoWhatsappConverterShell from "@/components/file-tools/VideoWhatsappConverterShell";

export async function generateMetadata() {
  return {
    title: "Video Converter for WhatsApp | Flowauxi Tools",
    description: "Convert MOV, MP4, WebM, MKV, and other videos into WhatsApp-friendly MP4 files.",
  };
}

export default function VideoConverterForWhatsappPage() {
  return <VideoWhatsappConverterShell basePath="/tools" />;
}
