import React, { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one treatment for a link that leaves the app. */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn("inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline", className)}
    >
      {children} <ArrowUpRight className="h-3 w-3 shrink-0" />
    </a>
  );
}
