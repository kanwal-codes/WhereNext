import React, { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn, safeHref } from "@/lib/utils";

/** The one treatment for a link that leaves the app. */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={safeHref(href)}
      target="_blank"
      rel="noreferrer noopener"
      className={cn("relative inline-flex items-start gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']", className)}
    >
      {children} <ArrowUpRight className="mt-[0.22em] size-3 shrink-0" aria-hidden />
    </a>
  );
}
