import {
  DEFAULT_THEME_ID,
  FALLBACK_THEME_ID,
  THEME_ENGINE_ENABLED,
  THEME_REGISTRY,
  THEME_STORAGE_KEY,
} from "./theme-registry";

export function getThemeBootstrapScript(): string {
  const themes = THEME_REGISTRY.map((theme) => theme.id);
  const metaThemeColors = Object.fromEntries(
    THEME_REGISTRY.map((theme) => [theme.id, theme.metaThemeColor])
  );

  return `(function(){try{var enabled=${JSON.stringify(THEME_ENGINE_ENABLED)};var fallback=${JSON.stringify(FALLBACK_THEME_ID)};var defaultTheme=${JSON.stringify(DEFAULT_THEME_ID)};var key=${JSON.stringify(THEME_STORAGE_KEY)};var valid=${JSON.stringify(themes)};var colors=${JSON.stringify(metaThemeColors)};var root=document.documentElement;var theme=enabled?defaultTheme:fallback;function isValid(value){return valid.indexOf(value)>-1;}if(enabled){var raw=null;try{raw=window.localStorage.getItem(key);}catch(_e){}if(raw){if(isValid(raw)){theme=raw;}else{try{var parsed=JSON.parse(raw);if(parsed&&isValid(parsed.theme)){theme=parsed.theme;}}catch(_e){}}}}if(!isValid(theme)){theme=defaultTheme;}root.dataset.theme=theme;root.dataset.colorScheme=theme;root.style.colorScheme=theme;root.classList.toggle("dark",theme==="dark");root.classList.toggle("light",theme==="light");var meta=document.querySelector('meta[name="theme-color"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","theme-color");document.head.appendChild(meta);}meta.setAttribute("content",colors[theme]||colors[defaultTheme]||"#f6f7fb");}catch(error){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME_ID)};document.documentElement.dataset.colorScheme=${JSON.stringify(DEFAULT_THEME_ID)};document.documentElement.style.colorScheme=${JSON.stringify(DEFAULT_THEME_ID)};}})();`;
}

export function ThemeScript() {
  return (
    <script
      id="flowauxi-theme-script"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
    />
  );
}
