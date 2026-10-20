"use client";

import { useEffect, useState, type ComponentType } from "react";

/**
 * On-device speed diagnostics, off unless asked for. Open any page with `?perf=1` (it is remembered in that browser until `?perf=0`) and a
 * small "perf" pill appears: it counts frames, long tasks and what ran in them, and "Copy report" puts the numbers on the clipboard.
 * Nothing is loaded for anyone else: the probe itself is fetched only when the switch is on.
 */
export function PerfProbeGate() {
  const [Probe, setProbe] = useState<ComponentType | null>(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("perf");
      if (q === "1") localStorage.setItem("wn-perf", "1");
      if (q === "0") localStorage.removeItem("wn-perf");
      if (localStorage.getItem("wn-perf") !== "1") return;
    } catch {
      return;
    }
    void import("@/components/PerfProbe").then((m) => setProbe(() => m.PerfProbe));
  }, []);
  return Probe ? <Probe /> : null;
}
