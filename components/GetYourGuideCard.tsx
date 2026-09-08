import { ArrowUpRight, Compass } from "lucide-react";
import { getYourGuideHref } from "@/lib/places-ui";

/**
 * Affiliate deep-link into GetYourGuide's search results — not a live booking widget,
 * just an outbound link tagged with our partner_id. Renders nothing until the affiliate
 * signup is done and NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID is set.
 */
export function GetYourGuideCard({ query, label }: { query: string; label: string }) {
  const href = getYourGuideHref(query);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-accent"
    >
      <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>
        <span className="eyebrow">Guided tours &amp; activities</span>
        <span className="mt-1 flex items-center gap-1 text-sm leading-[1.75]">
          {label} <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
      </span>
    </a>
  );
}
