"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "eventick-theme";
const ThemeContext = createContext(null);

// "auto" follows the OS; "light"/"dark" pin it via data-theme, which the
// stylesheet's :root[data-theme=...] rules key off. A matching inline script
// in layout.tsx applies the stored value before first paint.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("auto");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light") setThemeState(stored);
    } catch {
      // private mode / blocked storage — stay on auto
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const resolved =
    theme === "auto"
      ? typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  const value = {
    theme,
    resolved,
    setTheme: setThemeState,
    toggle: () => setThemeState(resolved === "dark" ? "light" : "dark"),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
