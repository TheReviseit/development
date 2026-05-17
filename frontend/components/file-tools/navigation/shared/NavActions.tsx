"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";
import styles from "../files-navigation.module.css";

interface NavActionsProps {
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
}

export default function NavActions({ onNavigate, variant = "desktop" }: NavActionsProps) {
  const t = useTranslations("common");
  const isDrawer = variant === "drawer";

  return (
    <div className={isDrawer ? styles.drawerActions : styles.actions}>
      <LanguageSwitcher variant={variant} onNavigate={onNavigate} />
      <Link className={isDrawer ? styles.drawerSecondaryAction : styles.secondaryAction} href="/login" onClick={onNavigate}>
        {t("login")}
      </Link>
      <Link className={isDrawer ? styles.drawerPrimaryAction : styles.primaryAction} href="/signup" onClick={onNavigate}>
        {t("signUp")}
      </Link>
    </div>
  );
}
