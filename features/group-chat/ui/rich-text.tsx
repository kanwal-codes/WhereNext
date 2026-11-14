import React from "react";
import { safeHref } from "@/lib/utils";

/** The people a message may point at, ready for `renderRich`: the pattern that finds "@Name" and whose name is whose. */
export type MentionLookup = { pattern: string | null; youName: string | null };

/** Colours the "@Roam" token and any "@Name" of someone on the trip (yours stands out more), and turns web addresses into links, so a pasted listing or reservation page opens in one tap. */
export function renderRich(content: string, mentions?: MentionLookup, onDark = false) {
  // Coral-ink is dark: on your own (dark) bubble it is hard to read, so there the highlight is the light coral.
  const accent = onDark ? "font-semibold text-coral-soft" : "font-semibold text-coral-ink";
  const split = new RegExp(`(@roam\\b|${mentions?.pattern ? `${mentions.pattern}|` : ""}https?:\\/\\/[^\\s<]+)`, "giu");
  return content.split(split).map((part, index) => {
    if (/^@roam$/i.test(part)) return <span key={index} className={accent}>{part}</span>;
    if (part.startsWith("@") && mentions?.pattern) {
      const you = mentions.youName !== null && part.slice(1).toLowerCase() === mentions.youName.toLowerCase();
      return <span key={index} className={you ? "rounded-md bg-coral-soft px-1 font-semibold text-coral-ink" : accent}>{part}</span>;
    }
    if (/^https?:\/\//i.test(part)) {
      // A closing bracket or full stop at the end belongs to the sentence, not the address.
      const url = part.replace(/[.,;:!?)\]]+$/, "");
      const rest = part.slice(url.length);
      const href = safeHref(url);
      if (!href) return <span key={index}>{part}</span>;
      const shown = url.replace(/^https?:\/\/(www\.)?/i, "");
      return (
        <span key={index}>
          <a href={href} target="_blank" rel="noopener noreferrer" title={url} className="break-all underline decoration-current/40 underline-offset-2 transition-colors hover:decoration-current">{shown.length > 44 ? `${shown.slice(0, 43)}…` : shown}</a>
          {rest}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
