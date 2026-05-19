"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  PauseCircle,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  UploadCloud,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  cancelVideoJob,
  completeVideoUpload,
  createVideoJob,
  createVideoUploadSession,
  FileToolsApiError,
  getVideoJob,
  getVideoUploadSession,
  retryVideoJob,
  uploadVideoChunk,
} from "@/lib/file-tools/api-client";
import type {
  FileToolArtifact,
  VideoConversionOptions,
  VideoQualityPreset,
  VideoResolutionPreset,
} from "@/lib/file-tools/contracts";
import { VIDEO_WHATSAPP_LIMITS } from "@/lib/file-tools/limits";
import { auth } from "@/src/firebase/firebase";
import styles from "./video-whatsapp-converter-shell.module.css";

interface VideoWhatsappConverterShellProps {
  basePath?: string;
}

type QueueStatus =
  | "ready"
  | "uploading"
  | "assembling"
  | "queued"
  | "converting"
  | "succeeded"
  | "failed"
  | "cancelled";

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  uploadProgress: number;
  convertProgress: number;
  stage?: string;
  etaSeconds?: number | null;
  uploadSessionId?: string;
  jobId?: string;
  artifact?: FileToolArtifact | null;
  downloadUrl?: string | null;
  error?: string | null;
}

const QUALITY_PRESETS: Array<{ key: VideoQualityPreset; labelKey: string }> = [
  { key: "whatsapp_optimized", labelKey: "quality.whatsapp" },
  { key: "balanced", labelKey: "quality.balanced" },
  { key: "small_size", labelKey: "quality.small" },
  { key: "best_quality", labelKey: "quality.best" },
];

const RESOLUTION_PRESETS: VideoResolutionPreset[] = ["720p", "1080p", "480p", "original"];

export default function VideoWhatsappConverterShell({ basePath = "/tools" }: VideoWhatsappConverterShellProps) {
  const t = useTranslations("files.videoWhatsapp");
  const tErrors = useTranslations("errors");
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSources = useRef<Map<string, EventSource>>(new Map());
  const subscribeToProgressRef = useRef<(itemId: string, jobId: string) => void>(() => undefined);
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<VideoQualityPreset>("whatsapp_optimized");
  const [resolutionPreset, setResolutionPreset] = useState<VideoResolutionPreset>("720p");
  const [normalizeFps, setNormalizeFps] = useState(true);
  const [normalizeAudio, setNormalizeAudio] = useState(false);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [bitrateKbps, setBitrateKbps] = useState("");
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");

  const maxInputBytes = authenticated
    ? VIDEO_WHATSAPP_LIMITS.authenticatedMaxInputBytes
    : VIDEO_WHATSAPP_LIMITS.guestMaxInputBytes;
  const activeCount = items.filter((item) => ["uploading", "assembling", "queued", "converting"].includes(item.status)).length;

  useEffect(() => onAuthStateChanged(auth, (user) => setAuthenticated(Boolean(user))), []);

  useEffect(() => {
    const sources = eventSources.current;
    return () => {
      sources.forEach((source) => source.close());
    };
  }, []);

  const options = useMemo<VideoConversionOptions>(() => ({
    qualityPreset,
    resolutionPreset,
    normalizeFps,
    normalizeAudio,
    removeAudio,
    bitrateKbps: bitrateKbps ? Number(bitrateKbps) : null,
    trimStartSeconds: trimStart ? Number(trimStart) : null,
    trimEndSeconds: trimEnd ? Number(trimEnd) : null,
    generateThumbnail: true,
    generatePoster: true,
  }), [bitrateKbps, normalizeAudio, normalizeFps, qualityPreset, removeAudio, resolutionPreset, trimEnd, trimStart]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const next = Array.from(fileList).map((file) => {
      const error = validateVideoFile(file, maxInputBytes, t);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: error ? "failed" as QueueStatus : "ready" as QueueStatus,
        uploadProgress: 0,
        convertProgress: 0,
        error,
      };
    });
    setItems((current) => [...next, ...current]);
  }, [maxInputBytes, t]);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const startItem = useCallback(async (item: QueueItem) => {
    if (item.status !== "ready" && item.status !== "failed") return;
    updateItem(item.id, { status: "uploading", error: null, uploadProgress: 0, convertProgress: 0 });
    try {
      const batchId = `video-${Date.now()}`;
      const chunkSize = VIDEO_WHATSAPP_LIMITS.defaultChunkSizeBytes;
      const totalChunks = Math.ceil(item.file.size / chunkSize);
      const sessionResponse = await createVideoUploadSession({
        filename: item.file.name,
        declaredMimeType: item.file.type || "application/octet-stream",
        totalSizeBytes: item.file.size,
        chunkSizeBytes: chunkSize,
        totalChunks,
        batchId,
      });
      const sessionId = sessionResponse.uploadSession.id;
      updateItem(item.id, { uploadSessionId: sessionId });

      for (let index = 0; index < totalChunks; index += 1) {
        const byteStart = index * chunkSize;
        const byteEnd = Math.min(item.file.size, byteStart + chunkSize) - 1;
        const chunk = item.file.slice(byteStart, byteEnd + 1);
        const sha256 = await sha256Blob(chunk);
        await uploadVideoChunk({
          uploadSessionId: sessionId,
          chunkIndex: index,
          totalSizeBytes: item.file.size,
          byteStart,
          byteEnd,
          chunk,
          sha256,
          idempotencyKey: `${sessionId}:${index}:${sha256}`,
        });
        updateItem(item.id, { uploadProgress: Math.round(((index + 1) / totalChunks) * 100) });
      }

      updateItem(item.id, { status: "assembling", stage: t("stages.assembling") });
      await completeVideoUpload(sessionId);
      await waitForAssembly(sessionId);

      updateItem(item.id, { status: "queued", stage: t("stages.queued") });
      const jobResponse = await createVideoJob({
        uploadSessionId: sessionId,
        options,
        idempotencyKey: crypto.randomUUID(),
      });
      const jobId = jobResponse.job.id;
      updateItem(item.id, { jobId, status: "converting", stage: t("stages.converting") });
      subscribeToProgressRef.current(item.id, jobId);
    } catch (error) {
      updateItem(item.id, { status: "failed", error: videoErrorMessage(error, tErrors) });
    }
  }, [options, t, tErrors, updateItem]);

  const startAll = () => {
    items.filter((item) => item.status === "ready").forEach((item) => void startItem(item));
  };

  const subscribeToProgress = useCallback((itemId: string, jobId: string) => {
    eventSources.current.get(jobId)?.close();
    let fallbackTimer: number | null = null;
    const source = new EventSource(`/api/file-tools/video-whatsapp/jobs/${jobId}/events`);
    eventSources.current.set(jobId, source);

    const handleEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data || "{}");
        updateItem(itemId, {
          status: "converting",
          stage: data.stage || t("stages.converting"),
          convertProgress: typeof data.percent === "number" ? Math.round(data.percent) : undefined,
          etaSeconds: typeof data.eta_seconds === "number" ? data.eta_seconds : data.etaSeconds,
        });
      } catch {
        // Ignore malformed progress frames; polling will recover authoritative state.
      }
    };

    source.addEventListener("progress", handleEvent);
    source.addEventListener("stage", handleEvent);
    source.addEventListener("completed", async () => {
      source.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      eventSources.current.delete(jobId);
      const status = await getVideoJob(jobId);
      updateItem(itemId, {
        status: "succeeded",
        convertProgress: 100,
        artifact: status.artifact,
        downloadUrl: status.downloadUrl,
        stage: t("stages.succeeded"),
      });
    });
    source.addEventListener("failed", async () => {
      source.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      eventSources.current.delete(jobId);
      const status = await getVideoJob(jobId).catch(() => null);
      updateItem(itemId, {
        status: "failed",
        error: status?.job.errorMessage || tErrors("videoConversionFailed"),
      });
    });
    source.addEventListener("cancelled", () => {
      source.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      eventSources.current.delete(jobId);
      updateItem(itemId, { status: "cancelled", stage: t("stages.cancelled") });
    });
    source.onerror = () => {
      if (fallbackTimer) return;
      fallbackTimer = window.setInterval(async () => {
        const status = await getVideoJob(jobId).catch(() => null);
        if (!status) return;
        if (status.job.status === "succeeded") {
          source.close();
          if (fallbackTimer) window.clearInterval(fallbackTimer);
          updateItem(itemId, { status: "succeeded", convertProgress: 100, artifact: status.artifact, downloadUrl: status.downloadUrl });
        } else if (["failed", "dead_letter", "cancelled"].includes(status.job.status)) {
          source.close();
          if (fallbackTimer) window.clearInterval(fallbackTimer);
          updateItem(itemId, { status: status.job.status === "cancelled" ? "cancelled" : "failed", error: status.job.errorMessage || null });
        }
      }, 3500);
    };
  }, [t, tErrors, updateItem]);

  useEffect(() => {
    subscribeToProgressRef.current = subscribeToProgress;
  }, [subscribeToProgress]);

  const handleCancel = async (item: QueueItem) => {
    if (!item.jobId) return;
    await cancelVideoJob(item.jobId).catch(() => undefined);
    updateItem(item.id, { status: "cancelled", stage: t("stages.cancelled") });
  };

  const handleRetry = async (item: QueueItem) => {
    if (item.jobId) {
      const response = await retryVideoJob(item.jobId).catch(() => null);
      if (response?.job.id) {
        updateItem(item.id, { status: "converting", error: null, convertProgress: 0 });
        subscribeToProgressRef.current(item.id, response.job.id);
        return;
      }
    }
    updateItem(item.id, { status: "ready", error: null, uploadProgress: 0, convertProgress: 0 });
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
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>{t("toolbar.title")}</h1>
              <p className={styles.meta}>{authenticated ? t("toolbar.authenticated") : t("toolbar.guest")}</p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={startAll} disabled={!items.some((item) => item.status === "ready")}>
              {activeCount ? <Loader2 className={styles.spin} size={17} /> : <Film size={17} />}
              {activeCount ? t("actions.processing", { count: activeCount }) : t("actions.convertAll")}
            </button>
          </div>
        </header>

        <section className={styles.workspace}>
          <div className={styles.leftPane}>
            <button
              type="button"
              className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={VIDEO_WHATSAPP_LIMITS.acceptedExtensions.join(",")}
                className={styles.fileInput}
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <span className={styles.uploadIcon}><UploadCloud size={24} /></span>
              <span className={styles.dropTitle}>{t("upload.title")}</span>
              <span className={styles.dropCopy}>{t("upload.copy", { size: formatBytes(maxInputBytes) })}</span>
            </button>

            <div className={styles.queue} aria-label={t("queue.aria")}>
              {items.length === 0 && <div className={styles.emptyState}>{t("queue.empty")}</div>}
              {items.map((item) => (
                <article key={item.id} className={styles.queueItem}>
                  <video className={styles.preview} src={item.previewUrl} muted playsInline preload="metadata" />
                  <div className={styles.itemMain}>
                    <div className={styles.itemHeader}>
                      <div>
                        <h2 className={styles.itemTitle}>{item.file.name}</h2>
                        <p className={styles.itemMeta}>{formatBytes(item.file.size)} · {statusLabel(item, t)}</p>
                      </div>
                      <StatusIcon status={item.status} />
                    </div>
                    <Progress label={t("progress.upload")} value={item.uploadProgress} />
                    <Progress label={item.stage || t("progress.conversion")} value={item.convertProgress} />
                    {item.etaSeconds ? <p className={styles.eta}>{t("progress.eta", { eta: formatEta(item.etaSeconds) })}</p> : null}
                    {item.error ? <p className={styles.errorText}><AlertCircle size={15} />{item.error}</p> : null}
                    <div className={styles.itemActions}>
                      {item.status === "ready" && <button type="button" className={styles.secondaryButton} onClick={() => void startItem(item)}><Film size={15} />{t("actions.convert")}</button>}
                      {item.status === "converting" && <button type="button" className={styles.secondaryButton} onClick={() => void handleCancel(item)}><PauseCircle size={15} />{t("actions.cancel")}</button>}
                      {["failed", "cancelled"].includes(item.status) && <button type="button" className={styles.secondaryButton} onClick={() => void handleRetry(item)}><RefreshCw size={15} />{t("actions.retry")}</button>}
                      {item.status === "succeeded" && item.downloadUrl && (
                        <a className={styles.secondaryButton} href={item.downloadUrl} download={item.artifact?.filename || "flowauxi-video.mp4"}>
                          <Download size={15} />{t("actions.download")}
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className={styles.optionsPanel} aria-label={t("settings.panel")}>
            <h2 className={styles.panelTitle}><SlidersHorizontal size={18} />{t("settings.panel")}</h2>
            <div className={styles.controlGroup}>
              <span className={styles.label}>{t("settings.quality")}</span>
              <div className={styles.segmented}>
                {QUALITY_PRESETS.map((preset) => (
                  <button key={preset.key} type="button" className={`${styles.segment} ${qualityPreset === preset.key ? styles.segmentActive : ""}`} onClick={() => setQualityPreset(preset.key)}>
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.controlGroup}>
              <span className={styles.label}>{t("settings.resolution")}</span>
              <div className={styles.segmented}>
                {RESOLUTION_PRESETS.map((preset) => (
                  <button key={preset} type="button" className={`${styles.segment} ${resolutionPreset === preset ? styles.segmentActive : ""}`} onClick={() => setResolutionPreset(preset)}>
                    {preset === "original" ? t("resolution.original") : preset}
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.switchRow}><input type="checkbox" checked={normalizeFps} onChange={(event) => setNormalizeFps(event.target.checked)} />{t("settings.normalizeFps")}</label>
            <label className={styles.switchRow}><input type="checkbox" checked={normalizeAudio} onChange={(event) => setNormalizeAudio(event.target.checked)} disabled={removeAudio} /><Volume2 size={15} />{t("settings.normalizeAudio")}</label>
            <label className={styles.switchRow}><input type="checkbox" checked={removeAudio} onChange={(event) => setRemoveAudio(event.target.checked)} /><VolumeX size={15} />{t("settings.removeAudio")}</label>
            <label className={styles.inputRow}><span>{t("settings.bitrate")}</span><input inputMode="numeric" value={bitrateKbps} onChange={(event) => setBitrateKbps(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Auto" /></label>
            <div className={styles.trimGrid}>
              <label className={styles.inputRow}><span><Scissors size={14} />{t("settings.trimStart")}</span><input inputMode="decimal" value={trimStart} onChange={(event) => setTrimStart(sanitizeDecimal(event.target.value))} placeholder="0" /></label>
              <label className={styles.inputRow}><span>{t("settings.trimEnd")}</span><input inputMode="decimal" value={trimEnd} onChange={(event) => setTrimEnd(sanitizeDecimal(event.target.value))} placeholder={t("settings.endPlaceholder")} /></label>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.progressRow}>
      <span>{label}</span>
      <div className={styles.progressTrack}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

function StatusIcon({ status }: { status: QueueStatus }) {
  if (status === "succeeded") return <CheckCircle2 className={styles.successIcon} size={20} />;
  if (status === "failed" || status === "cancelled") return <AlertCircle className={styles.errorIcon} size={20} />;
  if (["uploading", "assembling", "queued", "converting"].includes(status)) return <Loader2 className={`${styles.spin} ${styles.busyIcon}`} size={20} />;
  return <Film className={styles.idleIcon} size={20} />;
}

async function waitForAssembly(sessionId: string) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const status = await getVideoUploadSession(sessionId);
    if (status.uploadSession.status === "assembled") return;
    if (["failed", "expired", "cancelled"].includes(status.uploadSession.status)) {
      throw new Error(status.uploadSession.status);
    }
    await sleep(Math.min(5000, 1000 + attempt * 250));
  }
  throw new Error("assembly_timeout");
}

async function sha256Blob(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateVideoFile(file: File, maxInputBytes: number, t: ReturnType<typeof useTranslations>) {
  const lower = file.name.toLowerCase();
  const allowed = VIDEO_WHATSAPP_LIMITS.acceptedExtensions.some((extension) => lower.endsWith(extension));
  if (!allowed) return t("errors.unsupported");
  if (file.size > maxInputBytes) return t("errors.tooLarge", { size: formatBytes(maxInputBytes) });
  return null;
}

function videoErrorMessage(error: unknown, tErrors: ReturnType<typeof useTranslations>) {
  if (error instanceof FileToolsApiError) {
    const key = VIDEO_ERROR_KEYS[error.code];
    if (key) return tErrors(key);
    return error.message;
  }
  if (error instanceof Error && error.message === "assembly_timeout") {
    return tErrors("videoAssemblyTimeout");
  }
  return tErrors("videoConversionFailed");
}

const VIDEO_ERROR_KEYS: Record<string, string> = {
  VIDEO_TOO_LARGE: "videoTooLarge",
  UNSUPPORTED_VIDEO_FORMAT: "unsupportedVideoFormat",
  INVALID_VIDEO_FILE: "invalidVideoFile",
  VIDEO_DURATION_TOO_LONG: "videoDurationTooLong",
  VIDEO_QUEUE_UNAVAILABLE: "videoQueueUnavailable",
  FFMPEG_UNAVAILABLE: "ffmpegUnavailable",
  FFPROBE_UNAVAILABLE: "ffprobeUnavailable",
  VIDEO_CONVERSION_FAILED: "videoConversionFailed",
  VIDEO_CONVERSION_TIMEOUT: "videoConversionTimeout",
  VIDEO_OUTPUT_VALIDATION_FAILED: "videoOutputValidationFailed",
  UPLOAD_SESSION_EXPIRED: "videoUploadExpired",
  CHUNK_CONFLICT: "videoChunkConflict",
};

function statusLabel(item: QueueItem, t: ReturnType<typeof useTranslations>) {
  return t(`status.${item.status}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function sanitizeDecimal(value: string) {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 8);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatEta(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
