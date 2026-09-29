"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * The travel sequence resolves directly into the final invitation. There is
 * no callback animation between the dinner moment and this page.
 */
export function FinaleScene() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = document.querySelector("header");
    const trigger = ScrollTrigger.create({
      trigger: sectionRef.current,
      // Not "top top": the finale plus its footer is exactly one screen, so its top only meets the
      // top of the viewport at the very end of the page.
      start: "top 90%",
      onEnter: () => nav && gsap.set(nav, { opacity: 1 }),
      onEnterBack: () => nav && gsap.set(nav, { opacity: 1 }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <>
      <div ref={sectionRef} data-scene="finale" className="relative grid min-h-[calc(100dvh-7rem)] place-items-center bg-background px-6 text-center">
        <h2 className="font-display text-[clamp(3.5rem,10vw,7rem)] leading-[0.95] tracking-[-0.03em]">so... Where Next?</h2>
      </div>

      {/* Fixed at 7rem so the finale above can be exactly one screen minus this. */}
      <footer className="flex h-28 items-center bg-background px-8 text-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Where Next</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
