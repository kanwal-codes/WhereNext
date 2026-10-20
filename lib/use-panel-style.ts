"use client";

import { useEffect, useState } from "react";

export type PanelStyle = "sheet" | "classic";

/**
 * How the phone's detail panel is drawn: "classic", a flat opaque full screen (no rounding, shadow or dimmed backdrop: cheap on any
 * GPU, and the default), or the "sheet" (rounded, over a dimmed chat), which was heavy on mid-range Android. `?panel=sheet` /
 * `?panel=classic` switch it on any page and the choice is remembered in that browser.
 */
export function usePanelStyle(): PanelStyle {
  const [style, setStyle] = useState<PanelStyle>("classic");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("panel");
      if (q === "classic" || q === "sheet") localStorage.setItem("wn-panel-style", q);
      setStyle(localStorage.getItem("wn-panel-style") === "sheet" ? "sheet" : "classic");
    } catch {
      /* storage blocked: the flat panel */
    }
  }, []);
  return style;
}
