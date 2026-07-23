import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const LS = "ops-vault.theme";

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Exclusive classes — never leave both light and dark active
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(LS) as ThemeMode | null;
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(LS, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);

  return { theme, setTheme, toggle };
}
