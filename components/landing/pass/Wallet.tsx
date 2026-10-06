"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BoardingPass } from "@/components/landing/pass/BoardingPass";
import { calm, watch } from "@/components/landing/story/scroll";

/**
 * The last screen's travel wallet, and the end of the page. A pass is packed in it: when the wallet
 * is on screen and the visitor has slowed down, the pass slides up out of the pocket and stops with
 * about a third still inside (the wallet is closed, but not shut). Hover or focus lifts it further.
 * The page's legal line is lettered on the leather, so the page ends on the wallet and not on a
 * white footer. That happens once; scrolling back up finds it out. With reduced motion it is simply out.
 */
export function Wallet() {
  const ref = useRef<HTMLDivElement>(null);
  const [out, setOut] = useState(false);

  // How far the pass sits down in the pocket, in px, measured from the pass itself: about a third of it, but never
  // so far that the question row (the part you use) goes into the pocket. The pass changes height with the window
  // (the fields wrap, the stub stacks under it on a phone, a long answer grows the box), so this is re-measured
  // whenever it resizes; a fixed share of the height would hide a different part of it at every size.
  useEffect(() => {
    const el = ref.current;
    const area = el?.querySelector<HTMLElement>(".wl-slot > .bp-area");
    if (!el || !area) return;
    const measure = () => {
      const route = area.querySelector<HTMLElement>(".bp-route");
      const height = area.offsetHeight;
      if (!route || !height) return;
      // Both rects move together under the slide transform, so their difference is the layout distance.
      const routeBottom = route.getBoundingClientRect().bottom - area.getBoundingClientRect().top;
      const room = Math.max(0, height - routeBottom - 20);
      const hide = Math.round(Math.min(height * 0.3, room));
      el.style.setProperty("--hide-px", `${hide}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOut(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    return watch(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Arrived and the visitor is reading, or already scrolled past (a jump to the end): the pass is out.
      if (rect.bottom < vh * 0.4 || (rect.top < vh * 0.7 && calm(250)))
        setOut(true);
    });
  }, []);

  return (
    <div ref={ref} className="wl" data-out={out ? "" : undefined}>
      <div className="wl-back" aria-hidden="true" />
      <div className="wl-slot">
        <BoardingPass finale />
      </div>
      <div className="wl-front">
        <span className="wl-lip" aria-hidden="true" />
        <span className="wl-stitch" aria-hidden="true" />
        <footer className="wl-legal">
          <p>© 2026 Where Next</p>
          <nav aria-label="Legal">
            <Link href="/privacy" className="hit-44">
              Privacy policy
            </Link>
            <Link href="/terms" className="hit-44">
              Terms of use
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
