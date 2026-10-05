"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Reveal } from "./motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  switcher,
  back,
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
}) {
  // The section name is the browser tab title only; the page itself carries just the editorial title.
  const titleTag = useDocumentTitle(eyebrow);
  return (
    <>
      {titleTag}
      {/* A title sequence: the rail, then the title, then the line under it, each a beat after the last.
          The rail is one fixed 40px row on every page (way back left, switch centred) — the same row Roam's own
          header uses — so the title starts at the same height wherever you are and the pill never jumps. */}
      <header className="border-b border-border pb-7">
        <Reveal y={8}>
          <div className="grid min-h-10 items-center gap-x-3 gap-y-3 sm:grid-cols-[1fr_auto_1fr]">
            {back ? (
              <Link href={back.href} className="group inline-flex items-center gap-1.5 justify-self-start text-xs text-muted-foreground transition-colors hover:text-foreground">
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
        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <Reveal delay={0.07} y={12}>
              <h1 className="font-display text-4xl leading-[1.04] font-medium tracking-[-0.03em] text-balance sm:text-5xl">{title}</h1>
            </Reveal>
            {description && (
              <Reveal delay={0.14} y={10}>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft text-pretty">
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
