import { ExternalLink } from "@/components/ExternalLink";

/**
 * The small "where this data came from" attribution at the foot of a detail view's facts: one quiet line,
 * the same everywhere, rather than a box of its own.
 */
export function SourceCard({ provider, href, linkLabel = "Open map" }: { provider: string; href?: string | null; linkLabel?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>Source: {provider}</span>
      {href && <ExternalLink href={href} className="text-xs">{linkLabel}</ExternalLink>}
    </p>
  );
}
