"use client";

import { useEffect } from "react";
import { initMutationQueue } from "@/lib/client/mutation-queue";

/** Registers /sw.js in production builds. No-op in dev (the SW isn't emitted there). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    initMutationQueue();
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
