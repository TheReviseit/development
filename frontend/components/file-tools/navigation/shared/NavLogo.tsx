"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { localizeFilesHref } from "../files-localized-href";
import styles from "../files-navigation.module.css";

export default function NavLogo() {
  const pathname = usePathname();
  const t = useTranslations("navbar");

  return (
    <Link className={styles.logo} href={localizeFilesHref("/tools", pathname)} aria-label={t("filesHome")}>
      <span className={styles.logoMark}>
        <Image className={styles.logoImage} src="/logo-transparent.png" alt="" width={32} height={32} priority />
      </span>
      <span className={styles.logoText}>Flowauxi</span>
    </Link>
  );
}
