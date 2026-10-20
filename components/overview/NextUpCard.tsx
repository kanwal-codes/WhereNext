"use client";

import { hotelPhotoSrc } from "@/lib/hotel-photo";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { BlurImage, Tactile } from "@/components/motion-primitives";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { RemoveControl } from "@/components/overview/RemoveControl";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { clockLabel, dayHeading, isTransit, whenLabel, type TimelineItem } from "@/lib/trip-reservations";
import { PHONE_V2 } from "@/lib/phone-v2";
import { cn } from "@/lib/utils";

const badge = "photo-chip";

type Fact = { title: string; value: string; desc?: string };

function factsFor(item: TimelineItem): Fact[] {
  const stay = item.kind === "stay";
  const transit = isTransit(item.kind);
  const nights = stay && item.date && item.endDate ? Math.round((new Date(`${item.endDate}T00:00:00`).getTime() - new Date(`${item.date}T00:00:00`).getTime()) / 86_400_000) : 0;
  const facts: Fact[] = [];
  if (item.date) facts.push({ title: nights > 0 ? "Check-in" : transit ? "Departs" : "When", value: dayHeading(item.date), desc: item.time ? clockLabel(item.time) : undefined });
  if (nights > 0 && item.endDate) facts.push({ title: "Check-out", value: dayHeading(item.endDate), desc: `${nights} ${nights === 1 ? "night" : "nights"}` });
  else if (transit && (item.endDate || item.endTime)) facts.push({ title: "Arrives", value: dayHeading(item.endDate ?? item.date ?? ""), desc: item.endTime ? clockLabel(item.endTime) : undefined });
  if (item.amountLabel) facts.push({ title: "Price", value: item.amountLabel });
  if (item.code) facts.push({ title: "Ref", value: item.code });
  return facts;
}

/**
 * The booking that is coming up next, set large: its photo when it has one (a hotel), otherwise the
 * trip's warm wash with the kind's icon. Everything after it in the list stays small.
 */
export function NextUpCard({ item, onOpenBooking, onEdit, onRemove }: { item: TimelineItem; onOpenBooking: (id: string) => void; onEdit: (item: TimelineItem) => void; onRemove?: (item: TimelineItem) => Promise<boolean> }) {
  const [imageFailed, setImageFailed] = useState(false);
  const photo = Boolean(item.thumbnail) && !imageFailed;
  const Icon = KIND_META[item.kind].icon;
  const soon = whenLabel(item);
  const facts = factsFor(item);

  const inner: ReactNode = (
    <TripArt seed={hashString(item.id)} grain className={cn("flex min-h-[22rem] flex-col justify-between rounded-3xl border border-border/70 p-6 shadow-soft sm:min-h-[26rem] sm:p-9", PHONE_V2 && "max-lg:min-h-[12.25rem] max-lg:rounded-[1.75rem] max-lg:p-[1.125rem]")}>
      {photo ? (
        <BlurImage src={hotelPhotoSrc(item.thumbnail!)} alt="" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.05]" />
      ) : (
        <Icon aria-hidden className="pointer-events-none absolute -right-6 -bottom-8 h-72 w-72 text-foreground/[0.06]" strokeWidth={1} />
      )}
      {photo && <div aria-hidden className="absolute inset-0 scrim-b" />}

      <div className="relative flex flex-wrap items-center gap-2">
        <span className={cn(badge, "gap-1.5")}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-coral" />
          <span suppressHydrationWarning>{soon ? `Next up · ${soon}` : "Next up"}</span>
        </span>
        <span className={badge}>{KIND_META[item.kind].label}</span>
        {item.status && <span className={cn(badge, "capitalize")}>{item.status}</span>}
        {item.fileCount > 0 && <span className={badge}>{item.fileCount} {item.fileCount === 1 ? "file" : "files"}</span>}
      </div>

      <div className={cn("relative flex flex-col gap-6 pt-24", PHONE_V2 && "max-lg:gap-0 max-lg:pt-10", photo ? "text-white" : "text-foreground")}>
        <div className="min-w-0 max-w-2xl">
          <h3 className={cn("font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-6xl", PHONE_V2 && "max-lg:text-[2rem] max-lg:tracking-[-0.04em]", photo && "[text-shadow:0_2px_24px_rgba(0,0,0,0.5)]")}>{item.title}</h3>
          {PHONE_V2 && facts.length > 0 && (
            <p suppressHydrationWarning className={cn("mt-1 text-[0.9375rem] lg:hidden", photo ? "text-white/85" : "text-ink-soft")}>
              {[facts[0].value, facts[0].desc, facts.find((f) => f.title === "Price")?.value].filter(Boolean).join(" · ")}
            </p>
          )}
          {item.subtitle && <p className={cn("mt-2 text-base", PHONE_V2 && "max-lg:mt-0.5 max-lg:text-[0.9375rem]", photo ? "text-white/85" : "text-muted-foreground")}>{item.subtitle}</p>}
          {item.place && (
            <p className={cn("mt-1 flex items-center gap-1.5 text-sm", photo ? "text-white/75" : "text-muted-foreground")}>
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.place}</span>
            </p>
          )}
        </div>
        {facts.length > 0 && (
          <div
            suppressHydrationWarning
            className={cn(
              PHONE_V2 && "max-lg:hidden!",
              "daisy-stats w-full rounded-2xl border max-sm:grid max-sm:grid-flow-row max-sm:grid-cols-2 max-sm:[&>.daisy-stat:last-child:nth-child(odd)]:col-span-2 sm:w-fit [&_.daisy-stat-value]:leading-tight [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3",
              photo
                ? "glass-photo [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:border-white/20"
                : "border-border/60 bg-background/82 [&>.daisy-stat]:border-border/70",
            )}
          >
            {facts.map((fact) => (
              <div key={fact.title} className="daisy-stat">
                <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">{fact.title}</div>
                <div className={cn("daisy-stat-value font-display text-xl tracking-tight tabular-nums sm:text-2xl", fact.title === "Ref" && "font-mono text-base tracking-wide sm:text-lg")}>{fact.value}</div>
                {fact.desc && <div className="daisy-stat-desc">{fact.desc}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </TripArt>
  );

  const ring = "group block w-full text-left focus-visible:outline-none focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-ring/50";
  return (
    <Tactile lift={3} className="card-host relative">
      {item.href ? (
        <Link href={item.href} className={ring}>{inner}</Link>
      ) : item.reservation ? (
        <button type="button" onClick={() => onEdit(item)} className={ring}>{inner}</button>
      ) : item.bookingId ? (
        <button type="button" onClick={() => onOpenBooking(item.bookingId!)} className={ring}>{inner}</button>
      ) : (
        <div className={ring}>{inner}</div>
      )}
      {item.removal && onRemove && <RemoveControl label={item.title} onConfirm={() => onRemove(item)} className="top-4 right-4" />}
      {item.href && item.bookingId && (
        <button type="button" onClick={() => onOpenBooking(item.bookingId!)} className="mt-2 ml-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Booking details
        </button>
      )}
    </Tactile>
  );
}
