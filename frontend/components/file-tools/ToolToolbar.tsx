import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "./file-tools.module.css";
import toolbarLayoutStyles from "./tool-toolbar-layout.module.css";

interface ToolToolbarProps {
  mode: "public" | "dashboard";
  authenticated: boolean;
  basePath?: string;
}

export default function ToolToolbar({ mode, authenticated, basePath = "/tools" }: ToolToolbarProps) {
  const t = useTranslations("files.textToPdf.toolbar");
  const breadcrumbItems =
    mode === "dashboard"
      ? [
          { label: t("dashboard"), href: "/dashboard" },
          { label: t("files"), href: "/dashboard/files" },
          { label: t("title") },
        ]
      : [
          { label: t("files"), href: basePath },
          { label: t("title") },
        ];

  return (
    <header className={`${styles.header} ${toolbarLayoutStyles.headerLayout}`}>
      <nav className={`${styles.breadcrumb} ${toolbarLayoutStyles.breadcrumb}`} aria-label={t("currentLocation")}>
        {breadcrumbItems.map((item, index) => (
          <span key={item.label} className={styles.breadcrumbItem}>
            {item.href ? (
              <Link className={styles.breadcrumbLink} href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span className={styles.breadcrumbCurrent} aria-current="page">
                {item.label}
              </span>
            )}
            {index < breadcrumbItems.length - 1 && <span className={styles.breadcrumbSeparator}>/</span>}
          </span>
        ))}
      </nav>

      <div className={`${styles.brandBlock} ${toolbarLayoutStyles.titleBlock}`}>
        <h1 className={styles.title}>{t("title")}</h1>
        <span className={styles.meta}>
          {authenticated ? t("authenticated") : t("guest")}
        </span>
      </div>

      <div className={toolbarLayoutStyles.headerSpacer} aria-hidden="true" />
    </header>
  );
}
