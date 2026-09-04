"use client";

import type { ReactNode } from "react";
import { Reveal } from "./motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  // The section name (eyebrow) is the tab title; the editorial title stays on the page.
  const titleTag = useDocumentTitle(eyebrow);
  return (
    <>
      {titleTag}
      <Reveal>
      <header className="grid gap-4 border-b border-border pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl leading-tight sm:text-[2.15rem]">{title}</h1>
          {description && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && <div className="min-w-0 sm:justify-self-end">{action}</div>}
      </header>
      </Reveal>
    </>
  );
}
