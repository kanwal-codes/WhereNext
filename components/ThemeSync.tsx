"use client";

import { useEffect } from "react";

/** Runs once per load: if the signed-in account has a saved theme that differs from what's
 * applied on this device (new browser, cleared storage), adopt it. localStorage only remembers
 * a choice on the browser that made it — this is what makes it follow the account instead. */
export function ThemeSync() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || window.__themeManuallySet) return;
        const theme = body?.profile?.theme;
        if (theme !== "light" && theme !== "dark") return;
        const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
        if (theme === current) return;
        document.documentElement.classList.toggle("dark", theme === "dark");
        try { localStorage.setItem("theme", theme); } catch { /* private browsing, etc. */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return null;
}
