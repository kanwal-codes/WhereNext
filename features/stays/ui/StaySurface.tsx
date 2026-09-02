"use client";

import { useState } from "react";
import { BedDouble, Loader2, MapPin, Star } from "lucide-react";

type Option = {
  hotelId: string;
  name: string;
  address: string | null;
  city: string | null;
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
  thumbnail: string | null;
  nightlyAmount: number;
  totalAmount: number;
  currency: string;
  boardName: string;
  refundable: boolean;
};

type Result = {
  location: string;
  checkin: string;
  checkout: string;
  assumedDates: boolean;
  nights: number;
  options: Option[];
  freshness?: { retrievedAt: string };
};

const mapUrl = (name: string, city: string | null) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, city].filter(Boolean).join(" "))}`;

export function StaySurface({ tripId, destination }: { tripId: string; destination: string }) {
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    setStatus("");
    try {
      const qs = new URLSearchParams();
      if (checkin) qs.set("checkin", checkin);
      if (checkout) qs.set("checkout", checkout);
      const response = await fetch(`/api/trips/${tripId}/stays${qs.toString() ? `?${qs}` : ""}`);
      const body = await response.json();
      if (!response.ok) {
        setResult(null);
        setStatus(body.error ?? "Stay search is unavailable right now.");
        return;
      }
      setResult(body as Result);
      setStatus((body.options ?? []).length === 0 ? "No bookable stays came back for those dates." : "");
    } catch {
      setResult(null);
      setStatus("Stay search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  const field = "mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/25";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <p className="eyebrow">Live nightly rates</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Real availability near {destination || "your destination"} from LiteAPI. Leave dates blank for an
          example 3-night stay about six weeks out.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Check-in
            <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium">
            Check-out
            <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} className={field} />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />}
          Find places to stay
        </button>
        {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
      </div>

      {result && result.options.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {result.nights} night{result.nights > 1 ? "s" : ""} · {result.checkin} → {result.checkout}
            {result.assumedDates ? " · example dates" : ""}
            {result.freshness ? ` · checked ${new Date(result.freshness.retrievedAt).toLocaleTimeString()}` : ""}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.options.map((o) => (
              <li key={o.hotelId} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                {o.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
                  <img src={o.thumbnail} alt={o.name} loading="lazy" width={480} height={200} className="h-36 w-full object-cover" />
                ) : (
                  <div className="grid h-36 w-full place-items-center bg-muted/50">
                    <BedDouble className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-sm font-medium">{o.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {typeof o.stars === "number" && <span>{o.stars}★</span>}
                    {typeof o.rating === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current text-coral" />
                        {o.rating}/10{o.reviewCount ? ` (${o.reviewCount.toLocaleString()})` : ""}
                      </span>
                    )}
                    {o.boardName && <span>{o.boardName}</span>}
                    {o.refundable && <span className="text-leaf">refundable</span>}
                  </p>
                  {o.address && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {o.address}
                    </p>
                  )}
                  <div className="mt-auto flex items-end justify-between pt-3">
                    <span className="text-sm font-semibold tabular-nums">
                      {o.nightlyAmount} {o.currency}
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        /night · {o.totalAmount} {o.currency} total
                      </span>
                    </span>
                    <a href={mapUrl(o.name, o.city)} target="_blank" rel="noreferrer noopener" className="text-xs font-medium text-coral">
                      Map
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Rates from LiteAPI — taxes/fees may be extra; confirm availability at booking.
          </p>
        </>
      )}
    </div>
  );
}
