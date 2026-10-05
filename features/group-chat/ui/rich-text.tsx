import React from "react";
import { safeHref } from "@/lib/utils";

/** Colours the "@Roam" token and turns web addresses into links, so a pasted listing or reservation page opens in one tap. */
export function renderRich(content: string) {
  return content.split(/(@roam\b|https?:\/\/[^\s<]+)/gi).map((part, index) => {
    if (/^@roam$/i.test(part)) return <span key={index} className="font-semibold text-coral">{part}</span>;
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
