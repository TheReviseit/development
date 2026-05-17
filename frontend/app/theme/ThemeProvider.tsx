"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME_ID,
  THEME_ENGINE_ENABLED,
  THEME_REGISTRY,
  coerceThemeId,
} from "./theme-registry";
import { applyThemeToDocument, resolveInitialThemeFromDom } from "./theme-dom";
import {
  subscribeToThemeStorage,
  writeStoredTheme,
} from "./theme-storage";
import type { ThemeContextValue, ThemeId } from "./theme-types";

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document === "undefined") return DEFAULT_THEME_ID;
    return resolveInitialThemeFromDom();
  });

  useLayoutEffect(() => {
    applyThemeToDocument(resolveInitialThemeFromDom());
  }, []);

  useEffect(() => {
    return subscribeToThemeStorage((nextTheme) => {
      setThemeState(applyThemeToDocument(nextTheme));
    });
  }, []);

  const setTheme = useCallback((nextTheme: ThemeId) => {
    if (!THEME_ENGINE_ENABLED) return;

    const resolvedTheme = coerceThemeId(nextTheme);
    writeStoredTheme(resolvedTheme);
    setThemeState(applyThemeToDocument(resolvedTheme));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme,
      availableThemes: THEME_REGISTRY,
      isDark: theme === "dark",
      isThemeEngineEnabled: THEME_ENGINE_ENABLED,
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
