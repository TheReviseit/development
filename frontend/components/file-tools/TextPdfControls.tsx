"use client";

import { Columns3, FileText, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TextPdfOptions } from "@/lib/file-tools/contracts";
import { MARGIN_PRESETS } from "@/lib/file-tools/limits";
import styles from "./file-tools.module.css";

interface TextPdfControlsProps {
  options: TextPdfOptions;
  onOptionsChange: (value: TextPdfOptions) => void;
}

export default function TextPdfControls({ options, onOptionsChange }: TextPdfControlsProps) {
  const t = useTranslations("files.textToPdf.settings");
  const update = <K extends keyof TextPdfOptions>(key: K, value: TextPdfOptions[K]) => {
    onOptionsChange({ ...options, [key]: value });
  };

  const updateMargin = (key: keyof TextPdfOptions["margins"], value: number) => {
    update("margins", { ...options.margins, [key]: value });
  };

  return (
    <section className={styles.panel} aria-labelledby="text-pdf-settings-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle} id="text-pdf-settings-title">
          <Settings2 size={17} aria-hidden="true" />
          {t("panel")}
        </div>
      </div>
      <div className={styles.settingsBody}>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span className={styles.label}>{t("pageSize")}</span>
            <select className={styles.select} value={options.pageSize} onChange={(event) => update("pageSize", event.target.value as TextPdfOptions["pageSize"])}>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("orientation")}</span>
            <select className={styles.select} value={options.orientation} onChange={(event) => update("orientation", event.target.value as TextPdfOptions["orientation"])}>
              <option value="portrait">{t("portrait")}</option>
              <option value="landscape">{t("landscape")}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("font")}</span>
            <select className={styles.select} value={options.fontFamily} onChange={(event) => update("fontFamily", event.target.value as TextPdfOptions["fontFamily"])}>
              <option value="Auto">{t("autoFont")}</option>
              <option value="NotoSans">Noto Sans</option>
              <option value="NotoSansTamil">Noto Sans Tamil</option>
              <option value="NotoSansDevanagari">Noto Sans Devanagari</option>
              <option value="NotoSansMalayalam">Noto Sans Malayalam</option>
              <option value="NotoSansKannada">Noto Sans Kannada</option>
              <option value="NotoSansTelugu">Noto Sans Telugu</option>
              <option value="Nirmala UI">Nirmala UI</option>
              <option value="Arial Unicode MS">Arial Unicode</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times-Roman">Times</option>
              <option value="Courier">Courier</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("fontSize")}</span>
            <input
              className={styles.numberInput}
              type="number"
              min={8}
              max={32}
              value={options.fontSize}
              onChange={(event) => update("fontSize", Number(event.target.value))}
            />
          </label>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("margins")}</span>
          <div className={styles.segmented}>
            {Object.entries(MARGIN_PRESETS).map(([key, preset]) => {
              const active = JSON.stringify(options.margins) === JSON.stringify(preset);
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.segmentButton} ${active ? styles.segmentButtonActive : ""}`}
                  onClick={() => update("margins", { ...preset })}
                >
                  {t(`marginPresets.${key}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.fieldGrid}>
          {(["top", "right", "bottom", "left"] as const).map((key) => (
            <label key={key} className={styles.field}>
              <span className={styles.label}>{t(`marginSides.${key}`)}</span>
              <input
                className={styles.numberInput}
                type="number"
                min={18}
                max={144}
                value={options.margins[key]}
                onChange={(event) => updateMargin(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t("lineHeight")}</span>
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.1}
            value={options.lineHeight}
            onChange={(event) => update("lineHeight", Number(event.target.value))}
          />
        </label>

        <div className={styles.toggleRow}>
          <label className={styles.toggleLabel}>
            <FileText size={16} />
            {t("header")}
          </label>
          <input
            type="checkbox"
            checked={Boolean(options.header?.enabled)}
            onChange={(event) => update("header", { ...(options.header || {}), enabled: event.target.checked })}
          />
        </div>
        {options.header?.enabled && (
          <input
            className={styles.input}
            value={options.header?.text || ""}
            onChange={(event) => update("header", { ...(options.header || {}), enabled: true, text: event.target.value })}
            maxLength={500}
            aria-label={t("headerText")}
          />
        )}

        <div className={styles.toggleRow}>
          <label className={styles.toggleLabel}>
            <Columns3 size={16} />
            {t("footer")}
          </label>
          <input
            type="checkbox"
            checked={Boolean(options.footer?.enabled)}
            onChange={(event) => update("footer", { ...(options.footer || {}), enabled: event.target.checked })}
          />
        </div>
        {options.footer?.enabled && (
          <>
            <input
              className={styles.input}
              value={options.footer?.text || ""}
              onChange={(event) => update("footer", { ...(options.footer || {}), enabled: true, text: event.target.value })}
              maxLength={500}
              aria-label={t("footerText")}
            />
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={Boolean(options.footer?.pageNumbers)}
                onChange={(event) => update("footer", { ...(options.footer || {}), enabled: true, pageNumbers: event.target.checked })}
              />
              {t("pageNumbers")}
            </label>
          </>
        )}
      </div>
    </section>
  );
}
