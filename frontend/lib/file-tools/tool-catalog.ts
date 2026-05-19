export type FileToolStatus = "available" | "coming_soon";

export interface FileToolCatalogItem {
  key: string;
  slug: string;
  name: string;
  description: string;
  category: "convert" | "organize" | "optimize" | "secure" | "edit" | "ai";
  status: FileToolStatus;
}

export const FILE_TOOL_CATALOG: FileToolCatalogItem[] = [
  {
    key: "text_to_pdf",
    slug: "text-to-pdf",
    name: "Text to PDF",
    description: "Create polished PDF documents from rich text, lists, symbols, and formatted content.",
    category: "convert",
    status: "available",
  },
  {
    key: "pdf_to_docx",
    slug: "pdf-to-word",
    name: "PDF to Word",
    description: "Convert PDF files into editable DOC and DOCX documents with clean structure.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "docx_to_pdf",
    slug: "word-to-pdf",
    name: "Word to PDF",
    description: "Turn DOC and DOCX files into crisp PDF documents ready to share.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "merge_pdf",
    slug: "merge-pdf",
    name: "Merge PDF",
    description: "Combine PDFs in the order you want with an easy document merger.",
    category: "organize",
    status: "coming_soon",
  },
  {
    key: "split_pdf",
    slug: "split-pdf",
    name: "Split PDF",
    description: "Separate one page or a full page range into independent PDF files.",
    category: "organize",
    status: "coming_soon",
  },
  {
    key: "compress_pdf",
    slug: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce file size while preserving sharp, share-ready PDF quality.",
    category: "optimize",
    status: "coming_soon",
  },
  {
    key: "pdf_to_ppt",
    slug: "pdf-to-powerpoint",
    name: "PDF to PowerPoint",
    description: "Turn PDF files into editable PPT and PPTX slide decks for presentations.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "pdf_to_excel",
    slug: "pdf-to-excel",
    name: "PDF to Excel",
    description: "Pull tables and data from PDFs into editable spreadsheets.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "ppt_to_pdf",
    slug: "powerpoint-to-pdf",
    name: "PowerPoint to PDF",
    description: "Convert presentation slides into polished PDF files for sharing.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "excel_to_pdf",
    slug: "excel-to-pdf",
    name: "Excel to PDF",
    description: "Export spreadsheets as clean PDFs while preserving layout and readability.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "edit_pdf",
    slug: "edit-pdf",
    name: "Edit PDF",
    description: "Add text, images, shapes, highlights, and annotations to PDF files.",
    category: "edit",
    status: "coming_soon",
  },
  {
    key: "image_to_pdf",
    slug: "image-to-pdf",
    name: "Image to PDF",
    description: "Turn JPG, PNG, and image scans into organized PDF documents.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "image_converter",
    slug: "image-converter",
    name: "Image Converter",
    description: "Convert JPG, PNG, WebP, and supported image formats.",
    category: "convert",
    status: "available",
  },
  {
    key: "video_whatsapp_converter",
    slug: "video-converter-for-whatsapp",
    name: "Video Converter for WhatsApp",
    description: "Convert MOV, MP4, WebM, MKV, and other videos into WhatsApp-friendly MP4 files.",
    category: "convert",
    status: "available",
  },
  {
    key: "pdf_to_image",
    slug: "pdf-to-image",
    name: "PDF to Image",
    description: "Export PDF pages as high-quality images for sharing or archiving.",
    category: "convert",
    status: "coming_soon",
  },
  {
    key: "rotate_pdf",
    slug: "rotate-pdf",
    name: "Rotate PDF",
    description: "Rotate one page or every page in a PDF and save the corrected file.",
    category: "organize",
    status: "coming_soon",
  },
  {
    key: "unlock_pdf",
    slug: "unlock-pdf",
    name: "Unlock PDF",
    description: "Remove document restrictions from files you own and need to edit.",
    category: "secure",
    status: "coming_soon",
  },
  {
    key: "watermark_pdf",
    slug: "watermark-pdf",
    name: "Watermark PDF",
    description: "Apply text or image watermarks across PDF pages with consistent placement.",
    category: "edit",
    status: "coming_soon",
  },
  {
    key: "ocr",
    slug: "ocr",
    name: "OCR",
    description: "Recognize text from scanned documents and make content searchable.",
    category: "ai",
    status: "available",
  },
  {
    key: "protect_pdf",
    slug: "protect-pdf",
    name: "Protect PDF",
    description: "Add password protection and access controls to sensitive PDF files.",
    category: "secure",
    status: "coming_soon",
  },
  {
    key: "sign_pdf",
    slug: "sign-pdf",
    name: "Sign PDF",
    description: "Prepare documents for signatures and everyday approval workflows.",
    category: "secure",
    status: "coming_soon",
  },
  {
    key: "html_to_pdf",
    slug: "html-to-pdf",
    name: "HTML to PDF",
    description: "Render web pages, invoices, and HTML content as reliable PDF files.",
    category: "convert",
    status: "coming_soon",
  },
];

export function getFileToolBySlug(slug: string) {
  return FILE_TOOL_CATALOG.find((tool) => tool.slug === slug) || null;
}
