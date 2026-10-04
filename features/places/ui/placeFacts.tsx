import { Star } from "lucide-react";
import type { Fact } from "@/components/DetailKit";

/** Rating, price and "right now" as the headline facts of a place, each with the small detail that makes the number legible. */
export function placeFacts({ rating, ratingCount, price, openNow, todayHours }: { rating?: number; ratingCount?: number; price?: string; openNow?: boolean; todayHours?: string | null }): Array<Fact | null | false | undefined | ""> {
  const dollars = price && /^\$+$/.test(price) && price.length < 4 ? { on: price, off: "$".repeat(4 - price.length) } : null;
  return [
    typeof rating === "number" && {
      label: "Rating",
      value: (
        <>
          <Star className="size-[1.1rem] fill-current text-coral" aria-hidden /> {rating.toFixed(1)}
        </>
      ),
      note: (
        <>
          <span role="img" aria-label={`${rating.toFixed(1)} out of 5`} className="block h-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-gradient-to-r from-coral/70 to-coral" style={{ width: `${Math.min(100, Math.max(0, (rating / 5) * 100))}%` }} />
          </span>
          {ratingCount ? <span className="mt-2 block">{ratingCount.toLocaleString()} reviews</span> : null}
        </>
      ),
    },
    price && {
      label: "Price",
      value: dollars ? (
        <span aria-label={`${price} out of $$$$`}>
          {dollars.on}
          <span aria-hidden className="text-border">{dollars.off}</span>
        </span>
      ) : (
        price
      ),
      note: price === "Free" ? undefined : "per person",
    },
    typeof openNow === "boolean" && {
      label: "Right now",
      tone: openNow ? "positive" : undefined,
      value: (
        <>
          <span aria-hidden className="relative mr-0.5 grid size-2.5 shrink-0 place-items-center">
            {openNow && <span className="absolute inline-flex size-full rounded-full bg-positive opacity-50 motion-safe:animate-ping" />}
            <span className={`relative inline-flex size-2.5 rounded-full ${openNow ? "bg-positive" : "bg-muted-foreground/50"}`} />
          </span>
          {openNow ? "Open" : "Closed"}
        </>
      ),
      note: todayHours?.replace(/ /g, "\u00a0"), // one line: "9:00 PM" never splits
    },
  ];
}
