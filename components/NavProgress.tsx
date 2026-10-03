"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A hairline of coral across the top while a page is on its way. A click on a link starts it at once
 * (before the server has said a word), it creeps toward the end while the next page is built, and it
 * finishes the moment the route changes. Without it, a slow page looks like a click that did nothing.
 */
export function NavProgress() {
  const pathname = usePathname();
  const last = useRef(pathname);
  const [state, setState] = useState<"idle" | "run" | "done">("idle");

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const a = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setState("run");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    setState("done");
    const t = setTimeout(() => setState("idle"), 420);
    return () => clearTimeout(t);
  }, [pathname]);

  // Never leave it hanging if a navigation is cancelled.
  useEffect(() => {
    if (state !== "run") return;
    const t = setTimeout(() => setState("idle"), 20_000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full origin-left bg-coral"
        style={{
          transform: state === "idle" ? "scaleX(0)" : state === "run" ? "scaleX(0.82)" : "scaleX(1)",
          opacity: state === "done" ? 0 : state === "idle" ? 0 : 1,
          transition:
            state === "run"
              ? "transform 9s cubic-bezier(0.1, 0.6, 0.2, 1), opacity 120ms"
              : state === "done"
                ? "transform 180ms ease-out, opacity 260ms ease-out 160ms"
                : "none",
          boxShadow: "0 0 10px color-mix(in oklab, var(--coral) 55%, transparent)",
        }}
      />
    </div>
  );
}
