import { useEffect, useRef, useState } from "react";
import { THEME_LABELS, THEME_OPTIONS, type Theme } from "./theme";

// "Сменить тему" — Александр's ask (2026-09-26): the button itself should
// always read "Сменить тему", not the name of whichever theme is currently
// active (which is what a native <select> would show on its closed face,
// since a <select> always displays its own selected option's label — there
// is no way to decouple that from a plain <select>, hence this small
// custom dropdown instead). Clicking it opens a short menu of all 6 named
// themes; picking one applies+saves it and closes the menu.
interface ThemePickerProps {
  theme: Theme;
  onChange: (next: Theme) => void;
}

export default function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on an outside click and on Escape — standard dropdown behavior,
  // and without it the menu would stay open until the next theme pick,
  // which is confusing next to every other button on the page.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="theme-picker-wrap" ref={wrapRef}>
      {open && (
        <div className="theme-menu" role="menu">
          {THEME_OPTIONS.map(t => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={t === theme}
              className={"theme-menu-item" + (t === theme ? " active" : "")}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="theme-picker-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        🎨 Сменить тему
      </button>
    </div>
  );
}
