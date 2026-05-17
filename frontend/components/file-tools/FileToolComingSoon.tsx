import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Clock3, FileText } from "lucide-react";
import type { FileToolCatalogItem } from "@/lib/file-tools/tool-catalog";
import styles from "./files-hub.module.css";

interface FileToolComingSoonProps {
  tool: FileToolCatalogItem;
  backHref: string;
}

export default function FileToolComingSoon({ tool, backHref }: FileToolComingSoonProps) {
  const t = useTranslations("files.comingSoon");
  const catalog = useTranslations("tools.catalog");
  const toolName = catalog(`${tool.key}.name`);
  const toolDescription = catalog(`${tool.key}.description`);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.placeholder}>
          <Link className={styles.actionLink} href={backHref}>
            <ArrowLeft size={16} />
            {t("back")}
          </Link>
          <div className={styles.placeholderPanel}>
            <span className={styles.iconWrap}>
              <FileText size={21} aria-hidden="true" />
            </span>
            <span className={styles.eyebrow}>{t("eyebrow")}</span>
            <h1 className={styles.title}>{toolName}</h1>
            <p className={styles.copy}>{toolDescription}</p>
            <div className={styles.footer}>
              <span className={`${styles.badge} ${styles.badgeMuted}`}>
                <Clock3 size={14} />
                {t("planned")}
              </span>
              <Link className={styles.actionLink} href={`${backHref}/text-to-pdf`}>
                {t("openTextToPdf")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
