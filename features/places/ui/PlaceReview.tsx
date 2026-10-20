"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import type { GoogleReview } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

export function ReviewFigure({ r }: { r: GoogleReview }) {
  const [open, setOpen] = useState(false);
  const text = r.text?.text || r.originalText?.text || "";
  const long = text.length > 260;
  const author = r.authorAttribution?.displayName ?? "Google user";
  return (
    <figure className="rounded-2xl border border-border bg-card p-4">
      <figcaption className="flex items-center gap-3">
        <span className="daisy-avatar daisy-avatar-placeholder" aria-hidden>
          <span className="grid size-9 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground">{author.charAt(0).toUpperCase()}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{author}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {typeof r.rating === "number" && (
              <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${Math.round(r.rating)} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} aria-hidden className={`size-3 ${s < Math.round(r.rating!) ? "fill-current text-coral" : "text-border"}`} />
                ))}
              </span>
            )}
            {r.relativePublishTimeDescription && <span>{r.relativePublishTimeDescription}</span>}
          </span>
        </span>
      </figcaption>
      <blockquote className={cn("mt-3 text-sm leading-relaxed text-ink-soft", !open && "line-clamp-5")}>{text}</blockquote>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn(textAction, "mt-2 underline")}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </figure>
  );
}
