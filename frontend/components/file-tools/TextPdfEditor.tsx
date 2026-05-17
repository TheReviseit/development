"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { TextAlign, TextMark } from "@/lib/file-tools/contracts";
import styles from "./file-tools.module.css";

interface TextPdfEditorProps {
  title: string;
  rawText: string;
  marks: TextMark[];
  align: TextAlign;
  onTitleChange: (value: string) => void;
  onRawTextChange: (value: string) => void;
  onMarksChange: (value: TextMark[]) => void;
  onAlignChange: (value: TextAlign) => void;
}

export default function TextPdfEditor({
  title,
  rawText,
  marks,
  align,
  onTitleChange,
  onRawTextChange,
  onMarksChange,
  onAlignChange,
}: TextPdfEditorProps) {
  const t = useTranslations("files.textToPdf.editor");
  const toggleMark = (mark: TextMark) => {
    onMarksChange(marks.includes(mark) ? marks.filter((item) => item !== mark) : [...marks, mark]);
  };

  const appendLine = (line: string) => {
    onRawTextChange(`${rawText}${rawText.endsWith("\n") ? "" : "\n"}${line}`);
  };
  const alignmentButtons: Array<{ value: TextAlign; icon: LucideIcon; title: string }> = [
    { value: "left", icon: AlignLeft, title: t("alignLeft") },
    { value: "center", icon: AlignCenter, title: t("alignCenter") },
    { value: "right", icon: AlignRight, title: t("alignRight") },
    { value: "justify", icon: AlignJustify, title: t("justify") },
  ];

  return (
    <section className={styles.panel} aria-labelledby="text-pdf-editor-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle} id="text-pdf-editor-title">
          <Pilcrow size={17} aria-hidden="true" />
          {t("panel")}
        </div>
        <div className={styles.toolbar} aria-label={t("formatting")}>
          <button
            type="button"
            className={`${styles.iconButton} ${marks.includes("bold") ? styles.activeButton : ""}`}
            onClick={() => toggleMark("bold")}
            title={t("bold")}
            aria-pressed={marks.includes("bold")}
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${marks.includes("italic") ? styles.activeButton : ""}`}
            onClick={() => toggleMark("italic")}
            title={t("italic")}
            aria-pressed={marks.includes("italic")}
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${marks.includes("underline") ? styles.activeButton : ""}`}
            onClick={() => toggleMark("underline")}
            title={t("underline")}
            aria-pressed={marks.includes("underline")}
          >
            <Underline size={16} />
          </button>
          <button type="button" className={styles.iconButton} onClick={() => appendLine(`# ${t("headingPlaceholder")}`)} title={t("heading1")}>
            <Heading1 size={16} />
          </button>
          <button type="button" className={styles.iconButton} onClick={() => appendLine(`## ${t("headingPlaceholder")}`)} title={t("heading2")}>
            <Heading2 size={16} />
          </button>
          <button type="button" className={styles.iconButton} onClick={() => appendLine(`- ${t("listItemPlaceholder")}`)} title={t("bulletList")}>
            <List size={16} />
          </button>
          <button type="button" className={styles.iconButton} onClick={() => appendLine(`1. ${t("listItemPlaceholder")}`)} title={t("numberedList")}>
            <ListOrdered size={16} />
          </button>
        </div>
      </div>
      <div className={styles.editorBody}>
        <label className={styles.field}>
          <span className={styles.label}>{t("documentTitle")}</span>
          <input
            className={styles.input}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            maxLength={180}
            placeholder={t("untitled")}
          />
        </label>
        <div className={styles.toolbar} aria-label={t("paragraphAlignment")}>
          {alignmentButtons.map(({ value, icon: Icon, title }) => (
            <button
              key={value}
              type="button"
              className={`${styles.iconButton} ${align === value ? styles.activeButton : ""}`}
              onClick={() => onAlignChange(value)}
              title={title}
              aria-pressed={align === value}
            >
              <Icon size={16} />
            </button>
          ))}
          <button type="button" className={styles.secondaryButton} onClick={() => appendLine("---page---")}>
            {t("pageBreak")}
          </button>
        </div>
        <textarea
          className={styles.textarea}
          value={rawText}
          onChange={(event) => onRawTextChange(event.target.value)}
          aria-label={t("textareaAria")}
          placeholder={t("placeholder")}
          spellCheck
        />
      </div>
    </section>
  );
}
