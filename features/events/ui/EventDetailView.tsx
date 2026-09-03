"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Info, MapPin, Ticket, Users } from "lucide-react";
import type { EventDetail } from "@/packages/contracts/event";
import { Hero } from "@/components/Hero";
import { BackLink } from "@/components/BackLink";
import { ExternalLink } from "@/components/ExternalLink";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { Reveal } from "@/components/motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

type Seed = { name: string; url: string; source: string; imageUrl?: string; date?: string; venue?: string };

/** Full detail for one event — same layout on the routed page and the chat side panel. */
export function EventDetailView({ tripId, seed, variant = "page" }: { tripId: string; seed: Seed; variant?: "page" | "panel" }) {
  const panel = variant === "panel";
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const titleTag = useDocumentTitle(panel ? null : detail?.title ?? seed.name);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    const q = new URLSearchParams({ name: seed.name, url: seed.url, source: seed.source });
    if (seed.imageUrl) q.set("img", seed.imageUrl);
    if (seed.date) q.set("date", seed.date);
    if (seed.venue) q.set("venue", seed.venue);
    fetch(`/api/trips/${tripId}/events/detail?${q.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("detail"))))
      .then((body) => {
        setDetail(body.detail ?? null);
        setState(body.detail ? "ready" : "error");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [tripId, seed.name, seed.url, seed.source, seed.imageUrl, seed.date, seed.venue]);

  const pad = panel ? "px-4 pb-8" : "mx-auto max-w-3xl px-5 pb-14 sm:px-8";
  const d = detail;
  const title = d?.title ?? seed.name;
  const image = d?.imageUrl ?? seed.imageUrl;
  const date = d?.date ?? seed.date;
  const venueName = d?.venueName ?? seed.venue;
  const ticketUrl = d?.url ?? seed.url;
  const mapsUrl = d?.latitude && d?.longitude ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}` : null;

  const facts: Array<[string, string]> = [];
  if (d?.genre) facts.push(["Type", d.genre]);
  if (d?.priceRange) facts.push(["Price range", d.priceRange]);
  if (d?.onSale) facts.push(["Tickets", d.onSale]);
  if (d?.status) facts.push(["Status", d.status]);
  if (d?.promoter) facts.push(["Promoter", d.promoter]);

  return (
    <div>
      {titleTag}
      <Hero image={image || "/design/trip-hero.jpg"} alt={title} plain className={cn(panel ? "h-44" : "h-[38vh] min-h-[240px] sm:h-[44vh] sm:max-h-[400px]")}>
        <div className={cn("absolute inset-x-0 bottom-0", pad, "pb-5")}>
          {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" />}
          <p className="eyebrow mt-2">{d?.source ?? seed.source}</p>
          <h1 className="mt-1 font-display text-2xl leading-tight sm:text-[1.75rem]">{title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> {date}
              </span>
            )}
            {venueName && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {venueName}
              </span>
            )}
          </p>
        </div>
      </Hero>

      <div className={cn(pad, "pt-6 space-y-8")}>
        {state === "loading" ? (
          <>
            <Skeleton className="h-3 w-24 rounded-md" />
            <SkeletonLines lines={4} />
          </>
        ) : state === "error" && !d ? (
          <p className="text-sm text-muted-foreground">
            We couldn&rsquo;t load more about this event.{" "}
            {ticketUrl && (
              <ExternalLink href={ticketUrl} className="text-sm">
                Open the event page
              </ExternalLink>
            )}
          </p>
        ) : (
          <>
            <Reveal>
              <section>
                <h2 className="font-display text-xl">About</h2>
                {d?.about ? (
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.8] text-ink-soft">{d.about}</p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No description was available for this event.</p>
                )}
              </section>
            </Reveal>

            {d && d.performers.length > 0 && (
              <Reveal delay={0.04}>
                <section>
                  <h2 className="flex items-center gap-2 font-display text-lg">
                    <Users className="h-4 w-4 text-coral" /> Line-up
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {d.performers.map((p) => (
                      <span key={p} className="rounded-full border border-border bg-card px-3 py-1 text-sm">
                        {p}
                      </span>
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            <Reveal delay={0.06}>
              <section>
                <h2 className="flex items-center gap-2 font-display text-lg">
                  <MapPin className="h-4 w-4 text-coral" /> When &amp; where
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  {date && (
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">Date</dt>
                      <dd>{date}</dd>
                    </div>
                  )}
                  {(venueName || d?.venueAddress) && (
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">Venue</dt>
                      <dd>
                        {venueName}
                        {d?.venueAddress ? <span className="block text-muted-foreground">{d.venueAddress}</span> : null}
                        {mapsUrl && (
                          <ExternalLink href={mapsUrl} className="mt-1 inline-block text-sm">
                            Open in Google Maps
                          </ExternalLink>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            </Reveal>

            {facts.length > 0 && (
              <Reveal delay={0.08}>
                <section className="rounded-2xl border border-border bg-card p-5">
                  <p className="eyebrow">Good to know</p>
                  <dl className="mt-2 space-y-2 text-sm">
                    {facts.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                        <dd className="min-w-0">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {d?.pleaseNote && (
                    <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.pleaseNote}
                    </p>
                  )}
                </section>
              </Reveal>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {ticketUrl && (
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
                >
                  <Ticket className="h-4 w-4" /> Get tickets on {d?.source ?? seed.source}
                </a>
              )}
              <Link href={askAssistantHref(tripId, { name: title, address: venueName ?? undefined })} className="btn-secondary">
                Ask the assistant if it fits
              </Link>
            </div>

            {d && d.sources.length > 0 && (
              <div className="rounded-2xl border border-dashed border-border p-5">
                <p className="eyebrow">Where this came from</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {d.sources.map((s) => (
                    <li key={s.url}>
                      <ExternalLink href={s.url} className="text-sm">
                        {s.title}
                      </ExternalLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">Confirm the date, line-up, price and availability on the ticket page.</p>
          </>
        )}
      </div>
    </div>
  );
}
