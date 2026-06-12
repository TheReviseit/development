import Link from "next/link";
import type { ReactNode } from "react";
import Image from "next/image";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import FilesNavbar from "./navigation/FilesNavbar";
import styles from "./files-product-chrome.module.css";
import hoverStyles from "./files-hover-overrides.module.css";
import radiusStyles from "./files-radius-overrides.module.css";
import redesignStyles from "./files-redesign-overrides.module.css";
import fixStyles from "./files-redesign-fixes.module.css";
import densityStyles from "./files-card-density.module.css";
import typographyStyles from "./files-typography-tune.module.css";
import footerSimpleStyles from "./files-footer-simple.module.css";
import hoverSimpleStyles from "./files-hover-simple.module.css";
import footerPolishStyles from "./files-footer-polish.module.css";
import footerBlackStyles from "./files-footer-black.module.css";

interface FilesProductChromeProps {
  children: ReactNode;
}

const footerLinkStyle = { color: "#aab6c8" };

const solidNavigationSurfaceCss = `
[data-files-product-navbar],
[data-files-navbar] {
  background: #ffffff !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

[data-files-navbar] :is(
  [class*="desktopNav"],
  [class*="navLink"],
  [class*="tabletLink"],
  [class*="searchButton"],
  [class*="mobileSearchButton"],
  [class*="menuButton"],
  [class*="iconAction"],
  [class*="languageButton"],
  [class*="languageMenu"],
  [class*="megaSurface"],
  [class*="mobileSearchPanel"],
  [class*="mobileSearchField"],
  [class*="drawerLanguageButton"],
  [class*="drawerLanguageMenu"],
  [class*="drawerSearch"],
  [class*="drawerClose"],
  [class*="drawerFooter"]
),
[data-files-navbar] :is(
  [class*="mobileSearchField"],
  [class*="drawerSearch"]
) input,
[data-files-mobile-drawer],
[data-files-mobile-backdrop] {
  background-color: #ffffff !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

[data-files-navbar] :is(
  [class*="languageButton"],
  [class*="mobileSearchButton"],
  [class*="menuButton"],
  [class*="searchButton"],
  [class*="iconAction"],
  [class*="drawerLanguageButton"],
  [class*="drawerClose"]
) {
  border-color: #e4eaf2 !important;
}
`;

export default function FilesProductChrome({ children }: FilesProductChromeProps) {
  const locale = useLocale();
  const footer = useTranslations("files.footer");
  const catalog = useTranslations("tools.catalog");
  const toolsHref = (suffix = "") => `/${locale}/tools${suffix}`;

  return (
    <div
      className={`${styles.chrome} ${radiusStyles.radiusScope} ${hoverStyles.hoverScope} ${redesignStyles.redesignScope} ${fixStyles.fixScope} ${densityStyles.densityScope} ${typographyStyles.typographyScope} ${footerSimpleStyles.footerSimpleScope} ${hoverSimpleStyles.hoverSimpleScope} ${footerPolishStyles.footerPolishScope} ${footerBlackStyles.footerBlackScope}`}
    >
      <style data-files-solid-navigation-surfaces dangerouslySetInnerHTML={{ __html: solidNavigationSurfaceCss }} />
      <FilesNavbar />

      <div className={styles.content} data-files-product-content>
        {children}
      </div>

      <footer className={styles.footer} data-files-product-footer style={{ backgroundColor: "#000000", borderTopColor: "#111827" }}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Link className={styles.footerLogo} href={toolsHref()} aria-label={footer("brandAria")} style={{ color: "#ffffff" }}>
              <span
                className={styles.footerLogoMark}
                style={{
                  alignItems: "center",
                  background: "#ffffff",
                  borderRadius: 12,
                  display: "inline-flex",
                  height: 42,
                  justifyContent: "center",
                  overflow: "hidden",
                  width: 42,
                }}
              >
                <Image
                  className={styles.footerLogoAsset}
                  src="/logo-transparent.png"
                  alt=""
                  width={28}
                  height={28}
                  style={{ filter: "none", transform: "scale(1.35)" }}
                />
              </span>
              <span className={styles.footerLogoText} style={{ color: "#ffffff", fontSize: 18, fontWeight: 800 }}>
                Flowauxi
              </span>
            </Link>
            <p className={styles.footerCopy} style={{ color: "#aab6c8" }}>
              {footer("description")}
            </p>
          </div>

          <div className={styles.footerColumns}>
            <div className={styles.footerColumn}>
              <h2 className={styles.footerHeading} style={{ color: "#ffffff" }}>{footer("columns.tools")}</h2>
              <Link href={toolsHref("/text-to-pdf")} style={footerLinkStyle}>{catalog("text_to_pdf.name")}</Link>
              <Link href={toolsHref("/word-to-pdf")} style={footerLinkStyle}>{catalog("docx_to_pdf.name")}</Link>
              <Link href={toolsHref("/image-to-pdf")} style={footerLinkStyle}>{catalog("image_to_pdf.name")}</Link>
            </div>
            <div className={styles.footerColumn}>
              <h2 className={styles.footerHeading} style={{ color: "#ffffff" }}>{footer("columns.pdf")}</h2>
              <Link href={toolsHref("/merge-pdf")} style={footerLinkStyle}>{catalog("merge_pdf.name")}</Link>
              <Link href={toolsHref("/split-pdf")} style={footerLinkStyle}>{catalog("split_pdf.name")}</Link>
              <Link href={toolsHref("/compress-pdf")} style={footerLinkStyle}>{catalog("compress_pdf.name")}</Link>
            </div>
            <div className={styles.footerColumn}>
              <h2 className={styles.footerHeading} style={{ color: "#ffffff" }}>{footer("columns.workspace")}</h2>
              <Link href="/files" style={footerLinkStyle}>{footer("links.dashboard")}</Link>
              <Link href="/files/history" style={footerLinkStyle}>{footer("links.history")}</Link>
              <Link href="/files/settings" style={footerLinkStyle}>{footer("links.settings")}</Link>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom} style={{ borderTopColor: "#1f2937", color: "#aab6c8" }}>
          <span>&copy; 2026 Flowauxi</span>
          <div className={styles.footerTrust}>
            <span className={styles.trustItem}>
              <ShieldCheck size={15} aria-hidden="true" />
              {footer("trust.privateExports")}
            </span>
            <span className={styles.trustItem}>
              <Sparkles size={15} aria-hidden="true" />
              {footer("trust.moreTools")}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
