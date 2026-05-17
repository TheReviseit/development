"use client";

import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { TextPdfBlock, TextPdfDocument, TextPdfOptions } from "@/lib/file-tools/contracts";
import { createRafMeasurementScheduler } from "@/lib/file-tools/preview-measurement";
import { getPreviewPageMetrics, getPreviewPages } from "@/lib/file-tools/preview-renderer";
import styles from "./file-tools.module.css";

const MIN_PREVIEW_PAGE_SCALE = 0.2;
const MIN_PREVIEW_CONTENT_SIZE = 120;
const PREVIEW_WIDTH_CHANGE_EPSILON = 0.5;
const PREVIEW_SCALE_PRECISION = 4;
const SCROLL_RESTORE_EPSILON = 0.5;

interface TextPdfPreviewSheetProps {
  document: TextPdfDocument;
  options: TextPdfOptions;
}

interface PreviewScrollAnchor {
  pageIndex: number;
  pageProgress: number;
  gapOffset: number;
}

export default function TextPdfPreviewSheet({ document, options }: TextPdfPreviewSheetProps) {
  const t = useTranslations("files.textToPdf.preview");
  const locale = useLocale();
  const pages = useMemo(() => getPreviewPages(document, options), [document, options]);
  const metrics = useMemo(() => getPreviewPageMetrics(options), [options]);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [measuredAvailableWidth, setMeasuredAvailableWidth] = useState<number | null>(null);
  const availableWidth = measuredAvailableWidth ?? metrics.width;
  const isPreviewMeasured = measuredAvailableWidth !== null;
  const pageScale = useMemo(
    () =>
      roundNumber(
        clampNumber(availableWidth / metrics.width, MIN_PREVIEW_PAGE_SCALE, 1),
        PREVIEW_SCALE_PRECISION,
      ),
    [availableWidth, metrics.width],
  );
  const renderedPageWidth = useMemo(() => roundNumber(metrics.width * pageScale, 2), [metrics.width, pageScale]);
  const renderedPageHeight = useMemo(() => roundNumber(metrics.height * pageScale, 2), [metrics.height, pageScale]);
  const previousRenderedPageHeightRef = useRef(renderedPageHeight);
  const pendingScrollAnchorRef = useRef<PreviewScrollAnchor | null>(null);
  const pageGapRef = useRef(24);
  const fontFamily =
    options.fontFamily === "Times-Roman"
      ? "Times New Roman"
      : options.fontFamily === "Arial Unicode MS"
        ? "Arial Unicode MS, Nirmala UI"
        : options.fontFamily;

  useLayoutEffect(() => {
    const measureAvailableWidth = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const stage = stageRef.current;
      const canvasStyle = getComputedStyle(canvas);
      const horizontalPadding = readPixels(canvasStyle.paddingLeft) + readPixels(canvasStyle.paddingRight);
      const measuredGap = readPixels(canvasStyle.rowGap || canvasStyle.gap);
      if (measuredGap > 0) {
        pageGapRef.current = measuredGap;
      }

      const canvasRect = canvas.getBoundingClientRect();
      const nextAvailableWidth = roundNumber(
        Math.max(MIN_PREVIEW_CONTENT_SIZE, canvasRect.width - horizontalPadding),
        2,
      );

      setMeasuredAvailableWidth((currentAvailableWidth) => {
        if (
          currentAvailableWidth !== null &&
          Math.abs(currentAvailableWidth - nextAvailableWidth) < PREVIEW_WIDTH_CHANGE_EPSILON
        ) {
          return currentAvailableWidth;
        }

        if (stage && currentAvailableWidth !== null) {
          pendingScrollAnchorRef.current = capturePreviewScrollAnchor(
            stage,
            previousRenderedPageHeightRef.current,
            pageGapRef.current,
          );
        }

        return nextAvailableWidth;
      });
    };

    measureAvailableWidth();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const scheduler = createRafMeasurementScheduler(measureAvailableWidth);
    const resizeObserver = new ResizeObserver(scheduler.schedule);
    if (canvasRef.current) resizeObserver.observe(canvasRef.current);

    return () => {
      scheduler.cancel();
      resizeObserver.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const previousRenderedPageHeight = previousRenderedPageHeightRef.current;
    const pageGap = pageGapRef.current;

    if (stage && Math.abs(previousRenderedPageHeight - renderedPageHeight) > SCROLL_RESTORE_EPSILON) {
      const anchor =
        pendingScrollAnchorRef.current ??
        capturePreviewScrollAnchor(stage, previousRenderedPageHeight, pageGap);
      const nextScrollTop = scrollTopForPreviewAnchor(anchor, renderedPageHeight, pageGap);

      if (Number.isFinite(nextScrollTop) && Math.abs(stage.scrollTop - nextScrollTop) > SCROLL_RESTORE_EPSILON) {
        stage.scrollTop = nextScrollTop;
      }
    }

    previousRenderedPageHeightRef.current = renderedPageHeight;
    pendingScrollAnchorRef.current = null;
  }, [renderedPageHeight]);

  const previewStageStyle = useMemo(
    () =>
      ({
        "--preview-page-width": `${metrics.width}px`,
        "--preview-page-height": `${metrics.height}px`,
        "--preview-page-scale": pageScale,
        "--preview-render-width": `${renderedPageWidth}px`,
        "--preview-render-height": `${renderedPageHeight}px`,
      }) as CSSProperties,
    [metrics.height, metrics.width, pageScale, renderedPageHeight, renderedPageWidth],
  );

  return (
    <section
      className={`${styles.panel} ${styles.previewPanel}`}
      data-text-pdf-preview-panel
      aria-labelledby="text-pdf-preview-title"
    >
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle} id="text-pdf-preview-title">
          <Eye size={17} aria-hidden="true" />
          {t("panel")}
        </div>
        <div className={styles.previewHeader}>
          {t("pageCount", { count: pages.length })}{" \u00b7 "}
          {t("blockCount", { count: document.blocks.length })}
        </div>
      </div>
      <div
        className={styles.previewStage}
        ref={stageRef}
        data-text-pdf-preview-stage
        data-text-pdf-preview-ready={isPreviewMeasured ? "true" : "false"}
        aria-busy={!isPreviewMeasured}
        style={previewStageStyle}
      >
        <div className={styles.previewCanvas} ref={canvasRef} data-text-pdf-preview-canvas>
          {!isPreviewMeasured ? (
            <div className={styles.previewLoader} data-text-pdf-preview-loader role="status" aria-live="polite">
              <div className={styles.previewLoaderPaper} aria-hidden="true">
                <div className={styles.previewLoaderLine} />
                <div className={styles.previewLoaderLine} />
                <div className={styles.previewLoaderLineShort} />
              </div>
              <span className={styles.previewLoaderText}>{t("preparing")}</span>
            </div>
          ) : (
            pages.map((blocks, index) => (
              <div
                key={index}
                className={styles.pageSlot}
                data-text-pdf-page-slot
              >
                <div
                  className={styles.pageViewport}
                  data-text-pdf-page-viewport
                >
                  <article
                    className={styles.page}
                    data-text-pdf-page
                    aria-label={t("pageAria", { number: (index + 1).toLocaleString(locale) })}
                    style={{ "--preview-page-ratio": `${metrics.width} / ${metrics.height}` } as CSSProperties}
                  >
                    <div
                      className={styles.pageInner}
                      style={
                        {
                          "--preview-font-size": `${options.fontSize}px`,
                          "--preview-line-height": options.lineHeight,
                          "--preview-font-family": fontFamily,
                          paddingTop: options.margins.top,
                          paddingRight: options.margins.right,
                          paddingBottom: options.margins.bottom,
                          paddingLeft: options.margins.left,
                        } as CSSProperties
                      }
                    >
                      {options.header?.enabled && options.header.text && (
                        <div className={styles.previewHeaderChrome}>{options.header.text}</div>
                      )}
                      <div className={styles.previewContent}>
                        {blocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
                      </div>
                      {options.footer?.enabled && (
                        <div className={styles.previewFooterChrome}>
                          {[options.footer.text, options.footer.pageNumbers ? t("pageNumber", { number: index + 1 }) : ""]
                            .filter(Boolean)
                            .join("   ")}
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function readPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function capturePreviewScrollAnchor(
  stage: HTMLDivElement,
  renderedPageHeight: number,
  pageGap: number,
): PreviewScrollAnchor {
  const pageStride = Math.max(1, renderedPageHeight + pageGap);
  const pageIndex = Math.max(0, Math.floor(stage.scrollTop / pageStride));
  const pageOffset = Math.max(0, stage.scrollTop - pageIndex * pageStride);
  const clampedPageOffset = Math.min(pageOffset, renderedPageHeight);
  const gapOffset = Math.max(0, pageOffset - renderedPageHeight);

  return {
    pageIndex,
    pageProgress: renderedPageHeight > 0 ? clampedPageOffset / renderedPageHeight : 0,
    gapOffset: Math.min(gapOffset, pageGap),
  };
}

function scrollTopForPreviewAnchor(
  anchor: PreviewScrollAnchor,
  renderedPageHeight: number,
  pageGap: number,
): number {
  return (
    anchor.pageIndex * (renderedPageHeight + pageGap) +
    anchor.pageProgress * renderedPageHeight +
    anchor.gapOffset
  );
}

function renderBlock(block: TextPdfBlock, index: number) {
  if (block.type === "heading") {
    const className =
      block.level === 1 ? styles.previewHeading1 : block.level === 2 ? styles.previewHeading2 : styles.previewHeading3;
    return (
      <h2 key={index} className={markClass(className, block.marks)}>
        {block.text}
      </h2>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={index} className={markClass(styles.previewParagraph, block.marks)} style={{ textAlign: block.align }}>
        {block.text}
      </p>
    );
  }

  if (block.type === "list") {
    const start = block.start ?? 1;
    const items = block.items.map((item, itemIndex) => (
      <li key={`${index}-${itemIndex}`} className={styles.previewListItem}>
        <span className={styles.previewListMarker}>{block.ordered ? `${start + itemIndex}.` : "\u2022"}</span>
        <span className={styles.previewListText}>{item}</span>
      </li>
    ));
    if (block.ordered) {
      return (
        <ol key={index} className={styles.previewList}>
          {items}
        </ol>
      );
    }
    return (
      <ul key={index} className={styles.previewList}>
        {items}
      </ul>
    );
  }

  return null;
}

function markClass(base: string, marks: string[] = []) {
  return [
    base,
    marks.includes("bold") ? styles.bold : "",
    marks.includes("italic") ? styles.italic : "",
    marks.includes("underline") ? styles.underline : "",
  ]
    .filter(Boolean)
    .join(" ");
}
