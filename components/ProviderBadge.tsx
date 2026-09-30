import { cn } from "@/lib/utils";

/** Human label for each source we surface. `web` / anything unknown gets a neutral dot. */
const BRAND: Record<string, string> = {
  ticketmaster: "Ticketmaster",
  eventbrite: "Eventbrite",
  eventbriteapi: "Eventbrite",
  seatgeek: "SeatGeek",
  vividseats: "Vivid Seats",
  axs: "AXS",
  dice: "DICE",
  "dice.fm": "DICE",
  universe: "Universe",
  showclix: "ShowClix",
};

const ICON_SLUG = new Set(["ticketmaster", "eventbrite", "eventbriteapi"]);

/**
 * A "where this came from" chip: a near-black pill, off-white text, and the provider's real
 * favicon (same-origin proxied). One treatment everywhere a source label appears.
 */
export function ProviderBadge({
  source,
  size = "sm",
  className,
}: {
  source: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const key = source.toLowerCase();
  if (key === "web") return null;
  const label = BRAND[key] ?? (source ? source[0].toUpperCase() + source.slice(1) : "Web");
  const hasIcon = ICON_SLUG.has(key);
  const dims = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-foreground font-medium text-background",
        size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      {hasIcon ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny same-origin favicon proxy
        <img src={`/api/brand-icon/${key}`} alt="" width={16} height={16} className={cn(dims, "rounded-[3px] object-contain")} />
      ) : (
        <span className={cn(dims, "rounded-full bg-background/70")} />
      )}
      {label}
    </span>
  );
}
