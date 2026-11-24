"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, MapPin, Phone, Star } from "lucide-react";
import { ListingAsk } from "@/components/ListingAsk";
import { Sheet } from "@/components/motion-primitives";
import { SheetHeader } from "@/components/SheetHeader";
import { Skeleton } from "@/components/Skeleton";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { cachedGet } from "@/lib/client/cached-get";
import { formatMoney } from "@/lib/currency";
import type { StayDetails, StayPriceSource, StayRoom } from "@/packages/contracts/stay";

type Body = { hotel: StayDetails | null; rooms: StayRoom[] | null; sources?: StayPriceSource[]; phone?: string | null; website?: string | null; nights: number; currency: string };
type Pick = { hotelId: string; name: string; checkin: string; checkout: string; adults: number; rooms: number; location: string };

/** What the open hotel says about itself, in the shape the listing chat reads, so a question is answered from its rating, address, description and cheapest price. */
function stayItem(pick: Pick, hotel: StayDetails | null | undefined, body: Body | null, money: (n: number) => string) {
  const nightly = body?.sources?.length ? Math.min(...body.sources.map((s) => s.nightly)) : body?.rooms?.length ? Math.min(...body.rooms.map((r) => r.nightlyAmount)) : null;
  return {
    name: pick.name,
    detail: ["Hotel", hotel?.stars != null ? `${hotel.stars}-star` : null, pick.checkin && pick.checkout ? `${pick.checkin} to ${pick.checkout}` : null].filter(Boolean).join(", ").slice(0, 200),
    ...(nightly != null ? { price: `from ${money(nightly)} per night` } : {}),
    ...(hotel?.rating != null ? { rating: `${hotel.rating.toFixed(1)}/10${hotel.reviewCount ? ` from ${hotel.reviewCount.toLocaleString("en-US")} reviews` : ""}` } : {}),
    ...(hotel?.address || hotel?.city ? { address: [hotel.address, hotel.city].filter(Boolean).join(", ").slice(0, 200) } : {}),
    ...(hotel?.description ? { summary: hotel.description.slice(0, 700) } : {}),
    ...(hotel?.latitude != null && hotel.longitude != null ? { lat: hotel.latitude, lng: hotel.longitude } : {}),
  };
}

/**
 * One hotel, for someone with no trip: its photo, what it is, and where to book it (the sites that sell it, cheapest first, or the hotel's
 * own phone and website). Nothing here is saved; a trip's stay page has the fuller view.
 */
export function StandaloneStaySheet({ pick, onClose }: { pick: Pick | null; onClose: () => void }) {
  const [state, setState] = useState<{ key: string; body: Body | null; failed: boolean }>({ key: "", body: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  const key = pick ? `${pick.hotelId}|${pick.checkin}|${pick.checkout}|${pick.adults}|${pick.rooms}|${attempt}` : "";
  useEffect(() => {
    if (!pick) return;
    const controller = new AbortController();
    const qs = new URLSearchParams({ adults: String(pick.adults), rooms: String(pick.rooms), location: pick.location });
    if (pick.checkin) qs.set("checkin", pick.checkin);
    if (pick.checkout) qs.set("checkout", pick.checkout);
    cachedGet(`/api/stays/${encodeURIComponent(pick.hotelId)}?${qs}`, { signal: controller.signal, ttlMs: attempt ? 0 : undefined })
      .then((r) => (r.ok ? (r.json() as Promise<Body>) : Promise.reject(new Error("failed"))))
      .then((body) => setState({ key, body, failed: false }), () => { if (!controller.signal.aborted) setState({ key, body: null, failed: true }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the pick and the attempt
  }, [key]);
  const ready = state.key === key;
  const body = ready ? state.body : null;
  const hotel = body?.hotel;
  const money = (n: number) => formatMoney(n, body?.currency ?? "CAD");
  const photo = hotel?.images?.[0];
  return (
    <Sheet open={Boolean(pick)} onClose={onClose} side="bottom" ariaLabel={pick ? `${pick.name}: details` : "Stay details"} className="icons-fine lg:max-w-lg">
      <SheetHeader title={pick?.name ?? "Stay"} onClose={onClose} bordered={false} />
      {pick ? (
        // The ask box a trip's stay panel has: what is asked is answered from this hotel's own details and prices.
        <ListingAsk key={pick.hotelId} panel={{ kind: "stay", hotelId: pick.hotelId, name: pick.name }} subjectKey={`stay:${pick.hotelId}`} placeholder="Ask about this hotel — is it worth it?" className="px-4" items={() => [stayItem(pick, hotel, body, money)]}>
        {!ready ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="aspect-[16/10] rounded-3xl" /><Skeleton className="h-5 w-2/3 rounded-full" /><Skeleton className="h-16 rounded-2xl" /></div>
        ) : state.failed || !hotel ? (
          <StateMessage icon={AlertCircle} title="We couldn’t load this stay" actions={<button type="button" onClick={() => setAttempt((n) => n + 1)} className={stateButton.primary}>Try again</button>}>
            {typeof navigator !== "undefined" && navigator.onLine === false ? "Reconnect and the details will load." : "The problem is on our end, not with your search."}
          </StateMessage>
        ) : (
          <div className="space-y-5">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element -- a provider photo, shown once at card size
              <img src={photo} alt="" className="aspect-[16/10] w-full rounded-3xl object-cover" />
            )}
            <div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-soft">
                {hotel.rating != null && <span className="inline-flex items-center gap-1 font-medium text-foreground"><Star className="size-3.5 fill-coral text-coral" aria-hidden />{hotel.rating.toFixed(1)}</span>}
                {hotel.reviewCount != null && <span>{hotel.reviewCount.toLocaleString()} reviews</span>}
                {hotel.stars != null && <span>· {hotel.stars}-star</span>}
              </p>
              {(hotel.address || hotel.city) && <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-soft"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{[hotel.address, hotel.city].filter(Boolean).join(", ")}</p>}
            </div>
            {hotel.description && <p className="text-body leading-relaxed text-pretty">{hotel.description}</p>}
            {body && body.sources && body.sources.length > 0 ? (
              <section aria-label="Where to book">
                <h3 className="text-sm font-semibold">Where to book</h3>
                <ul className="mt-2.5 grid gap-2">
                  {body.sources.map((s) => (
                    <li key={s.source}>
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 transition-transform active:scale-[0.985]">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{s.source}</span>
                          {(s.official || s.freeCancellation) && <span className="block truncate text-sm text-ink-soft">{[s.official ? "Hotel’s own site" : null, s.freeCancellation ? `Free cancellation${s.cancelUntil ? ` until ${s.cancelUntil}` : ""}` : null].filter(Boolean).join(" · ")}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-right"><span><span className="block font-display text-lg font-medium tabular-nums">{money(s.nightly)}</span><span className="block text-xs text-muted-foreground">per night</span></span><ExternalLink className="size-4 text-muted-foreground" aria-hidden /></span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : body?.rooms && body.rooms.length > 0 ? (
              <section aria-label="Rooms">
                <h3 className="text-sm font-semibold">Rooms for your dates</h3>
                <ul className="mt-2.5 grid gap-2">
                  {body.rooms.slice(0, 5).map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"><span className="min-w-0 truncate font-medium">{r.name}</span><span className="shrink-0 font-display text-lg font-medium tabular-nums">{money(r.nightlyAmount)}<span className="ml-1 text-xs font-normal text-muted-foreground">per night</span></span></li>
                  ))}
                </ul>
              </section>
            ) : null}
            {(body?.website || body?.phone) && (
              <div className="flex flex-wrap gap-2">
                {body.website && <a href={body.website} target="_blank" rel="noopener noreferrer" className={stateButton.secondary}><ExternalLink className="mr-1.5 size-4" aria-hidden />Hotel website</a>}
                {body.phone && <a href={`tel:${body.phone}`} className={stateButton.secondary}><Phone className="mr-1.5 size-4" aria-hidden />Call {body.phone}</a>}
              </div>
            )}
          </div>
        )}
        </ListingAsk>
      ) : <div className="min-h-0 flex-1" />}
    </Sheet>
  );
}
