import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { localizeFilesHref } from "../files-localized-href";
import styles from "../files-navigation.module.css";

interface NavSearchButtonProps {
  compact?: boolean;
}

export default function NavSearchButton({ compact = false }: NavSearchButtonProps) {
  const t = useTranslations("navbar");
  const pathname = usePathname();

  return (
    <Link
      className={`${styles.searchButton} ${compact ? styles.searchButtonCompact : ""}`}
      href={localizeFilesHref("/tools", pathname)}
      aria-label={t("searchButtonAria")}
    >
      <Search size={17} aria-hidden="true" />
      <span className={styles.searchButtonText}>{t("mobile.searchPlaceholder")}</span>
    </Link>
  );
}
