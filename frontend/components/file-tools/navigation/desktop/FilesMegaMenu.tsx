"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { FilesMegaSection, FilesMegaTone } from "../files-navigation-data";
import { localizeFilesHref } from "../files-localized-href";
import styles from "../files-navigation.module.css";

const toneClass: Record<FilesMegaTone, string> = {
  blue: styles.toneBlue,
  coral: styles.toneCoral,
  green: styles.toneGreen,
  indigo: styles.toneIndigo,
  purple: styles.tonePurple,
  yellow: styles.toneYellow,
};

const megaMenuInitial = {
  opacity: 0,
  scaleY: 0.94,
  y: -16,
};

const megaMenuAnimate = {
  opacity: 1,
  scaleY: 1,
  y: 0,
};

const megaMenuExit = {
  opacity: 0,
  scaleY: 0.97,
  y: -12,
};

const megaMenuTransition = {
  opacity: { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const },
  scaleY: { duration: 0.48, ease: [0.16, 1, 0.3, 1] as const },
  y: { duration: 0.46, ease: [0.16, 1, 0.3, 1] as const },
};

interface FilesMegaMenuProps {
  labelledBy: string;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  pathname: string;
  sections: FilesMegaSection[];
}

export default function FilesMegaMenu({ labelledBy, onClose, onMouseEnter, onMouseLeave, pathname, sections }: FilesMegaMenuProps) {
  const t = useTranslations("navbar");
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      aria-labelledby={labelledBy}
      className={styles.megaMenu}
      data-files-mega-menu
      initial={prefersReducedMotion ? { opacity: 1 } : megaMenuInitial}
      animate={prefersReducedMotion ? { opacity: 1 } : megaMenuAnimate}
      exit={prefersReducedMotion ? { opacity: 0 } : megaMenuExit}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ transformOrigin: "50% 0%", willChange: "opacity, transform" }}
      transition={prefersReducedMotion ? { duration: 0 } : megaMenuTransition}
    >
      <div className={styles.megaSurface}>
        <div className={styles.megaIntro} data-files-mega-intro>
          <span className={styles.megaEyebrow}>{t("mega.eyebrow")}</span>
          <div className={styles.megaIntroBody} data-files-mega-intro-body>
            <h2 className={styles.megaTitle}>{t("mega.title")}</h2>
            <p className={styles.megaCopy}>{t("mega.copy")}</p>
            <Link className={styles.megaIntroLink} href={localizeFilesHref("/tools", pathname)} onClick={onClose}>
              {t("mega.viewAllTools")}
            </Link>
          </div>
        </div>
        <div className={styles.megaGrid}>
          {sections.map((section) => {
            const heading = t(section.headingKey);

            return (
              <section key={section.id} className={styles.megaSection} aria-labelledby={`files-mega-${section.id}`}>
                <h3 className={styles.megaHeading} id={`files-mega-${section.id}`}>
                  {heading}
                </h3>
                <div className={styles.megaList}>
                  {section.tools.map((tool) => {
                    const Icon = tool.icon;
                    const label = t(tool.labelKey);

                    return (
                      <Link key={`${section.id}-${tool.id}`} className={styles.megaLink} href={localizeFilesHref(tool.href, pathname)} onClick={onClose}>
                        <span className={`${styles.megaIcon} ${toneClass[tool.tone]}`}>
                          <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
                        </span>
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
