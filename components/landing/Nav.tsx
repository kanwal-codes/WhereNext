"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { motionTokens } from "@/components/motion-primitives";
import { startTrip } from "@/components/landing/choreography";

const LINKS = [{ href: "/sign-in", label: "Sign in" }] as const;

/**
 * Landing page overhaul (Storyboard: Nav). Transparent + 80px over the hero,
 * compresses to 64px with a blurred canvas background past ~350px of scroll.
 * A simple threshold + CSS transition, not GSAP — this is a binary UI state,
 * not scroll-scrubbed choreography, so it stays owned by ordinary React/CSS
 * per the GSAP-vs-Framer Motion split (Build_Plan step 4).
 */
export function Nav() {
  const [compressed, setCompressed] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setCompressed(window.scrollY > 350);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`landing-nav fixed inset-x-0 top-0 z-50 flex items-center justify-between transition-[height,background-color,backdrop-filter,border-color] duration-[350ms] ${
        compressed ? "h-16 border-b border-border bg-background/82 backdrop-blur-md" : "h-20 border-b border-transparent bg-transparent"
      }`}
    >
      <Link href="/" aria-label="Where Next home" className="hit-44 inline-flex">
        {/* The first screen's boarding pass carries the name, so the wordmark waits until the nav compresses. It stays in the page (and the link stays labelled) throughout. */}
        <span className={`inline-block transition-opacity duration-300 ${compressed ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <BrandMark variant="text" className="transition-[font-size] duration-[350ms]" textClassName={compressed ? "text-lg" : "text-xl"} />
        </span>
      </Link>

      <nav aria-label="Primary" className="ml-auto flex items-center gap-3 md:gap-8">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hit-44 text-sm text-foreground"
          >
            <motion.span className="inline-block" whileHover={reduce ? undefined : { y: -2 }} transition={motionTokens.fast}>
              {link.label}
            </motion.span>
          </Link>
        ))}
        <Link
          href="/sign-up"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            startTrip();
          }}
          className="btn-primary hit-44 px-3 text-sm sm:px-4"
        >
          <motion.span className="inline-flex items-center gap-1.5" whileHover="hover" initial="rest">
            Start a trip
            <motion.span
              className="inline-flex"
              variants={reduce ? undefined : { rest: { x: 0, y: 0 }, hover: { x: 3, y: -3 } }}
              transition={motionTokens.fast}
            >
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </motion.span>
          </motion.span>
        </Link>
      </nav>
    </header>
  );
}
