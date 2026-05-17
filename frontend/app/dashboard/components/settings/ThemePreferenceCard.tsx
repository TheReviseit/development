"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/theme/ThemeProvider";
import styles from "@/app/dashboard/settings/settings.module.css";

export function ThemePreferenceCard() {
  const { isDark, isThemeEngineEnabled, setTheme } = useTheme();

  if (!isThemeEngineEnabled) {
    return null;
  }

  const nextTheme = isDark ? "light" : "dark";

  return (
    <section className={styles.settingsCard} aria-labelledby="appearance-title">
      <div className={styles.appearanceLayout}>
        <div className={styles.cardHeader}>
          <div className={styles.cardIcon} aria-hidden="true">
            {isDark ? <Moon size={24} /> : <Sun size={24} />}
          </div>
          <div className={styles.cardTitleGroup}>
            <h2 id="appearance-title" className={styles.cardTitle}>
              Appearance
            </h2>
            <p id="theme-toggle-description" className={styles.cardDescription}>
              Choose how Flowauxi looks across dashboards, admin tools, and
              public product surfaces.
            </p>
          </div>
        </div>

        <div className={styles.themeControl}>
          <div className={styles.themePreview} aria-hidden="true">
            <span className={styles.themePreviewSun}>
              <Sun size={16} />
            </span>
            <span className={styles.themePreviewMoon}>
              <Moon size={16} />
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-describedby="theme-toggle-description"
            className={styles.themeSwitch}
            data-state={isDark ? "checked" : "unchecked"}
            onClick={() => setTheme(nextTheme)}
          >
            <span className={styles.themeSwitchTrack}>
              <span className={styles.themeSwitchThumb}>
                {isDark ? <Moon size={14} /> : <Sun size={14} />}
              </span>
            </span>
            <span className={styles.themeSwitchText}>
              {isDark ? "Dark theme" : "Light theme"}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
