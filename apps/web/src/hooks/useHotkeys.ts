import { useEffect } from "react";

/**
 * Global vault shortcuts (Bitwarden-style):
 * `/` focus search · `n` new item · `Escape` close panels
 * Ignored while typing in inputs (except Escape).
 */
export function useHotkeys(handlers: {
  onSearch?: () => void;
  onNew?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}) {
  const { onSearch, onNew, onEscape, enabled = true } = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        onEscape?.();
        return;
      }

      if (editable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/" && onSearch) {
        e.preventDefault();
        onSearch();
        return;
      }
      if ((e.key === "n" || e.key === "N") && onNew) {
        e.preventDefault();
        onNew();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onSearch, onNew, onEscape]);
}
