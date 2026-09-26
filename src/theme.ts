// Theme picker, persisted per-device (point 14 of Александр's original
// spec, extended 2026-09-26 from a plain light/dark toggle to a full
// "Выбор темы" with 6 named options: Тёмная, Светлая, Бежевая, Розовая,
// Зелёная, Синяя). Whichever theme a person picks on their own computer
// stays there (localStorage), independent of every other device — a fresh
// device/browser with nothing saved always starts on "Светлая" (light),
// per Александр's explicit ask, even though "dark" used to be the
// no-value fallback before this change.
const THEME_KEY = "qa-tool-theme";

export type Theme = "dark" | "light" | "beige" | "pink" | "green" | "blue";

// Order matches how Александр listed them, and is what the picker's
// dropdown shows top to bottom.
export const THEME_OPTIONS: Theme[] = ["dark", "light", "beige", "pink", "green", "blue"];

export const THEME_LABELS: Record<Theme, string> = {
  dark: "Тёмная",
  light: "Светлая",
  beige: "Бежевая",
  pink: "Розовая",
  green: "Зелёная",
  blue: "Синяя",
};

function isTheme(value: string | null): value is Theme {
  return value != null && (THEME_OPTIONS as string[]).includes(value);
}

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* ignore — falls back to light below */
  }
  // Default changed 2026-09-26: always "light" on a device/browser with no
  // saved choice yet (it used to default to "dark") — Александр's explicit
  // ask, regardless of how many themes exist now.
  return "light";
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
