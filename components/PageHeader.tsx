"use client";

import React from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Reveal } from "./motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";
import { cn } from "@/lib/utils";
import { PHONE_V2 } from "@/lib/phone-v2";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  switcher,
  back,
  phoneQuietTitle,
}: {
  /** The section name: the browser tab title. It is not printed on the page. */
  eyebrow: string;
  title: string;
  description?: string;
  /** Sits beside the title, bottom-aligned: a button or a stats strip. */
  action?: ReactNode;
  /** A pill switch between views of this page. Centred in the rail, exactly where Roam centres its own. */
  switcher?: ReactNode;
  /** A sub-page: the way back sits at the left of the rail. */
  back?: { href: string; label: string };
  /** Phone redesign: below lg the title is for screen readers only (the page opens on its controls, not a heading). */
  phoneQuietTitle?: boolean;
}) {
  const quiet = PHONE_V2 && phoneQuietTitle;
  // The section name is the browser tab title only; the page itself carries just the editorial title.
  const titleTag = useDocumentTitle(eyebrow);
  return (
    <>
      {titleTag}
      {/* A title sequence: the rail, then the title, then the line under it, each a beat after the last.
          The rail is one fixed 40px row on every page (way back left, switch centred) — the same row Roam's own
          header uses — so the title starts at the same height wherever you are and the pill never jumps. */}
      <header className={cn("border-b border-border pb-5 sm:pb-7", quiet && "max-lg:border-b-0 max-lg:pb-0")}>
        <Reveal y={8}>
          {/* On a phone a page with nothing for the rail (no way back, no switch) has no rail at all: its title sits right under the top bar. */}
          <div className={cn("grid min-h-10 items-center gap-x-3 gap-y-3 sm:grid-cols-[1fr_auto_1fr]", !back && !switcher && "max-sm:hidden")}>
            {back ? (
              <Link href={back.href} className="group inline-flex items-center gap-1.5 justify-self-start py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-[220ms] ease-out group-hover:-translate-x-0.5" /> {back.label}
              </Link>
            ) : (
              // No section label: the pill (or the title) is the page's heading. The empty first column keeps a pill centred.
              <span aria-hidden className="max-sm:hidden" />
            )}
            {switcher ? <div className="justify-self-center">{switcher}</div> : <span className="max-sm:hidden" />}
            <span className="max-sm:hidden" />
          </div>
        </Reveal>
        <div className={cn("mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end", !back && !switcher && "max-sm:mt-0")}>
          <div className={cn("min-w-0", quiet && "max-lg:sr-only")}>
            <Reveal delay={0.07} y={12}>
              {/* Full size from `sm` up (tablet and desktop) is unchanged — the big, tight, single-breath
                  headline the brand wants. Under it, every one of these titles wrapped to two lines at that
                  size and ran the whole page into a landing-page-style block before any real content showed;
                  a phone gets a genuinely smaller, looser-set size instead of a shrunk copy of the same one. */}
              <h1 className="font-display text-2xl leading-[1.2] font-medium tracking-[-0.015em] text-balance sm:text-5xl sm:leading-[1.04] sm:tracking-[-0.03em]">{title}</h1>
            </Reveal>
            {description && (
              <Reveal delay={0.14} y={10}>
                <p className="mt-2 max-w-2xl text-sm leading-snug text-ink-soft text-pretty sm:mt-3 sm:text-base sm:leading-relaxed">
                  {description}
                </p>
              </Reveal>
            )}
          </div>
          {action && (
            <Reveal delay={0.2} y={8}>
              <div className="min-w-0 sm:justify-self-end">{action}</div>
            </Reveal>
          )}
        </div>
      </header>
    </>
  );
}
