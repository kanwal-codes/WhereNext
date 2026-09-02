"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BedDouble, Check, Loader2, MapPin, Star } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { readStayDecision, type StayOption } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";

type Result = {
  location: string;
  checkin: string;
  checkout: string;
  assumedDates: boolean;
  nights: number;
  options: StayOption[];
  freshness?: { retrievedAt: string };
};

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function StaySurface({ tripId, destination }: { tripId: string; destination: string }) {
  const { data } = useTripData();
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);

  const [checkin, setCheckin] = useState(lockedStay?.checkin ?? "");
  const [checkout, setCheckout] = useState(lockedStay?.checkout ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(6);

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
      setVisible(6);
      setStatus((body.options ?? []).length === 0 ? "No bookable stays came back for those dates." : "");
    } catch {
      setResult(null);
      setStatus("Stay search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  const detailHref = (hotelId: string, ci: string, co: string) =>
    `/trips/${tripId}/stay/${encodeURIComponent(hotelId)}?checkin=${ci}&checkout=${co}`;
  const field = "input-field";

  return (
    <div className="space-y-5">
      {lockedStay && (
        <Link
          href={detailHref(lockedStay.hotelId, lockedStay.checkin, lockedStay.checkout)}
          className="flex gap-4 rounded-2xl border border-leaf/30 bg-leaf-soft/40 p-4 transition-colors hover:bg-leaf-soft/60"
        >
          {lockedStay.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
            <img src={lockedStay.thumbnail} alt={lockedStay.hotelName} width={96} height={96} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-muted">
              <BedDouble className="h-5 w-5 text-muted-foreground/50" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="eyebrow inline-flex items-center gap-1 text-leaf">
              <Check className="h-3 w-3" /> Your stay
            </p>
            <p className="mt-1 truncate font-display text-lg">{lockedStay.hotelName}</p>
            <p className="truncate text-sm text-ink-soft">{lockedStay.roomName}{lockedStay.board ? ` · ${lockedStay.board}` : ""}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtDay(lockedStay.checkin)} → {fmtDay(lockedStay.checkout)} · {lockedStay.nights} night{lockedStay.nights === 1 ? "" : "s"} ·{" "}
              <span className="font-medium text-foreground tabular-nums">{lockedStay.totalAmount} {lockedStay.currency}</span> total
            </p>
          </div>
          <span className="hidden shrink-0 self-center text-xs font-medium text-primary sm:inline-flex sm:items-center sm:gap-1">
            Change <ArrowUpRight className="h-3 w-3" />
          </span>
        </Link>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <p className="eyebrow">Live nightly rates</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Real availability near {destination || "your destination"}. Leave dates blank for an example 3-night stay about six
          weeks out.
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
          className="btn-primary mt-4"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />}
          Find places to stay
        </button>
        {status && <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>}
      </div>

      {result && result.options.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {result.nights} night{result.nights > 1 ? "s" : ""} · {fmtDay(result.checkin)} → {fmtDay(result.checkout)}
            {result.assumedDates ? " · example dates" : ""}
            {result.freshness ? ` · checked ${new Date(result.freshness.retrievedAt).toLocaleTimeString()}` : ""}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.options.slice(0, visible).map((o) => {
              const locked = lockedStay?.hotelId === o.hotelId;
              return (
                <li key={o.hotelId} className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft", locked ? "border-leaf/40" : "border-border")}>
                  <Link href={detailHref(o.hotelId, result.checkin, result.checkout)} className="block transition-opacity hover:opacity-95">
                    {o.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
                      <img src={o.thumbnail} alt={o.name} loading="lazy" width={480} height={200} className="h-36 w-full object-cover" />
                    ) : (
                      <div className="grid h-36 w-full place-items-center bg-muted/50">
                        <BedDouble className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{o.name}</p>
                      {locked && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-medium text-leaf">
                          <Check className="h-3 w-3" /> Locked
                        </span>
                      )}
                    </div>
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
                      <Link href={detailHref(o.hotelId, result.checkin, result.checkout)} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        Rooms &amp; details <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {visible < result.options.length && (
            <button type="button" onClick={() => setVisible((v) => v + 6)} className="btn-secondary w-full">
              Show more stays ({result.options.length - visible} left)
            </button>
          )}
          <p className="text-xs text-muted-foreground">Rates from LiteAPI — taxes/fees may be extra; confirm availability at booking.</p>
        </>
      )}
    </div>
  );
}
