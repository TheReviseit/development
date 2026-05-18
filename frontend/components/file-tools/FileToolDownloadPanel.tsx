"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, Share2, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { FileToolArtifact } from "@/lib/file-tools/contracts";
import styles from "./file-tools.module.css";

interface FileToolDownloadPanelProps {
  characterCount: number;
  hasContent: boolean;
  pageEstimate: number;
  limit: number;
  isGenerating: boolean;
  error?: string | null;
  artifact?: FileToolArtifact | null;
  downloadUrl?: string | null;
  autosaveStatus: "idle" | "saving" | "saved" | "error";
  onGenerate: () => void;
  onDownload?: () => void;
}

export default function FileToolDownloadPanel({
  characterCount,
  hasContent,
  pageEstimate,
  limit,
  isGenerating,
  error,
  artifact,
  downloadUrl,
  autosaveStatus,
  onGenerate,
  onDownload,
}: FileToolDownloadPanelProps) {
  const t = useTranslations("files.textToPdf.export");
  const locale = useLocale();
  const overLimit = characterCount > limit;
  const emptyDocument = !hasContent;
  const hasReadyArtifact = Boolean(hasContent && artifact && downloadUrl);
  const [shareState, setShareState] = useState<{
    artifactId?: string;
    status: "idle" | "copied" | "error" | "unsupported";
  }>({ status: "idle" });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const shareStatus = hasReadyArtifact && shareState.artifactId === artifact?.id ? shareState.status : "idle";
  const setCurrentShareStatus = (status: typeof shareState.status) => {
    setShareState({ artifactId: artifact?.id, status });
  };

  const handleShare = async () => {
    if (!hasReadyArtifact || !artifact || !downloadUrl) return;

    const absoluteDownloadUrl = new URL(downloadUrl, window.location.href).toString();
    const title = artifact.filename || "Flowauxi PDF";
    const canNativeShare = typeof navigator.share === "function";
    setCurrentShareStatus("idle");

    try {
      if (!canNativeShare) {
        await copyShareLink(absoluteDownloadUrl);
        setCurrentShareStatus("copied");
        return;
      }

      await navigator.share({
        title,
        text: t("shareText"),
        url: absoluteDownloadUrl,
      });
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;

      try {
        await copyShareLink(absoluteDownloadUrl);
        setCurrentShareStatus("copied");
      } catch {
        setCurrentShareStatus(canNativeShare ? "error" : "unsupported");
      }
    }
  };

  const handleDownload = async () => {
    if (!hasReadyArtifact || !artifact || !downloadUrl || isDownloading) return;

    setIsDownloading(true);
    setDownloadFailed(false);
    try {
      await downloadArtifact(downloadUrl, artifact.filename || "flowauxi.pdf");
      onDownload?.();
    } catch {
      setDownloadFailed(true);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section
      className={styles.exportPanel}
      data-text-pdf-export-panel
      aria-label={t("aria")}
    >
      <div className={styles.exportSummary}>
        <div className={styles.statusLine}>
          <span>{t("chars", { count: characterCount.toLocaleString(locale), limit: limit.toLocaleString(locale) })}</span>
          <span>{t("pages", { count: pageEstimate })}</span>
        </div>
        <span className={styles.meta}>{autosaveCopy(autosaveStatus, t)}</span>
      </div>
      <div className={styles.downloadPanel}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onGenerate}
          disabled={isGenerating || overLimit || emptyDocument}
        >
          {isGenerating ? <Loader2 className={styles.spin} size={17} /> : <Wand2 size={17} />}
          {t("generate")}
        </button>
        {hasReadyArtifact && artifact && downloadUrl && (
          <div className={styles.exportReadyActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 className={styles.spin} size={17} /> : <Download size={17} />}
              {isDownloading ? t("downloading") : t("download", { size: formatBytes(artifact.sizeBytes) })}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleShare}>
              <Share2 size={17} />
              {t("share")}
            </button>
          </div>
        )}
        {emptyDocument && (
          <div className={`${styles.statusLine} ${styles.errorText}`}>
            <AlertCircle size={16} />
            {t("emptyDocument")}
          </div>
        )}
        {overLimit && (
          <div className={`${styles.statusLine} ${styles.errorText}`}>
            <AlertCircle size={16} />
            {t("characterLimitExceeded")}
          </div>
        )}
        {error && (
          <div className={`${styles.statusLine} ${styles.errorText}`}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        {downloadFailed && (
          <div className={`${styles.statusLine} ${styles.errorText}`}>
            <AlertCircle size={16} />
            {t("downloadFailed")}
          </div>
        )}
        {hasReadyArtifact && artifact && !error && (
          <div className={`${styles.statusLine} ${styles.successText}`}>
            <CheckCircle2 size={16} />
            {t("readyUntil", { date: formatExpiryDate(artifact.expiresAt, locale) })}
          </div>
        )}
        {shareStatus === "copied" && (
          <div className={`${styles.statusLine} ${styles.successText}`}>
            <CheckCircle2 size={16} />
            {t("shareCopied")}
          </div>
        )}
        {shareStatus === "unsupported" && (
          <div className={`${styles.statusLine} ${styles.errorText}`}>
            <AlertCircle size={16} />
            {t("shareUnavailable")}
          </div>
        )}
        {shareStatus === "error" && (
          <div className={`${styles.statusLine} ${styles.errorText}`}>
            <AlertCircle size={16} />
            {t("shareFailed")}
          </div>
        )}
      </div>
    </section>
  );
}

function autosaveCopy(status: FileToolDownloadPanelProps["autosaveStatus"], t: ReturnType<typeof useTranslations>) {
  if (status === "saving") return t("saving");
  if (status === "saved") return t("saved");
  if (status === "error") return t("draftOffline");
  return t("draftReady");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExpiryDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

async function copyShareLink(url: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard unavailable");
  }

  await navigator.clipboard.writeText(url);
}

async function downloadArtifact(downloadUrl: string, filename: string) {
  const response = await fetch(downloadUrl, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Download failed");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
