"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  Share2,
  UploadCloud,
} from "lucide-react";
import { convertImage, FileToolsApiError, getImageConverterFormats } from "@/lib/file-tools/api-client";
import type { FileToolArtifact, ImageOutputFormat } from "@/lib/file-tools/contracts";
import { IMAGE_CONVERTER_LIMITS } from "@/lib/file-tools/limits";
import { auth } from "@/src/firebase/firebase";
import styles from "./image-converter.module.css";

interface ImageConverterShellProps {
  basePath?: string;
}

type ShareStatus = "idle" | "copied" | "error" | "unsupported";

const DEFAULT_OUTPUTS: ImageOutputFormat[] = ["jpeg", "png", "webp"];
const FORMAT_LABELS: Record<ImageOutputFormat, string> = {
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
};

export default function ImageConverterShell({ basePath = "/tools" }: ImageConverterShellProps) {
  const t = useTranslations("files.imageConverter");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>("png");
  const [quality, setQuality] = useState<number>(IMAGE_CONVERTER_LIMITS.defaultQuality.png);
  const [background, setBackground] = useState("#ffffff");
  const [supportedOutputs, setSupportedOutputs] = useState<ImageOutputFormat[]>(DEFAULT_OUTPUTS);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<FileToolArtifact | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");

  const maxInputBytes = authenticated
    ? IMAGE_CONVERTER_LIMITS.authenticatedMaxInputBytes
    : IMAGE_CONVERTER_LIMITS.guestMaxInputBytes;
  const hasQuality = outputFormat !== "png";
  const canConvert = Boolean(file && !isConverting);

  useEffect(() => onAuthStateChanged(auth, (user) => setAuthenticated(Boolean(user))), []);

  useEffect(() => {
    let disposed = false;
    getImageConverterFormats()
      .then((response) => {
        if (disposed) return;
        const outputs = response.formats.outputs?.filter(isImageOutputFormat);
        if (outputs?.length) {
          setSupportedOutputs(outputs);
          setOutputFormat((current) => {
            if (outputs.includes(current)) return current;
            setQuality(IMAGE_CONVERTER_LIMITS.defaultQuality[outputs[0]]);
            return outputs[0];
          });
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setDimensions(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    readImageDimensions(url)
      .then(setDimensions)
      .catch(() => setDimensions(null));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const sourceDetails = useMemo(() => {
    if (!file) return null;
    return [
      t("details.size", { size: formatBytes(file.size) }),
      file.type ? t("details.type", { type: file.type }) : null,
      dimensions ? t("details.dimensions", { width: dimensions.width, height: dimensions.height }) : null,
    ].filter(Boolean).join(" - ");
  }, [dimensions, file, t]);

  const handleFile = useCallback((nextFile: File | null) => {
    setError(null);
    setArtifact(null);
    setDownloadUrl(null);
    setSharePayload(null);
    setShareStatus("idle");

    if (!nextFile) {
      setFile(null);
      return;
    }
    if (nextFile.size > maxInputBytes) {
      setFile(null);
      setError(t("errors.tooLarge", { size: formatBytes(maxInputBytes) }));
      return;
    }
    setFile(nextFile);
  }, [maxInputBytes, t]);

  const handleOutputFormatChange = (format: ImageOutputFormat) => {
    setOutputFormat(format);
    setQuality(IMAGE_CONVERTER_LIMITS.defaultQuality[format]);
    setArtifact(null);
    setDownloadUrl(null);
    setSharePayload(null);
    setShareStatus("idle");
  };

  const handleConvert = async () => {
    if (!file || isConverting) {
      setError(t("errors.required"));
      return;
    }

    setIsConverting(true);
    setError(null);
    setArtifact(null);
    setDownloadUrl(null);
    setSharePayload(null);
    setShareStatus("idle");
    try {
      const response = await convertImage({
        file,
        outputFormat,
        quality: hasQuality ? quality : undefined,
        background,
        idempotencyKey: crypto.randomUUID(),
      });
      setArtifact(response.artifact);
      setDownloadUrl(response.downloadUrl);
    } catch (conversionError) {
      setError(imageConversionErrorMessage(conversionError, tErrors));
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownloadAndShare = async () => {
    if (!artifact || !downloadUrl || isDownloading) return;

    setIsDownloading(true);
    setError(null);
    setShareStatus("idle");
    try {
      const filename = artifact.filename || `flowauxi-image.${outputExtension(outputFormat)}`;
      const absoluteUrl = new URL(downloadUrl, window.location.href).toString();
      const downloaded = await downloadArtifact(downloadUrl, filename, artifactMimeType(outputFormat));
      setSharePayload({ filename, absoluteUrl, file: downloaded.file });
    } catch {
      setError(t("errors.downloadFailed"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!sharePayload) return;
    setShareStatus("idle");
    try {
      if (canShareFile(sharePayload.file)) {
        await navigator.share({
          title: sharePayload.filename,
          text: t("share.text"),
          files: [sharePayload.file],
        });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: sharePayload.filename,
          text: t("share.text"),
          url: sharePayload.absoluteUrl,
        });
        return;
      }
      await copyShareLink(sharePayload.absoluteUrl);
      setShareStatus("copied");
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setShareStatus("error");
    }
  };

  const handleCopy = async () => {
    if (!sharePayload) return;
    try {
      await copyShareLink(sharePayload.absoluteUrl);
      setShareStatus("copied");
    } catch {
      setShareStatus("unsupported");
    }
  };

  return (
    <main className={styles.surface}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <nav className={styles.breadcrumb} aria-label={t("toolbar.currentLocation")}>
            <Link className={styles.breadcrumbLink} href={basePath}>{t("toolbar.files")}</Link>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.breadcrumbCurrent} aria-current="page">{t("toolbar.title")}</span>
          </nav>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{t("toolbar.title")}</h1>
            <p className={styles.meta}>{authenticated ? t("toolbar.authenticated") : t("toolbar.guest")}</p>
          </div>
        </header>

        <section className={styles.workspace} aria-label={t("aria.workspace")}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                <UploadCloud size={18} />
                {t("upload.panel")}
              </h2>
            </div>
            <button
              type="button"
              className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/bmp,image/gif,image/tiff,image/heic,image/heif,image/avif"
                className={styles.fileInput}
                onChange={(event) => handleFile(event.target.files?.[0] || null)}
              />
              <span className={styles.uploadIcon}>
                <ImageIcon size={24} />
              </span>
              <span className={styles.dropTitle}>{file ? file.name : t("upload.title")}</span>
              <span className={styles.dropCopy}>
                {file ? sourceDetails : t("upload.copy", { size: formatBytes(maxInputBytes) })}
              </span>
            </button>
            {previewUrl && (
              <div className={styles.previewBox}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={t("previewAlt")} className={styles.previewImage} />
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t("settings.panel")}</h2>
            </div>
            <div className={styles.controls}>
              <div className={styles.controlGroup}>
                <span className={styles.label}>{t("settings.outputFormat")}</span>
                <div className={styles.segmented} role="radiogroup" aria-label={t("settings.outputFormat")}>
                  {supportedOutputs.map((format) => (
                    <button
                      key={format}
                      type="button"
                      className={`${styles.segment} ${outputFormat === format ? styles.segmentActive : ""}`}
                      onClick={() => handleOutputFormatChange(format)}
                      aria-pressed={outputFormat === format}
                    >
                      {FORMAT_LABELS[format]}
                    </button>
                  ))}
                </div>
              </div>

              {hasQuality && (
                <label className={styles.controlGroup}>
                  <span className={styles.label}>{t("settings.quality", { value: quality })}</span>
                  <input
                    className={styles.range}
                    type="range"
                    min={1}
                    max={100}
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                  />
                </label>
              )}

              {outputFormat === "jpeg" && (
                <label className={styles.colorRow}>
                  <span className={styles.label}>{t("settings.background")}</span>
                  <input
                    className={styles.colorInput}
                    type="color"
                    value={background}
                    onChange={(event) => setBackground(event.target.value)}
                  />
                </label>
              )}

              <button
                type="button"
                className={styles.primaryButton}
                disabled={!canConvert}
                onClick={handleConvert}
              >
                {isConverting ? <Loader2 className={styles.spin} size={17} /> : <ImageIcon size={17} />}
                {isConverting ? t("actions.converting") : t("actions.convert")}
              </button>
            </div>
          </div>

          <div className={`${styles.panel} ${styles.resultPanel}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t("result.panel")}</h2>
            </div>
            <div className={styles.resultBody}>
              {!artifact && !error && (
                <div className={styles.emptyState}>{t("result.empty")}</div>
              )}
              {error && (
                <div className={`${styles.statusLine} ${styles.errorText}`}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              {artifact && downloadUrl && (
                <>
                  <div className={`${styles.statusLine} ${styles.successText}`}>
                    <CheckCircle2 size={16} />
                    {t("result.ready", { name: artifact.filename, size: formatBytes(artifact.sizeBytes) })}
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleDownloadAndShare}
                    disabled={isDownloading}
                  >
                    {isDownloading ? <Loader2 className={styles.spin} size={17} /> : <Download size={17} />}
                    {isDownloading ? t("actions.downloading") : t("actions.downloadAndShare")}
                  </button>
                </>
              )}
              {sharePayload && (
                <div className={styles.sharePanel} aria-label={t("share.aria")}>
                  <div className={`${styles.statusLine} ${styles.successText}`}>
                    <CheckCircle2 size={16} />
                    {t("share.ready")}
                  </div>
                  <div className={styles.shareActions}>
                    <button type="button" className={styles.secondaryButton} onClick={handleShare}>
                      <Share2 size={16} />
                      {t("share.shareImage")}
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={handleCopy}>
                      <Copy size={16} />
                      {t("share.copyLink")}
                    </button>
                  </div>
                </div>
              )}
              {shareStatus === "copied" && (
                <div className={`${styles.statusLine} ${styles.successText}`}>
                  <CheckCircle2 size={16} />
                  {t("share.copied")}
                </div>
              )}
              {shareStatus === "unsupported" && (
                <div className={`${styles.statusLine} ${styles.errorText}`}>
                  <AlertCircle size={16} />
                  {t("share.unavailable")}
                </div>
              )}
              {shareStatus === "error" && (
                <div className={`${styles.statusLine} ${styles.errorText}`}>
                  <AlertCircle size={16} />
                  {t("share.failed")}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function imageConversionErrorMessage(error: unknown, tErrors: ReturnType<typeof useTranslations>) {
  if (error instanceof FileToolsApiError) {
    const key = IMAGE_ERROR_KEYS[error.code];
    if (key) return tErrors(key);
  }
  return tErrors("imageConversionFailed");
}

const IMAGE_ERROR_KEYS: Record<string, string> = {
  IMAGE_FILE_REQUIRED: "imageFileRequired",
  UNSUPPORTED_IMAGE_FORMAT: "unsupportedImageFormat",
  UNSUPPORTED_OUTPUT_FORMAT: "unsupportedOutputFormat",
  IMAGE_TOO_LARGE: "imageTooLarge",
  IMAGE_DIMENSIONS_TOO_LARGE: "imageDimensionsTooLarge",
  INVALID_IMAGE_FILE: "invalidImageFile",
  IMAGE_CONVERSION_TIMEOUT: "imageConversionTimeout",
  IMAGE_OUTPUT_TOO_LARGE: "imageOutputTooLarge",
  IMAGE_CONVERSION_FAILED: "imageConversionFailed",
  STORAGE_ERROR: "imageStorageUnavailable",
};

async function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}

async function downloadArtifact(downloadUrl: string, filename: string, mimeType: string) {
  const response = await fetch(downloadUrl, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("Download failed");
  }

  const blob = await response.blob();
  const fileBlob = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType);
  const file = new File([fileBlob], filename, { type: mimeType });
  saveBlobAsFile(fileBlob, filename);
  return { file };
}

function saveBlobAsFile(blob: Blob, filename: string) {
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

async function copyShareLink(url: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard unavailable");
  }
  await navigator.clipboard.writeText(url);
}

function canShareFile(file: File) {
  return (
    typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [file] })
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageOutputFormat(value: string): value is ImageOutputFormat {
  return ["jpeg", "png", "webp", "avif"].includes(value);
}

function artifactMimeType(format: ImageOutputFormat) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "image/avif";
}

function outputExtension(format: ImageOutputFormat) {
  return format === "jpeg" ? "jpg" : format;
}

interface SharePayload {
  filename: string;
  absoluteUrl: string;
  file: File;
}
