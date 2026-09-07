"use client";

import { useEffect, useState } from "react";

/**
 * Live-reactive dark/light theme state — tracks the `dark` class on <html> (set by the
 * no-flash script in the root layout, and by `ThemeToggle`). Starts `false` so server
 * and first client render agree, corrected right after mount, then kept live via a
 * MutationObserver so flipping the toggle anywhere on the page updates callers with no
 * reload — e.g. a hero image that should swap to a night version in dark mode.
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}
