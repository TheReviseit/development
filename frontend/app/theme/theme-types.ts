export type ThemeMode = "light" | "dark";

export type ThemeId = "light" | "dark";

export type ThemeSource =
  | "app-default"
  | "user"
  | "tenant"
  | "brand"
  | "system";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  mode: ThemeMode;
  selector: string;
  colorScheme: ThemeMode;
  metaThemeColor: string;
  isDefault?: boolean;
  supportsCustomTokens?: boolean;
}

export interface StoredThemePreference {
  theme: ThemeId;
  source: ThemeSource;
  updatedAt: string;
  version: 1;
}

export interface ThemeContextValue {
  theme: ThemeId;
  resolvedTheme: ThemeId;
  availableThemes: readonly ThemeDefinition[];
  isDark: boolean;
  isThemeEngineEnabled: boolean;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
}
