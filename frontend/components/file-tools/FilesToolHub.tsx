import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Archive,
  FileImage,
  FileLock2,
  FileSignature,
  FileText,
  Files,
  Minimize2,
  ScanText,
  Sparkles,
} from "lucide-react";
import { getLocaleMetadata } from "@/constants/languages";
import { FILE_TOOL_CATALOG, type FileToolCatalogItem } from "@/lib/file-tools/tool-catalog";
import styles from "./files-hub.module.css";

interface FilesToolHubProps {
  basePath?: string;
  showDashboardActions?: boolean;
}

const categories = [
  "all",
  "workflows",
  "organizePdf",
  "optimizePdf",
  "convertPdf",
  "editPdf",
  "pdfSecurity",
  "pdfIntelligence",
] as const;

const preferredToolOrder = [
  "text_to_pdf",
  "merge_pdf",
  "split_pdf",
  "compress_pdf",
  "pdf_to_docx",
  "pdf_to_ppt",
  "pdf_to_excel",
  "docx_to_pdf",
  "ppt_to_pdf",
  "excel_to_pdf",
  "edit_pdf",
  "image_converter",
  "image_to_pdf",
  "pdf_to_image",
  "rotate_pdf",
  "unlock_pdf",
  "watermark_pdf",
  "protect_pdf",
  "sign_pdf",
  "ocr",
  "html_to_pdf",
];

const orderedTools = [
  ...preferredToolOrder
    .map((key) => FILE_TOOL_CATALOG.find((tool) => tool.key === key))
    .filter((tool): tool is FileToolCatalogItem => Boolean(tool)),
  ...FILE_TOOL_CATALOG.filter((tool) => !preferredToolOrder.includes(tool.key)),
];

export default function FilesToolHub({
  basePath = "/tools",
  showDashboardActions = false,
}: FilesToolHubProps) {
  const locale = useLocale();
  const localeMetadata = getLocaleMetadata(locale);
  const t = useTranslations("files.hub");
  const catalog = useTranslations("tools.catalog");

  return (
    <main className={styles.page} dir={localeMetadata.direction}>
      <div
        className={styles.shell}
        data-locale={localeMetadata.code}
        data-script={localeMetadata.script}
      >
        <section className={styles.header}>
          <div>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.copy}>
              {t("description")}
            </p>
          </div>
          {showDashboardActions && (
            <div className={styles.actions}>
              <Link className={styles.actionLink} href="/dashboard/files/history">
                {t("actions.history")}
              </Link>
              <Link className={styles.actionLink} href="/dashboard/files/settings">
                {t("actions.settings")}
              </Link>
            </div>
          )}
        </section>

        <nav className={styles.categoryPills} aria-label={t("aria.categories")} data-files-category-rail>
          {categories.map((category, index) => {
            const fullLabel = t(`categories.${category}`);
            const compactLabel = t(`categoriesShort.${category}`);

            return (
              <span
                key={category}
                className={`${styles.categoryPill} ${index === 0 ? styles.categoryPillActive : ""}`}
                title={fullLabel}
                aria-label={fullLabel}
                data-files-category-pill
              >
                <span className={styles.categoryPillText} data-files-category-pill-text>
                  {compactLabel}
                </span>
              </span>
            );
          })}
        </nav>

        <section className={styles.grid} aria-label={t("aria.tools")}>
          {orderedTools.map((tool) => (
            <ToolCard
              key={tool.key}
              tool={tool}
              href={`${basePath}/${tool.slug}`}
              name={catalog(`${tool.key}.name`)}
              description={catalog(`${tool.key}.description`)}
              openLabel={t("aria.openTool", { name: catalog(`${tool.key}.name`) })}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function ToolCard({
  tool,
  href,
  name,
  description,
  openLabel,
}: {
  tool: FileToolCatalogItem;
  href: string;
  name: string;
  description: string;
  openLabel: string;
}) {
  return (
    <Link className={styles.toolCard} href={href} aria-label={openLabel} data-files-tool-card>
      <span className={`${styles.iconWrap} ${getToolToneClass(tool)}`} data-files-tool-card-icon>
        <ToolIcon tool={tool} />
      </span>
      <h2 className={styles.toolName} data-files-tool-card-title>{name}</h2>
      <p className={styles.toolDescription} data-files-tool-card-description>{description}</p>
    </Link>
  );
}

function getToolToneClass(tool: FileToolCatalogItem) {
  if (tool.key.includes("merge") || tool.key.includes("split")) return styles.toneCoral;
  if (tool.key.includes("compress")) return styles.toneGreen;
  if (tool.key.includes("docx") || tool.key.includes("word")) return styles.toneBlue;
  if (tool.key.includes("ppt") || tool.key.includes("powerpoint")) return styles.toneOrange;
  if (tool.key.includes("excel")) return styles.toneEmerald;
  if (tool.key.includes("image")) return styles.toneAmber;
  if (tool.key.includes("edit") || tool.key.includes("watermark")) return styles.toneRose;
  if (tool.key.includes("protect") || tool.key.includes("sign") || tool.key.includes("unlock")) return styles.tonePurple;
  if (tool.key.includes("ocr") || tool.category === "ai") return styles.toneIndigo;
  return styles.toneRed;
}

function ToolIcon({ tool }: { tool: FileToolCatalogItem }) {
  if (tool.key.includes("docx") || tool.key.includes("word")) return <span className={styles.letterIcon}>W</span>;
  if (tool.key.includes("ppt") || tool.key.includes("powerpoint")) return <span className={styles.letterIcon}>P</span>;
  if (tool.key.includes("excel")) return <span className={styles.letterIcon}>X</span>;
  if (tool.key === "text_to_pdf") return <FileText size={22} aria-hidden="true" />;
  if (tool.key.includes("image")) return <FileImage size={22} aria-hidden="true" />;
  if (tool.key.includes("merge") || tool.key.includes("split")) return <Files size={22} aria-hidden="true" />;
  if (tool.key.includes("compress")) return <Minimize2 size={22} aria-hidden="true" />;
  if (tool.key.includes("protect") || tool.key.includes("unlock")) return <FileLock2 size={22} aria-hidden="true" />;
  if (tool.key.includes("edit") || tool.key.includes("watermark")) return <FileSignature size={22} aria-hidden="true" />;
  if (tool.key.includes("sign")) return <FileSignature size={22} aria-hidden="true" />;
  if (tool.key.includes("ocr")) return <ScanText size={22} aria-hidden="true" />;
  if (tool.category === "ai") return <Sparkles size={22} aria-hidden="true" />;
  if (tool.category === "organize") return <Archive size={22} aria-hidden="true" />;
  return <FileText size={22} aria-hidden="true" />;
}
