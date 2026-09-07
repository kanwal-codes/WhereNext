"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

declare global {
  interface Window {
    /** Set once the user has manually toggled this session — tells ThemeSync's profile fetch
     * (in flight from page load) not to overwrite a click that happened while it was pending. */
    __themeManuallySet?: boolean;
  }
}

/** Mirrors the inline no-flash script in layout.tsx — the source of truth is the
 *  `dark` class on <html>, not React state (which only exists to re-render the icon). */
const currentTheme = (): Theme => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light");

/** Light/dark toggle. Defaults to the system preference (set by the no-flash script in
 *  the root layout); an explicit choice here is remembered in localStorage from then on. */
export function ThemeToggle({ className }: { className?: string }) {
  // Real theme resolves client-side only (it depends on the class the no-flash script set
  // before hydration) — start at "light" so server and first client render always agree.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch { /* private browsing, etc. */ }
    // A manual toggle always wins over ThemeSync's in-flight (possibly now-stale) profile
    // fetch from page load — without this flag, that fetch can resolve a beat later and stomp
    // the click right back to whatever the account had saved before this one.
    window.__themeManuallySet = true;
    // Best-effort: carries the choice to the account so a new device picks it up too (see
    // ThemeSync). Not awaited — the toggle itself must never wait on the network, and a logged
    // -out visitor's 401 here is expected and harmless.
    fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: next }) }).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-accent",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
