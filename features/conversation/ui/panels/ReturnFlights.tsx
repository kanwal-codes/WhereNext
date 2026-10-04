"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Plane } from "lucide-react";
import type { FlightOffer, FlightRoute } from "@/components/TripPanelProvider";
import { Skeleton } from "@/components/Skeleton";
import { Badge, money, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { FareCard } from "./OtherFlights";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; items: FlightOffer[] };

/**
 * Round trips: the flights back that go with this outbound. Google prices the pair together, so each card shows the
 * whole round trip's price, and picking one is how the traveller sees what the full journey costs.
 */
export function ReturnFlights({ tripId, flight, route }: { tripId: string; flight: FlightOffer; route: FlightRoute }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<State>({ status: "loading" });
  const [picked, setPicked] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ready = Boolean(flight.departureToken && route.originId && route.destinationId && route.departureDate && route.returnDate);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    setPicked(null);
    fetch(`/api/trips/${tripId}/flights/return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromId: route.originId, toId: route.destinationId, departureDate: route.departureDate, returnDate: route.returnDate, departureToken: flight.departureToken }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("return");
        const body = (await res.json()) as { items?: FlightOffer[] };
        setState({ status: "ready", items: body.items ?? [] });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [ready, tripId, flight.departureToken, route.originId, route.destinationId, route.departureDate, route.returnDate, attempt]);

  if (!ready) return null;
  const chosen = state.status === "ready" ? state.items.find((o) => (o.id ?? "") === picked) : undefined;
  const lowest = state.status === "ready" && state.items.length ? Math.min(...state.items.map((o) => Number(o.price))) : null;

  return (
    <section aria-label="Return flights" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={type.section}>Choose your return</h3>
        {route.returnDate && <span className={cn(type.meta, "tabular-nums")}>{new Date(`${route.returnDate}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</span>}
      </div>

      {state.status === "loading" && (
        <div aria-hidden className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3"><Skeleton className="size-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-32 rounded-md" /><Skeleton className="h-3 w-24 rounded-md" /></div><Skeleton className="h-6 w-20 rounded-md" /></div>
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="rounded-2xl border border-border bg-card px-4 py-6 text-center">
          <p className={type.body}>We couldn’t load the return flights just now.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-3 inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-accent">Try again</button>
        </div>
      )}

      {state.status === "ready" && state.items.length === 0 && <p className={cn(type.body, "rounded-2xl border border-dashed border-border px-4 py-6 text-center text-ink-soft")}>No return flights were listed for that day.</p>}

      {state.status === "ready" && state.items.length > 0 && (
        <>
          <ul className="space-y-2.5">
            {state.items.map((o, i) => (
              <motion.li key={o.id ?? i} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 6) * 0.06 }}>
                <FareCard
                  offer={o}
                  selected={picked === (o.id ?? "")}
                  onPick={(x) => setPicked(x.id ?? "")}
                  priceNote="round trip"
                  badges={lowest !== null && Number(o.price) === lowest && state.items.filter((x) => Number(x.price) === lowest).length === 1 ? <span className="mt-3 flex"><Badge tone="positive" icon={Check}>Lowest round trip</Badge></span> : undefined}
                />
              </motion.li>
            ))}
          </ul>
          <motion.div
            key={chosen ? "chosen" : "hint"}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", chosen ? "bg-coral-soft text-coral-ink" : "bg-muted text-ink-soft")}
          >
            <Plane className="size-4 shrink-0" aria-hidden />
            <p className="text-sm">
              {chosen ? <>Round trip with {flight.airline} out and {chosen.airline} back: <span className="font-semibold tabular-nums">{money(chosen.price, chosen.currency, true)}</span> per person.</> : "Pick a return flight to see the whole trip’s price."}
            </p>
          </motion.div>
        </>
      )}
    </section>
  );
}
