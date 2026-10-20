"use client";

import { motion } from "motion/react";
import { PHONE_V2 } from "@/lib/phone-v2";
import { cn } from "@/lib/utils";
import { SECTIONS } from "./account-options";

/** The page's sections as a rail (a row of pills on a phone-width page): the one you are in is marked, and a click goes to it. */
export function AccountRail({ active, onPick }: { active: string; onPick: (id: string) => void }) {
  return (
    <nav className={cn(PHONE_V2 && "max-lg:hidden", "sticky top-0 z-20 -mx-5 mb-8 overflow-x-auto overscroll-x-contain border-b border-border bg-background/95 px-5 py-3 scrollbar-slim sm:-mx-8 sm:px-8 lg:top-10 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none")}>
      <ul className="flex gap-2 lg:flex-col lg:gap-1">
        {SECTIONS.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              onClick={() => onPick(s.id)}
              className={cn("relative block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors", active === s.id ? "text-foreground" : "text-ink-soft hover:text-foreground")}
            >
              {active === s.id && <motion.span layoutId="profile-nav-pill" className="absolute inset-0 rounded-full bg-secondary" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              <span className="relative">{s.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
