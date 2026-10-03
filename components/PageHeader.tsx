"use client";

import type { ReactNode } from "react";
import { Reveal } from "./motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  hideEyebrow = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Skip the "SECTION" label above the title — for a page whose tab pill above it already says so. */
  hideEyebrow?: boolean;
}) {
  // The section name (eyebrow) is the tab title; the editorial title stays on the page.
  const titleTag = useDocumentTitle(eyebrow);
  return (
    <>
      {titleTag}
      {/* A title sequence: the label, then the title, then the line under it, each a beat after the last. */}
      <header className="grid gap-4 border-b border-border pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          {!hideEyebrow && (
            <Reveal y={8}>
              <p className="eyebrow flex items-center gap-2">
                <span aria-hidden className="size-1 rounded-full bg-coral" />
                {eyebrow}
              </p>
            </Reveal>
          )}
          <Reveal delay={0.07} y={12}>
            <h1 className="mt-2.5 font-display text-4xl leading-[1.04] font-medium tracking-[-0.03em] text-balance sm:text-5xl">{title}</h1>
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
      </header>
    </>
  );
}
