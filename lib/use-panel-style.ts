"use client";

import { useEffect, useState } from "react";

export type PanelStyle = "sheet" | "classic";

/**
 * How the phone's detail panel is drawn: the redesigned "sheet" (rounded, over a dimmed chat) or the "classic" full screen it replaced.
 * Switch with `?panel=classic` / `?panel=sheet` on any page; the choice is remembered in that browser. It exists so the two can be
 * compared by hand on a real phone, where a lab cannot tell them apart.
 */
export function usePanelStyle(): PanelStyle {
  const [style, setStyle] = useState<PanelStyle>("sheet");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("panel");
      if (q === "classic" || q === "sheet") localStorage.setItem("wn-panel", q);
      setStyle(localStorage.getItem("wn-panel") === "classic" ? "classic" : "sheet");
    } catch {
      /* storage blocked: the sheet */
    }
  }, []);
  return style;
}
