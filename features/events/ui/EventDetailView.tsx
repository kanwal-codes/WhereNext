"use client";

import Link from "next/link";
import { CalendarDays, ChevronDown, Info, MapPin, Ticket } from "lucide-react";
import { PHONE_V2 } from "@/lib/phone-v2";
import { Hero } from "@/components/Hero";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { FactStrip } from "@/components/DetailKit";
import { BackLink } from "@/components/BackLink";
import { ExternalLink } from "@/components/ExternalLink";
import { SourceCard } from "@/components/SourceCard";
import { NearbyRecommendations } from "@/components/NearbyRecommendations";
import { PanelError, PanelLoading, PANEL_PAD, PANEL_HERO } from "@/components/PanelStates";
import { Reveal, Stagger, StaggerItem, Tactile, WordReveal } from "@/components/motion-primitives";
import { useDocumentTitle } from "@/lib/use-document-title";
import { askAssistantHref, cityFrom } from "@/lib/places-ui";
import { displayClockTime } from "@/lib/application/clock-time";
import { Badge, prettyDate } from "@/features/conversation/ui/blocks/ui";
import { cn, safeHref } from "@/lib/utils";
import { ticketSellerLabel } from "@/lib/ticket-provider";
import { eventFallbackImage } from "@/lib/event-imagery";
import { AddEventButton } from "@/features/events/ui/AddEventButton";
import { useEventDetail, type EventSeed } from "@/features/events/application/useEventDetail";
import { goodToKnowRows, lineupNoteFor, readableDate, tidyAbout, venueMapsUrl } from "@/features/events/domain/event-view";


/** Section wrapper — title and consistent rhythm, the same plain heading every detail view
 *  uses (`DetailSectionHeading`). `boxed` gets a card surround. */
function Section({
  title,
  boxed = false,
  delay = 0,
  children,
}: {
  title: string;
  boxed?: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay}>
      <section className={cn(boxed && "rounded-2xl border border-border bg-card p-5 shadow-soft")}>
        <DetailSectionHeading className={boxed ? "text-lg" : undefined}>{title}</DetailSectionHeading>
        <div className="mt-3">{children}</div>
      </section>
    </Reveal>
  );
}

/** Phone: one fact as an icon, a line and a quieter note, instead of a bordered strip of stats. */
function PhoneFact({ icon: Icon, title, note }: { icon: typeof Ticket; title: string; note?: string }) {
  return (
    <li className="flex items-center gap-4 py-4">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-foreground"><Icon className="size-[1.125rem]" /></span>
      <span className="min-w-0">
        <span className="block font-display text-base leading-snug font-medium text-balance">{title}</span>
        {note && <span className="mt-0.5 block text-sm text-muted-foreground">{note}</span>}
      </span>
    </li>
  );
}

/** Full detail for one event — same layout on the routed page and the chat side panel. */
export function EventDetailView({ tripId, seed, variant = "page" }: { tripId: string; seed: EventSeed; variant?: "page" | "panel" }) {
  const panel = variant === "panel";
  const { detail, state, retry } = useEventDetail(tripId, seed);
  const titleTag = useDocumentTitle(panel ? null : detail?.title ?? seed.name);

  const dock = PHONE_V2 && !panel;
  const pad = panel ? PANEL_PAD : cn("mx-auto max-w-3xl px-5 pb-14 sm:px-8", dock && "max-lg:pb-32");
  const d = detail;

  if (state === "loading") {
    return <PanelLoading what="this event" panel={panel} heroClassName={panel ? PANEL_HERO : "h-[42vh] min-h-[260px] sm:h-[48vh] sm:max-h-[440px]"} />;
  }

  const title = d?.title ?? seed.name;
  const image = d?.imageUrl ?? seed.imageUrl;
  const rawDate = d?.date ?? seed.date ?? null;
  const dt = readableDate(rawDate);
  const venueName = d?.venueName ?? seed.venue ?? null;
  const ticketUrl = d?.url ?? (ticketSellerLabel(seed.source, seed.url) ? seed.url : null);
  const ticketSeller = ticketSellerLabel(d?.source ?? seed.source, ticketUrl);
  const mapsUrl = venueMapsUrl(d, venueName);

  const headliner = d?.performers?.[0];
  const support = d?.performers?.slice(1) ?? [];
  const lineupNote = lineupNoteFor(d);
  const onSale = d?.onSale?.replace(/^on sale\s*/i, "") ?? null;
  const aboutText = tidyAbout(d?.about);
  const fallbackImage = eventFallbackImage({ genre: d?.genre, title });
  const cityHint = cityFrom(d?.venueAddress) || d?.city || venueName || "";

  const goodToKnow = goodToKnowRows(d);

  return (
    <div>
      {titleTag}
      <Hero image={image || fallbackImage} fallbackImage={fallbackImage} alt={title} plain surface={panel} className={cn(panel ? PANEL_HERO : "h-[42vh] min-h-[260px] sm:h-[48vh] sm:max-h-[440px]")}>
        <div className={cn("absolute inset-x-0 bottom-0", pad, "pb-6")}>
          {!panel && <BackLink fallback={`/trips/${tripId}/discover`} label="Back" className={cn("shadow-soft", PHONE_V2 && "max-lg:hidden")} />}
          {PHONE_V2 && !panel && d?.genre && <p className="eyebrow text-ink-soft! lg:hidden">{d.genre}</p>}
          {panel ? (
            <h1 className="mt-3 font-display text-title leading-[1.1] [text-wrap:balance] drop-shadow-sm">{title}</h1>
          ) : (
          <WordReveal
              text={title}
              as="h1"
              delay={0.1}
              className="mt-3 font-display text-title leading-[1.1] [text-wrap:balance] drop-shadow-sm sm:text-4xl"
            />
          )}
        </div>
      </Hero>

      <div className={cn(pad, "pt-6 space-y-8")}>
        {state === "error" && !d ? (
          <PanelError what="the details for this event" panel={panel} onRetry={retry}>
            {(ticketUrl || seed.url) && (
              <ExternalLink href={ticketUrl || seed.url} className="text-sm">
                Open the event page
              </ExternalLink>
            )}
          </PanelError>
        ) : (
          <>
            {/* At a glance */}
            {(dt || venueName || d?.priceRange) && (
              <Reveal>
                <div className="space-y-3">
                  {PHONE_V2 && (
                    <ul className="divide-y divide-border border-b border-border lg:hidden">
                      {dt && <PhoneFact icon={CalendarDays} title={[dt.day, dt.time].filter(Boolean).join(" · ")} note={d?.doorsTime && displayClockTime(d.doorsTime) !== dt.time ? `Doors ${displayClockTime(d.doorsTime)}` : undefined} />}
                      {venueName && <PhoneFact icon={MapPin} title={venueName} note={[d?.venueAddress ? cityFrom(d.venueAddress) : null, d?.city].find((n) => n && n.trim().toLowerCase() !== venueName.trim().toLowerCase()) || undefined} />}
                      {d?.priceRange && <PhoneFact icon={Ticket} title={d.priceRange} note={ticketSeller ? `Tickets via ${ticketSeller}` : "Ticket prices"} />}
                    </ul>
                  )}
                  <div className={cn(PHONE_V2 && "max-lg:hidden")}>
                  <FactStrip
                    facts={[
                      dt && { label: "When", value: dt.day, note: [dt.time, d?.doorsTime && displayClockTime(d.doorsTime) !== dt.time && `doors ${displayClockTime(d.doorsTime)}`].filter(Boolean).join(" · ") || undefined },
                      venueName && { label: "Where", value: venueName, note: [cityFrom(d?.venueAddress), d?.city].find((n) => n && n.trim().toLowerCase() !== venueName.trim().toLowerCase()) || undefined },
                      d?.priceRange && { label: "From", value: d.priceRange },
                    ]}
                  />
                  </div>
                  {d?.genre && <div className={cn("flex", PHONE_V2 && !panel && "max-lg:hidden")}><Badge>{d.genre}</Badge></div>}
                </div>
              </Reveal>
            )}

            {/* Tickets — the primary action, up top */}
            {(ticketUrl || (d?.ticketOptions?.length ?? 0) > 0) && (
              <Reveal delay={0.04}>
                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 font-display text-lg">
                        <Ticket className="h-4 w-4 text-coral" /> Tickets
                      </h2>
                      {ticketSeller && <span className="text-xs text-muted-foreground">via {ticketSeller}</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {ticketUrl && (
                        <Tactile lift={2} className={cn("inline-flex", dock && "max-lg:hidden")}>
                          <a
                            href={safeHref(ticketUrl)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="btn-primary"
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
                            <dd className="font-medium">{onSale.replace(/\d{4}-\d{2}-\d{2}/g, (m) => prettyDate(m) ?? m)}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">Prices and availability change — confirm on the seller&rsquo;s page.</p>
                  </div>
                </section>
              </Reveal>
            )}

            {/* Add to trip / Ask Roam — used to sit at the very bottom, after About, Line-up,
                When & where, Seat map, and Good to know, so it was only ever visible after
                scrolling past the entire rest of the page. Placed here, right under Tickets
                (the actual primary action for an event page), so it's visible immediately —
                same fix as PlaceDetailView's "Add to trip" moving up from its own former sidebar
                spot below Photos/Reviews/Hours. */}
            <Reveal delay={0.05}>
              <div className={cn("flex flex-wrap items-center gap-3", dock && "max-lg:hidden")}>
                <AddEventButton tripId={tripId} title={title} rawDate={rawDate} showTime={d?.showTime} latitude={d?.latitude} longitude={d?.longitude} />
                {!panel && (
                  <Tactile lift={2} className="inline-flex">
                    <Link href={askAssistantHref(tripId, { name: title, address: venueName ?? undefined })} className="btn-secondary inline-flex">
                      Ask Roam if it fits
                    </Link>
                  </Tactile>
                )}
              </div>
            </Reveal>

            {/* About */}
            {aboutText && (
              <Section title="About" delay={0.06}>
                <p className="whitespace-pre-line text-body leading-relaxed text-ink-soft">{aboutText}</p>
              </Section>
            )}

            {/* What to expect */}
            {d?.whatToExpect && (
              <Section title="What to expect" delay={0.07}>
                <p className="text-body leading-relaxed text-ink-soft">{d.whatToExpect}</p>
              </Section>
            )}

            {/* Line-up */}
            {((headliner && (support.length > 0 || headliner.trim().toLowerCase() !== title.trim().toLowerCase())) || lineupNote) && (
              <Section title="Line-up" delay={0.08}>
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

            {/* Venue: only when we know one (the date has its own fact above, so there is no placeholder when it is missing). */}
            {venueName && (
              <Section title="Venue" delay={0.1}>
                <p className="text-sm">
                  <span className="block font-medium">{venueName}</span>
                  {d?.venueAddress ? <span className="block text-muted-foreground">{d.venueAddress}</span> : null}
                </p>
                {mapsUrl && (
                  <div className="mt-4">
                    <SourceCard provider="Google Maps" href={mapsUrl} />
                  </div>
                )}
              </Section>
            )}

            {/* Good to know */}
            {(goodToKnow.length > 0 || d?.pleaseNote) && (
              <Section title="Good to know" boxed delay={0.12}>
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

            {d && d.sources.length > 0 && (
              <Reveal delay={0.14}>
                <details className="group text-xs">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    <span className="font-medium">{d.sources.length} source{d.sources.length === 1 ? "" : "s"}</span>
                  </summary>
                  <ul className="mt-2 space-y-1 pl-5">
                    {d.sources.map((s) => (
                      <li key={s.url}>
                        <ExternalLink href={s.url} className="text-xs">{s.title}</ExternalLink>
                      </li>
                    ))}
                  </ul>
                </details>
              </Reveal>
            )}

            {dock && (
              <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border/70 bg-background/97 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
                <AddEventButton block tripId={tripId} title={title} rawDate={rawDate} showTime={d?.showTime} latitude={d?.latitude} longitude={d?.longitude} />
                {ticketUrl && (
                  <a href={safeHref(ticketUrl)} target="_blank" rel="noreferrer noopener" className="btn-primary h-12 flex-1 justify-center rounded-full">
                    <Ticket className="size-4" aria-hidden /> Tickets
                  </a>
                )}
              </div>
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
