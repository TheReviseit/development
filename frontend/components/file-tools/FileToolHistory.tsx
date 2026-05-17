"use client";

import { Clock3, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { FileToolHistoryItem } from "@/lib/file-tools/contracts";
import styles from "./file-tools.module.css";

interface FileToolHistoryProps {
  authenticated: boolean;
  items: FileToolHistoryItem[];
  loading?: boolean;
}

export default function FileToolHistory({ authenticated, items, loading }: FileToolHistoryProps) {
  const t = useTranslations("files.textToPdf.history");
  const locale = useLocale();

  return (
    <section className={styles.panel} aria-labelledby="file-tool-history-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle} id="file-tool-history-title">
          <Clock3 size={17} aria-hidden="true" />
          {t("panel")}
        </div>
      </div>
      <div className={styles.historyList}>
        {!authenticated && <p className={styles.meta}>{t("signInPrompt")}</p>}
        {authenticated && loading && <p className={styles.meta}>{t("loading")}</p>}
        {authenticated && !loading && items.length === 0 && <p className={styles.meta}>{t("empty")}</p>}
        {items.map((item) => (
          <div key={item.id} className={styles.historyItem}>
            <div className={styles.historyName}>{item.filename}</div>
            <div className={styles.historyMeta}>
              {t("meta", {
                count: item.downloadCount,
                date: new Date(item.createdAt).toLocaleDateString(locale),
                size: formatBytes(item.sizeBytes),
              })}
            </div>
            {item.downloadUrl && (
              <a className={styles.secondaryButton} href={item.downloadUrl}>
                <Download size={15} />
                {t("download")}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
