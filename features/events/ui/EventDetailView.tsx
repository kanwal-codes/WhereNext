"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, ChevronDown, DoorOpen, Info, Loader2, MapPin, Music, Sparkles, Ticket, Users } from "lucide-react";
import type { EventDetail } from "@/packages/contracts/event";
import { Hero } from "@/components/Hero";
import { BackLink } from "@/components/BackLink";
import { ProviderBadge } from "@/components/ProviderBadge";
import { ExternalLink } from "@/components/ExternalLink";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { BlurImage, Reveal, Stagger, StaggerItem, Tactile, WordReveal } from "@/components/motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import { ticketSellerLabel } from "@/lib/ticket-provider";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { mutate } from "@/lib/client/mutation-queue";
import { notifyToast } from "@/lib/application/toast";
import { extractEventDayIndex, extractEventTime } from "@/lib/application/event-schedule";

type Seed = { name: string; url: string; source: string; imageUrl?: string; date?: string; venue?: string };

/** "City, Country" from a formatted address. */
function cityFrom(address: string | undefined | null): string {
  if (!address) return "";
  return address.split(",").map((p) => p.trim()).filter(Boolean).slice(-2).join(", ");
}

/** Split a "YYYY-MM-DD HH:MM" or looser string into a friendly day + time. */
function readableDate(raw: string | null): { day: string; time: string | null } | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return { day: raw, time: null };
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" });
  const time = hh
    ? new Date(0, 0, 0, Number(hh), Number(mm)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  return { day, time };
}

function Chip({ icon: Icon, children }: { icon: typeof CalendarClock; children: React.ReactNode }) {
  return (
    <Tactile lift={1} className="inline-flex">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-soft">
        <Icon className="h-3.5 w-3.5 text-coral" />
        {children}
      </span>
    </Tactile>
  );
}

/** Section wrapper — icon, title, and consistent rhythm. `boxed` gets a card surround. */
function Section({
  title,
  icon: Icon,
  boxed = false,
  delay = 0,
  children,
}: {
  title: string;
  icon?: typeof CalendarClock;
  boxed?: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay}>
      <section className={cn(boxed && "rounded-2xl border border-border bg-card p-5 shadow-soft")}>
        <h2 className={cn("flex items-center gap-2 font-display", boxed ? "text-lg" : "text-xl")}>
          {Icon && <Icon className="h-4 w-4 text-coral" />}
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </section>
    </Reveal>
  );
}

/** Adds this event to the itinerary as a timed stop — day and time both derived from the
 * event's real schedule (Ticketmaster's embedded time, or the trip's start date), not guessed. */
function AddEventButton({ tripId, title, rawDate, showTime, latitude, longitude }: {
  tripId: string; title: string; rawDate: string | null; showTime?: string | null;
  latitude?: number | null; longitude?: number | null;
}) {
  const data = useTripDataMaybe()?.data ?? null;
  const itinerary = (data?.itinerary ?? []) as Array<{ title?: string }>;
  const tripStartDate = (data?.trip as { start_date?: string | null } | null)?.start_date;
  const alreadyAdded = itinerary.some((i) => i.title?.trim().toLowerCase() === title.trim().toLowerCase());
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy || alreadyAdded) return;
    setBusy(true);
    try {
      const time = extractEventTime(rawDate, showTime);
      const dayIndex = extractEventDayIndex(rawDate, tripStartDate) ?? 1;
      const res = await mutate("/api/commands", {
        method: "POST",
        body: {
          type: "add_itinerary_item", tripId, title, dayIndex,
          ...(time ? { time } : {}),
          ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
        },
        announce: ["itinerary"],
      });
      if (!res.ok) throw new Error();
      notifyToast(`Added to Day ${dayIndex}${time ? ` at ${new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`, "success");
    } catch {
      notifyToast(`Couldn't add ${title} to your trip. Try again.`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tactile lift={2} className="inline-flex">
      <button
        type="button"
        disabled={busy || alreadyAdded}
        onClick={() => void add()}
        className={cn("btn-primary inline-flex items-center gap-2", alreadyAdded && "opacity-70")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
        {alreadyAdded ? "Added to trip" : "Add to trip"}
      </button>
    </Tactile>
  );
}

/** Full detail for one event — same layout on the routed page and the chat side panel. */
export function EventDetailView({ tripId, seed, variant = "page" }: { tripId: string; seed: Seed; variant?: "page" | "panel" }) {
  const panel = variant === "panel";
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const titleTag = useDocumentTitle(panel ? null : detail?.title ?? seed.name);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `event-detail:v4:${tripId}:${seed.url || seed.name}`;
    try {
      const hit = sessionStorage.getItem(cacheKey);
      if (hit) {
        const body = JSON.parse(hit);
        if (body.detail) { setDetail(body.detail); setState("ready"); return () => controller.abort(); }
      }
    } catch { /* unavailable or malformed cache */ }
    setState("loading");
    const q = new URLSearchParams({ name: seed.name, url: seed.url, source: seed.source });
    if (seed.imageUrl) q.set("img", seed.imageUrl);
    if (seed.date) q.set("date", seed.date);
    if (seed.venue) q.set("venue", seed.venue);
    fetch(`/api/trips/${tripId}/events/detail?${q.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("detail"))))
      .then((body) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(body)); } catch { /* ignore */ }
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

  if (state === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading event details">
        <Skeleton className={cn("rounded-none", panel ? "h-44" : "h-[42vh] min-h-[260px] sm:h-[48vh] sm:max-h-[440px]")} />
        <div className={cn(pad, "pt-6 space-y-5")}>
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-9 w-2/3 rounded-lg" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <SkeletonLines lines={4} />
        </div>
      </div>
    );
  }

  const title = d?.title ?? seed.name;
  const image = d?.imageUrl ?? seed.imageUrl;
  const rawDate = d?.date ?? seed.date ?? null;
  const dt = readableDate(rawDate);
  const venueName = d?.venueName ?? seed.venue ?? null;
  const ticketUrl = d?.url ?? (ticketSellerLabel(seed.source, seed.url) ? seed.url : null);
  const ticketSeller = ticketSellerLabel(d?.source ?? seed.source, ticketUrl);
  const mapsUrl =
    d?.latitude && d?.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
      : venueName
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venueName} ${d?.venueAddress ?? d?.city ?? ""}`.trim())}`
        : null;

  const headliner = d?.performers?.[0];
  const support = d?.performers?.slice(1) ?? [];
  // Drop a lineup note that just echoes acts already listed as pills.
  const lineupNote =
    d?.lineupNote && !d.performers.every((p) => d.lineupNote!.toLowerCase().includes(p.toLowerCase())) ? d.lineupNote : null;
  const onSale = d?.onSale?.replace(/^on sale\s*/i, "") ?? null;
  // The route already summarises `about`; here we only tidy stray markdown heading marks,
  // a lone "Title:" prefix, and blank-line runs — no line-dropping.
  const aboutText = (d?.about ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*Title:\s*/i, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cityHint = cityFrom(d?.venueAddress) || d?.city || venueName || "";

  const goodToKnow: Array<[string, string]> = [];
  if (d?.doorsTime) goodToKnow.push(["Doors", d.doorsTime]);
  if (d?.showTime) goodToKnow.push(["Show", d.showTime]);
  if (d?.admission) goodToKnow.push(["Admission", d.admission]);
  if (d?.ageInfo) goodToKnow.push(["Age", d.ageInfo]);
  if (d?.promoter) goodToKnow.push(["Promoter", d.promoter]);
  if (d?.status) goodToKnow.push(["Status", d.status]);

  return (
    <div>
      {titleTag}
      <Hero image={image || "/design/trip-hero.jpg"} alt={title} plain surface={panel} className={cn(panel ? "h-44" : "h-[42vh] min-h-[260px] sm:h-[48vh] sm:max-h-[440px]")}>
        <div className={cn("absolute inset-x-0 bottom-0", pad, "pb-6")}>
          {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" className="shadow-soft" />}
          <WordReveal
            text={title}
            as="h1"
            delay={0.1}
            className="mt-3 font-display text-[1.7rem] leading-[1.1] [text-wrap:balance] drop-shadow-sm sm:text-4xl"
          />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            {dt && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> {dt.day}
                {dt.time ? ` · ${dt.time}` : ""}
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
        {state === "error" && !d ? (
          <p className="text-sm text-muted-foreground">
            We couldn&rsquo;t load more about this event.{" "}
            {(ticketUrl || seed.url) && (
              <ExternalLink href={ticketUrl || seed.url} className="text-sm">
                Open the event page
              </ExternalLink>
            )}
          </p>
        ) : (
          <>
            {/* At a glance */}
            {(dt || d?.doorsTime || d?.genre || d?.priceRange) && (
              <Stagger className="flex flex-wrap gap-2" gap={0.05}>
                {dt && (
                  <StaggerItem>
                    <Chip icon={CalendarClock}>
                      {dt.day}
                      {dt.time ? ` · ${dt.time}` : ""}
                    </Chip>
                  </StaggerItem>
                )}
                {d?.doorsTime && <StaggerItem><Chip icon={DoorOpen}>Doors {d.doorsTime}</Chip></StaggerItem>}
                {d?.genre && <StaggerItem><Chip icon={Music}>{d.genre}</Chip></StaggerItem>}
                {d?.priceRange && <StaggerItem><Chip icon={Ticket}>from {d.priceRange}</Chip></StaggerItem>}
              </Stagger>
            )}

            {/* Tickets — the primary action, up top */}
            {(ticketUrl || (d?.ticketOptions?.length ?? 0) > 0) && (
              <Reveal delay={0.04}>
                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                  <div className="border-l-2 border-coral p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 font-display text-lg">
                        <Ticket className="h-4 w-4 text-coral" /> Tickets
                      </h2>
                      {ticketSeller && <ProviderBadge source={ticketSeller} />}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {ticketUrl && (
                        <Tactile lift={2} className="inline-flex">
                          <a
                            href={ticketUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
                          >
                            <Ticket className="h-4 w-4" /> Get tickets
                          </a>
                        </Tactile>
                      )}
                      {(d?.ticketOptions ?? []).filter((o) => o.url !== ticketUrl).map((o) => (
                        <ExternalLink key={o.url} href={o.url} className="text-sm">
                          {o.label}
                        </ExternalLink>
                      ))}
                    </div>
                    {(d?.priceRange || onSale) && (
                      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                        {d?.priceRange && (
                          <div className="flex gap-2">
                            <dt className="w-16 shrink-0 text-muted-foreground">Price</dt>
                            <dd className="font-medium">{d.priceRange}</dd>
                          </div>
                        )}
                        {onSale && (
                          <div className="flex gap-2">
                            <dt className="w-16 shrink-0 text-muted-foreground">On sale</dt>
                            <dd className="font-medium">{onSale}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <p className="mt-3 text-[11px] text-muted-foreground">Prices and availability change — confirm on the seller&rsquo;s page.</p>
                  </div>
                </section>
              </Reveal>
            )}

            {/* About */}
            {aboutText && (
              <Section title="About" delay={0.06}>
                <p className="whitespace-pre-line text-[15px] leading-[1.85] text-ink-soft">{aboutText}</p>
              </Section>
            )}

            {/* What to expect */}
            {d?.whatToExpect && (
              <Section title="What to expect" icon={Sparkles} delay={0.07}>
                <p className="text-[15px] leading-[1.85] text-ink-soft">{d.whatToExpect}</p>
              </Section>
            )}

            {/* Line-up */}
            {(headliner || lineupNote) && (
              <Section title="Line-up" icon={Users} delay={0.08}>
                {headliner && (
                  <p className="text-lg font-medium leading-tight">
                    {headliner}
                    {support.length > 0 && <span className="text-sm font-normal text-muted-foreground"> — headlining</span>}
                  </p>
                )}
                {support.length > 0 && (
                  <Stagger className="mt-2.5 flex flex-wrap gap-1.5" gap={0.04}>
                    {support.map((p) => (
                      <StaggerItem key={p}>
                        <span className="inline-block rounded-full border border-border bg-card px-3 py-1 text-sm shadow-soft">{p}</span>
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
                {lineupNote && <p className="mt-2.5 text-sm text-muted-foreground">{lineupNote}</p>}
              </Section>
            )}

            {/* When & where */}
            <Section title="When & where" icon={MapPin} delay={0.1}>
              <dl className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 pt-0.5 text-muted-foreground">Date</dt>
                  <dd>
                    {dt ? (
                      <>
                        <span className="font-medium">{dt.day}</span>
                        {dt.time && <span className="text-muted-foreground"> · {dt.time}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Check the ticket page{" "}
                        {ticketUrl && <ExternalLink href={ticketUrl} className="text-sm">here</ExternalLink>}
                      </span>
                    )}
                    {d?.doorsTime && <span className="block text-muted-foreground">Doors {d.doorsTime}</span>}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 pt-0.5 text-muted-foreground">Venue</dt>
                  <dd>
                    <span className="block font-medium">{venueName ?? "See the ticket page"}</span>
                    {d?.venueAddress ? <span className="block text-muted-foreground">{d.venueAddress}</span> : null}
                    {mapsUrl && <ExternalLink href={mapsUrl} className="mt-1 inline-flex text-sm">Open in Google Maps</ExternalLink>}
                  </dd>
                </div>
              </dl>
            </Section>

            {/* Seat map */}
            {d?.seatmapUrl && (
              <Section title="Seat map" delay={0.11}>
                <BlurImage src={d.seatmapUrl} alt={`${title} seat map`} className="w-full rounded-2xl border border-border" />
              </Section>
            )}

            {/* Good to know */}
            {(goodToKnow.length > 0 || d?.pleaseNote) && (
              <Section title="Good to know" icon={Info} boxed delay={0.12}>
                {goodToKnow.length > 0 && (
                  <dl className="space-y-2 text-sm">
                    {goodToKnow.map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
                        <dd className="min-w-0">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {d?.pleaseNote && (
                  <p className={cn("flex gap-2 text-xs leading-relaxed text-muted-foreground", goodToKnow.length > 0 && "mt-3")}>
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.pleaseNote}
                  </p>
                )}
              </Section>
            )}

            <Reveal delay={0.13}>
              <div className="flex flex-wrap items-center gap-3">
                <AddEventButton tripId={tripId} title={title} rawDate={rawDate} showTime={d?.showTime} latitude={d?.latitude} longitude={d?.longitude} />
                <Tactile lift={2} className="inline-flex">
                  <Link href={askAssistantHref(tripId, { name: title, address: venueName ?? undefined })} className="btn-secondary inline-flex">
                    Ask Roam if it fits
                  </Link>
                </Tactile>
              </div>
            </Reveal>

            {d && d.sources.length > 0 && (
              <Reveal delay={0.14}>
                <details className="group text-xs">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    <span className="font-medium">{d.sources.length} source{d.sources.length === 1 ? "" : "s"}</span>
                  </summary>
                  <ul className="mt-2 space-y-1 pl-5">
                    {d.sources.map((s) => (
                      <li key={s.url}>
                        <ExternalLink href={s.url} className="text-[11px]">{s.title}</ExternalLink>
                      </li>
                    ))}
                  </ul>
                </details>
              </Reveal>
            )}

            {cityHint && (
              <NearbyRecommendations
                tripId={tripId}
                kind="event"
                excludeId={ticketUrl ?? seed.url}
                anchorName={venueName ?? title}
                cityHint={cityHint}
                genre={d?.genre}
                lat={d?.latitude ?? undefined}
                lng={d?.longitude ?? undefined}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
