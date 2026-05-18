import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import FileToolComingSoon from "@/components/file-tools/FileToolComingSoon";
import FilesProductChrome from "@/components/file-tools/FilesProductChrome";
import FilesToolHub from "@/components/file-tools/FilesToolHub";
import ImageConverterShell from "@/components/file-tools/ImageConverterShell";
import ToolShell from "@/components/file-tools/ToolShell";
import { getFileToolBySlug } from "@/lib/file-tools/tool-catalog";
import { loadLocaleMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/types/i18n";

export const publicToolsPath = "/tools";

export async function renderLocalizedFilesLayout(locale: Locale, children: ReactNode) {
  setRequestLocale(locale);
  const messages = await loadLocaleMessages(locale);

  return (
    <NextIntlClientProvider key={locale} locale={locale} messages={messages}>
      <FilesProductChrome>{children}</FilesProductChrome>
    </NextIntlClientProvider>
  );
}

export async function localizedFilesMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "metadata.files" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}${publicToolsPath}`,
    },
  };
}

export function renderLocalizedFilesPage(locale: Locale) {
  setRequestLocale(locale);
  return <FilesToolHub basePath={`/${locale}${publicToolsPath}`} />;
}

export async function localizedTextToPdfMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "metadata.textToPdf" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}${publicToolsPath}/text-to-pdf`,
    },
  };
}

export function renderLocalizedTextToPdfPage(locale: Locale) {
  setRequestLocale(locale);
  return <ToolShell mode="public" basePath={`/${locale}${publicToolsPath}`} />;
}

export async function localizedImageConverterMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "metadata.imageConverter" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}${publicToolsPath}/image-converter`,
    },
  };
}

export function renderLocalizedImageConverterPage(locale: Locale) {
  setRequestLocale(locale);
  return <ImageConverterShell basePath={`/${locale}${publicToolsPath}`} />;
}

export async function localizedFileToolMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const tool = getFileToolBySlug(slug);
  const metadata = await getTranslations({ locale, namespace: "metadata.files" });
  const catalog = await getTranslations({ locale, namespace: "tools.catalog" });

  if (!tool) {
    return { title: metadata("title") };
  }

  return {
    title: `${catalog(`${tool.key}.name`)} | ${metadata("siteName")}`,
    description: catalog(`${tool.key}.description`),
    alternates: {
      canonical: `/${locale}${publicToolsPath}/${tool.slug}`,
    },
  };
}

export function renderLocalizedFileToolPage(locale: Locale, slug: string) {
  setRequestLocale(locale);

  const tool = getFileToolBySlug(slug);
  if (!tool) notFound();

  return <FileToolComingSoon tool={tool} backHref={`/${locale}${publicToolsPath}`} />;
}
