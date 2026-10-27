"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "eventick-theme";
const ThemeContext = createContext(null);

// Dark is the product default — not "whatever the OS prefers" — matching the
// v3 identity, which is designed black-first (the reference it followed never
// shows a light mode at all). "auto" still exists and still follows the OS
// for anyone who explicitly asks for it, but nobody lands there by default
// any more: a first-time visitor with no stored preference, and a browser set
// to light, now gets Eventick's own dark theme rather than the system's
// light one. The inline script in layout.tsx applies the same default before
// first paint, so there is no flash of light before JS runs.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light" || stored === "auto") setThemeState(stored);
    } catch {
      // private mode / blocked storage — stay on the dark default
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      // Dark is implicit (the default), so only persist an explicit choice —
      // "light" or an explicit "auto" opt-in — not the state nobody picked.
      if (theme === "dark") localStorage.removeItem(STORAGE_KEY);
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
