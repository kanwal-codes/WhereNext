"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BrandMark } from "@/components/BrandMark";

gsap.registerPlugin(ScrollTrigger);

const FOOTER_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Discover", href: "#discover" },
  { label: "Sign in", href: "/sign-in" },
] as const;

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
      start: "top top",
      onEnter: () => nav && gsap.set(nav, { opacity: 1 }),
      onEnterBack: () => nav && gsap.set(nav, { opacity: 1 }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <>
      <div ref={sectionRef} data-scene="finale" className="relative grid min-h-[100dvh] place-items-center bg-background px-6 text-center">
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex flex-col items-center gap-8">
            <h2 className="font-display text-[clamp(3.5rem,10vw,7rem)] leading-[0.95] tracking-[-0.03em]">You should go.</h2>
            <BrandMark variant="text" textClassName="text-lg" />
            <Link href="/sign-up" className="btn-primary pointer-events-auto">
              Start a trip
            </Link>
          </div>
        </div>
      </div>

      <footer className="bg-background px-8 py-16 text-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-12">
          <div>
            <BrandMark variant="text" textClassName="text-xl" />
            <p className="mt-2 text-muted-foreground">Go somewhere.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="link-underline text-sm text-muted-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Where Next</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
