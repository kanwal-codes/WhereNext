"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { motionTokens } from "@/components/motion-primitives";

const LINKS = [
  { href: "#discover", label: "Discover" },
  { href: "#how-it-works", label: "How it works" },
  { href: "/sign-in", label: "Sign in" },
] as const;

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
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 transition-[height,background-color,backdrop-filter,border-color] duration-[350ms] md:px-8 ${
        compressed ? "h-16 border-b border-border bg-background/82 backdrop-blur-md" : "h-20 border-b border-transparent bg-transparent"
      }`}
    >
      <Link href="/" aria-label="Where Next home">
        <motion.span
          className="inline-block"
          initial={reduce ? undefined : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <BrandMark variant="text" className="transition-[font-size] duration-[350ms]" textClassName={compressed ? "text-sm" : "text-base"} />
        </motion.span>
      </Link>

      <nav aria-label="Primary" className="flex items-center gap-3 md:gap-8">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${link.href.startsWith("#") ? "hidden sm:block" : ""} text-sm text-foreground`}
          >
            <motion.span className="inline-block" whileHover={reduce ? undefined : { y: -2 }} transition={motionTokens.fast}>
              {link.label}
            </motion.span>
          </Link>
        ))}
        <Link href="/sign-up" className="btn-primary px-3 text-sm sm:px-4">
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
