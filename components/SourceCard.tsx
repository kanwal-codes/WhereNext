import { ExternalLink } from "@/components/ExternalLink";

/**
 * The small "where this data came from" attribution used at the bottom of a detail view's
 * facts (a place's address, an event's venue) — one consistent treatment instead of each
 * detail view inventing its own (a dashed card here, a bare text link there).
 */
export function SourceCard({ provider, href, linkLabel = "Open map" }: { provider: string; href?: string | null; linkLabel?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Source</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{provider}</span>
        {href && <ExternalLink href={href} className="text-xs">{linkLabel}</ExternalLink>}
      </div>
    </div>
  );
}
