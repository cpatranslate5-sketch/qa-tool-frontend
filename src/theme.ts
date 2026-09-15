// Light/dark theme, persisted per-device (point 14 of Александр's spec) —
// whichever theme a person picks on their own computer stays there.
const THEME_KEY = "qa-tool-theme";
export type Theme = "light" | "dark";

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore — falls back to dark below */
  }
  return "dark";
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* per-device convenience only — fine if it doesn't persist */
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
