"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { CalendarClock, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/** A single event tile — used in the detail-page carousel and the Discover grid. */
export function EventCard({ event, onOpen, className }: { event: NearbyEvent; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        // Fixed height so a grid or row of these is always uniform, whatever the content.
        "flex h-[19rem] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-soft transition-shadow hover:shadow-lift",
        className,
      )}
    >
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external event image
        <img src={event.imageUrl} alt={event.title} loading="lazy" width={280} height={128} className="h-32 w-full shrink-0 object-cover" />
      ) : (
        <div className="grid h-32 w-full shrink-0 place-items-center bg-muted/50">
          <CalendarClock className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3.5">
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-coral/30 bg-background/92 px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] text-coral uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" />
          {event.source}
        </span>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">{event.title}</p>
        {event.date && <p className="line-clamp-1 text-xs text-muted-foreground">{event.date}</p>}
        {event.venue && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-1">{event.venue}</span>
          </p>
        )}
        <p className="mt-auto pt-1 text-[11px] font-medium text-primary">View details &rarr;</p>
      </div>
    </button>
  );
}

/** The event detail modal, opened from an EventCard. */
export function EventDialog({ event, onClose }: { event: NearbyEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <motion.div
        role="dialog"
        aria-label={event.title}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-lift"
      >
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external event image
          <img src={event.imageUrl} alt={event.title} className="h-48 w-full object-cover" />
        ) : (
          <div className="grid h-48 w-full place-items-center bg-muted/50">
            <CalendarClock className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="relative p-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute -top-9 right-3 rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="eyebrow">{event.source}</p>
          <h3 className="mt-1 font-display text-lg leading-tight">{event.title}</h3>
          <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {event.date && (
              <p className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" /> {event.date}
              </p>
            )}
            {event.venue && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {event.venue}
              </p>
            )}
          </div>
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Get tickets on {event.source}
          </a>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Confirm date, price and availability on the ticket page.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
