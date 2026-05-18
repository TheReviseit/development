"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useTranslations } from "next-intl";
import FileToolDownloadPanel from "./FileToolDownloadPanel";
import FileToolHistory from "./FileToolHistory";
import TextPdfControls from "./TextPdfControls";
import TextPdfEditor from "./TextPdfEditor";
import TextPdfPreviewSheet from "./TextPdfPreviewSheet";
import ToolToolbar from "./ToolToolbar";
import styles from "./file-tools.module.css";
import cursorStyles from "./text-pdf-cursor.module.css";
import cursorSmallStyles from "./text-pdf-cursor-small.module.css";
import pageBgStyles from "./file-tools-page-bg.module.css";
import {
  deleteTextPdfDraft,
  FileToolsApiError,
  generateTextPdf,
  getFileToolHistory,
  getTextPdfDraft,
} from "@/lib/file-tools/api-client";
import type {
  FileToolArtifact,
  FileToolHistoryItem,
  TextAlign,
  TextMark,
  TextPdfDocument,
  TextPdfGenerateRequest,
  TextPdfOptions,
} from "@/lib/file-tools/contracts";
import { clearLocalTextPdfDraft, loadLocalTextPdfDraft, useTextPdfAutosave } from "@/lib/file-tools/draft-autosave";
import { TEXT_TO_PDF_LIMITS } from "@/lib/file-tools/limits";
import {
  countTextPdfCharacters,
  createTextPdfRequest,
  defaultEditorText,
  defaultTextPdfTitle,
  defaultTextPdfOptions,
  estimateTextPdfPages,
  hasTextPdfContent,
} from "@/lib/file-tools/text-to-pdf-model";
import { auth } from "@/src/firebase/firebase";

interface ToolShellProps {
  mode?: "public" | "dashboard";
  basePath?: string;
}

type MobileTab = "edit" | "preview" | "settings" | "history";

const legacyDefaultTitle = "Project Notes";
const legacyDefaultEditorText =
  "Project Notes\n\nStart writing your document here.\n\n- Clean sections\n- Fast PDF export\n- Saved history";
const PREVIEW_RAIL_NAV_GAP = 16;
const PREVIEW_RAIL_MIN_HEIGHT = 420;
const PREVIEW_RAIL_HEIGHT_EPSILON = 0.5;
const DRAFT_DOWNLOAD_CLEAR_SETTLE_MS = TEXT_TO_PDF_LIMITS.autosaveDebounceMs + 900;
const PDF_GENERATION_ERROR_KEYS: Record<string, string> = {
  EMPTY_TEXT_PDF_DOCUMENT: "emptyTextPdfDocument",
  PDF_SHAPING_UNAVAILABLE: "pdfShapingUnavailable",
  PDF_GLYPH_PREFLIGHT_UNAVAILABLE: "pdfGlyphPreflightUnavailable",
  FONT_NOT_REGISTERED: "fontNotRegistered",
  UNSUPPORTED_GLYPH: "unsupportedGlyph",
  FILE_TOOLS_BACKEND_BAD_URL: "pdfBackendUnavailable",
  FILE_TOOLS_BACKEND_NOT_DEPLOYED: "pdfBackendUnavailable",
  FILE_TOOLS_BACKEND_TIMEOUT: "pdfBackendUnavailable",
  FILE_TOOLS_PROXY_ERROR: "pdfBackendUnavailable",
  STORAGE_ERROR: "pdfStorageUnavailable",
};

export default function ToolShell({ mode = "public", basePath = "/tools" }: ToolShellProps) {
  const tErrors = useTranslations("errors");
  const tMobile = useTranslations("files.textToPdf.mobileTabs");
  const previewRailRef = useRef<HTMLDivElement>(null);
  const editVersionRef = useRef(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [title, setTitle] = useState(defaultTextPdfTitle);
  const [rawText, setRawText] = useState(defaultEditorText);
  const [options, setOptions] = useState<TextPdfOptions>(defaultTextPdfOptions);
  const [marks, setMarks] = useState<TextMark[]>([]);
  const [align, setAlign] = useState<TextAlign>("left");
  const [artifact, setArtifact] = useState<FileToolArtifact | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<FileToolHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("edit");

  const draft = useMemo(
    () => createTextPdfRequest({ title, rawText, options, marks, align }),
    [align, marks, options, rawText, title],
  );
  const autosaveStatus = useTextPdfAutosave({ enabled: true, authenticated, draft });
  const characterCount = countTextPdfCharacters(draft.document);
  const hasDocumentContent = hasTextPdfContent(draft.document);
  const pageEstimate = estimateTextPdfPages(draft.document, options);
  const limit = authenticated
    ? TEXT_TO_PDF_LIMITS.authenticatedCharacters
    : TEXT_TO_PDF_LIMITS.guestCharacters;

  const clearGeneratedArtifact = useCallback(() => {
    setError(null);
    setArtifact((current) => (current ? null : current));
    setDownloadUrl((current) => (current ? null : current));
  }, []);

  const registerUserEdit = useCallback(() => {
    editVersionRef.current += 1;
  }, []);

  const handleTitleChange = useCallback((value: string) => {
    registerUserEdit();
    clearGeneratedArtifact();
    setTitle(value);
  }, [clearGeneratedArtifact, registerUserEdit]);

  const handleRawTextChange = useCallback((value: string) => {
    registerUserEdit();
    clearGeneratedArtifact();
    setRawText(value);
  }, [clearGeneratedArtifact, registerUserEdit]);

  const handleOptionsChange = useCallback((value: TextPdfOptions) => {
    registerUserEdit();
    clearGeneratedArtifact();
    setOptions(value);
  }, [clearGeneratedArtifact, registerUserEdit]);

  const handleMarksChange = useCallback((value: TextMark[]) => {
    registerUserEdit();
    clearGeneratedArtifact();
    setMarks(value);
  }, [clearGeneratedArtifact, registerUserEdit]);

  const handleAlignChange = useCallback((value: TextAlign) => {
    registerUserEdit();
    clearGeneratedArtifact();
    setAlign(value);
  }, [clearGeneratedArtifact, registerUserEdit]);

  const applyDraft = useCallback((nextDraft: TextPdfGenerateRequest) => {
    clearGeneratedArtifact();
    setTitle(nextDraft.document.title || defaultTextPdfTitle);
    setOptions(nextDraft.options || defaultTextPdfOptions);
    setRawText(rawTextFromDocument(nextDraft.document));
    const firstStyledBlock = nextDraft.document.blocks.find(
      (block) => block.type === "paragraph" || block.type === "heading",
    );
    if (firstStyledBlock && "marks" in firstStyledBlock) {
      setMarks(firstStyledBlock.marks || []);
    }
    const firstParagraph = nextDraft.document.blocks.find((block) => block.type === "paragraph");
    if (firstParagraph?.type === "paragraph" && firstParagraph.align) {
      setAlign(firstParagraph.align);
    }
  }, [clearGeneratedArtifact]);

  const loadRemoteDraft = useCallback(async () => {
    try {
      const response = await getTextPdfDraft();
      if (!response.draft) return;
      if (isLegacyDefaultDraft(response.draft)) {
        await deleteTextPdfDraft();
        return;
      }
      applyDraft(response.draft);
    } catch {
      // Draft loading should not block the editor.
    }
  }, [applyDraft]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await getFileToolHistory();
      setHistory(response.items);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const isAuthed = Boolean(user);
      setAuthenticated(isAuthed);
      if (isAuthed) {
        clearLocalTextPdfDraft();
        await loadRemoteDraft();
        await loadHistory();
      } else {
        const localDraft = loadLocalTextPdfDraft();
        if (localDraft) {
          if (isLegacyDefaultDraft(localDraft)) {
            clearLocalTextPdfDraft();
          } else {
            applyDraft(localDraft);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [applyDraft, loadHistory, loadRemoteDraft]);

  useLayoutEffect(() => {
    const rail = previewRailRef.current;
    if (!rail) return undefined;

    let frameId: number | null = null;
    let previousHeight = 0;
    let previousTop = 0;
    let disposed = false;

    const measure = () => {
      frameId = null;
      if (disposed) return;

      const currentRail = previewRailRef.current;
      if (!currentRail) return;

      const railStyle = getComputedStyle(currentRail);
      if (railStyle.position === "static") {
        currentRail.style.removeProperty("--preview-rail-top");
        currentRail.style.removeProperty("--preview-rail-height");
        previousHeight = 0;
        previousTop = 0;
        return;
      }

      const navbar = document.querySelector<HTMLElement>("[data-files-product-navbar]");
      const navbarBottom = navbar?.getBoundingClientRect().bottom ?? 0;
      const nextStickyTop = Math.max(PREVIEW_RAIL_NAV_GAP, navbarBottom + PREVIEW_RAIL_NAV_GAP);
      if (Math.abs(previousTop - nextStickyTop) > PREVIEW_RAIL_HEIGHT_EPSILON) {
        currentRail.style.setProperty("--preview-rail-top", `${Math.round(nextStickyTop)}px`);
        previousTop = nextStickyTop;
      }

      const bottomGap = readCssPixels(
        railStyle.getPropertyValue("--preview-rail-bottom-gap"),
        PREVIEW_RAIL_NAV_GAP,
      );
      const railTop = Math.max(nextStickyTop, currentRail.getBoundingClientRect().top);
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const nextHeight = Math.max(PREVIEW_RAIL_MIN_HEIGHT, viewportHeight - railTop - bottomGap);

      if (Math.abs(previousHeight - nextHeight) > PREVIEW_RAIL_HEIGHT_EPSILON) {
        currentRail.style.setProperty("--preview-rail-height", `${Math.round(nextHeight)}px`);
        previousHeight = nextHeight;
      }
    };

    const schedule = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(rail);

    return () => {
      disposed = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
    };
  }, []);

  const handleGenerate = async () => {
    if (!hasDocumentContent) {
      setError(null);
      setArtifact(null);
      setDownloadUrl(null);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setArtifact(null);
    setDownloadUrl(null);
    try {
      const request: TextPdfGenerateRequest = {
        ...draft,
        idempotencyKey: crypto.randomUUID(),
      };
      const response = await generateTextPdf(request);
      setArtifact(response.artifact);
      setDownloadUrl(response.downloadUrl);
      if (authenticated) {
        await loadHistory();
      }
    } catch (err) {
      setError(pdfGenerationErrorMessage(err, tErrors));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = useCallback(() => {
    const clearedAtVersion = editVersionRef.current;

    clearLocalTextPdfDraft();
    if (authenticated) {
      void deleteTextPdfDraft().catch(() => undefined);
    }

    setError(null);
    setArtifact(null);
    setDownloadUrl(null);
    setTitle(defaultTextPdfTitle);
    setRawText(defaultEditorText);
    setOptions(defaultTextPdfOptions);
    setMarks([]);
    setAlign("left");

    window.setTimeout(() => {
      if (editVersionRef.current !== clearedAtVersion) return;
      clearLocalTextPdfDraft();
      if (authenticated) {
        void deleteTextPdfDraft().catch(() => undefined);
      }
    }, DRAFT_DOWNLOAD_CLEAR_SETTLE_MS);
  }, [authenticated]);

  return (
    <main className={`${styles.surface} ${cursorStyles.cursorScope} ${cursorSmallStyles.cursorSmallScope} ${pageBgStyles.pageBgScope}`}>
      <div className={styles.shell}>
        <ToolToolbar mode={mode} authenticated={authenticated} basePath={basePath} />

        <div className={styles.mobileTabs} role="tablist" aria-label={tMobile("aria")}>
          {(["edit", "preview", "settings", "history"] as MobileTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab}
              data-mobile-tool-tab={tab}
              className={`${styles.mobileTab} ${mobileTab === tab ? styles.mobileTabActive : ""}`}
              onClick={() => setMobileTab(tab)}
              title={tMobile(tab)}
            >
              {tMobile(tab)}
            </button>
          ))}
        </div>

        <div className={styles.workspace}>
          <div
            ref={previewRailRef}
            className={`${styles.previewRail} ${mobileTab !== "preview" ? styles.mobileHidden : ""}`}
            data-text-pdf-preview-rail
          >
            <TextPdfPreviewSheet document={draft.document} options={options} />
            <FileToolDownloadPanel
              characterCount={characterCount}
              hasContent={hasDocumentContent}
              pageEstimate={pageEstimate}
              limit={limit}
              isGenerating={isGenerating}
              error={error}
              artifact={artifact}
              downloadUrl={downloadUrl}
              autosaveStatus={autosaveStatus}
              onGenerate={handleGenerate}
              onDownload={handleDownload}
            />
          </div>

          <div className={`${styles.leftRail} ${!["edit", "settings", "history"].includes(mobileTab) ? styles.mobileHidden : ""}`}>
            <div className={`${styles.editPane} ${mobileTab !== "edit" ? styles.mobileHidden : ""}`}>
              <TextPdfEditor
                title={title}
                rawText={rawText}
                marks={marks}
                align={align}
                onTitleChange={handleTitleChange}
                onRawTextChange={handleRawTextChange}
                onMarksChange={handleMarksChange}
                onAlignChange={handleAlignChange}
              />
              <div className={styles.mobileEditExport}>
                <FileToolDownloadPanel
                  characterCount={characterCount}
                  hasContent={hasDocumentContent}
                  pageEstimate={pageEstimate}
                  limit={limit}
                  isGenerating={isGenerating}
                  error={error}
                  artifact={artifact}
                  downloadUrl={downloadUrl}
                  autosaveStatus={autosaveStatus}
                  onGenerate={handleGenerate}
                  onDownload={handleDownload}
                />
              </div>
            </div>
            <div className={mobileTab !== "settings" ? styles.mobileHidden : ""}>
              <TextPdfControls options={options} onOptionsChange={handleOptionsChange} />
            </div>
            <div className={mobileTab !== "history" ? styles.mobileHidden : ""}>
              <FileToolHistory authenticated={authenticated} items={history} loading={historyLoading} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function readCssPixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pdfGenerationErrorMessage(
  error: unknown,
  tErrors: ReturnType<typeof useTranslations>,
): string {
  if (error instanceof FileToolsApiError) {
    const key = PDF_GENERATION_ERROR_KEYS[error.code];
    if (key) {
      return tErrors(key);
    }
  }

  return tErrors("pdfGenerationFailed");
}

function rawTextFromDocument(document: TextPdfDocument): string {
  if (
    document.blocks.length === 1 &&
    document.blocks[0]?.type === "paragraph" &&
    !document.blocks[0].text.trim()
  ) {
    return "";
  }

  return document.blocks
    .map((block) => {
      if (block.type === "heading") return `${"#".repeat(block.level)} ${block.text}`;
      if (block.type === "paragraph") return block.text;
      if (block.type === "list") {
        const start = block.start ?? 1;
        return block.items.map((item, index) => (block.ordered ? `${start + index}. ${item}` : `- ${item}`)).join("\n");
      }
      return "---page---";
    })
    .join("\n\n");
}

function isLegacyDefaultDraft(draft: TextPdfGenerateRequest): boolean {
  return draft.document.title === legacyDefaultTitle && rawTextFromDocument(draft.document) === legacyDefaultEditorText;
}
