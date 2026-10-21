"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { cachedGet } from "@/lib/client/cached-get";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

type Committed = {
  currency: string;
  lines: Array<{ currency: string; total: number; count: number }>;
  convertedTotal: number;
  perPerson: number | null;
  unconverted: Array<{ currency: string; total: number }>;
};

export function BudgetSurface({
  tripId,
  durationDays,
  travelers,
  initialBudget,
  currency = DEFAULT_CURRENCY,
}: {
  tripId: string;
  durationDays?: number | null;
  travelers?: number | null;
  /** Seeded from the layout's workspace snapshot; the surface only fetches when it's absent. */
  initialBudget?: unknown;
  /** The trip's own currency: what every figure here is shown in. */
  currency?: string;
}) {
  // What is already booked, added up server-side (converted into the trip's currency at the day's rate).
  const [committed, setCommitted] = useState<Committed | null | "loading">("loading");
  useEffect(() => {
    cachedGet(`/api/trips/${tripId}/budget`, { ttlMs: 0 })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setCommitted(body as Committed | null))
      .catch(() => setCommitted(null));
  }, [tripId, initialBudget]);
  const seeded = typeof initialBudget === "number";
  // Until a budget is set the control starts at a sensible middle, but nothing says it is set.
  const [touched, setTouched] = useState(seeded);
  const [daily, setDaily] = useState(seeded ? (initialBudget as number) : 100);
  const [saved, setSaved] = useState(false);
  const days = durationDays || null;
  const people = travelers || null;

  useEffect(() => {
    if (seeded) return;
    fetch(`/api/trips/${tripId}/memory`)
      .then((r) => r.json())
      .then((body) => {
        if (typeof body.memory?.budget === "number") {
          setDaily(body.memory.budget);
          setTouched(true);
        }
      })
      .catch(() => undefined);
  }, [tripId, seeded]);

  // A collaborator's edit lands here as a fresh `initialBudget` prop (realtime -> router.refresh()
  // -> a re-rendered server parent) — useState's initializer only runs once, so without this the
  // budget shown would keep whatever was true at first mount.
  useEffect(() => {
    if (typeof initialBudget === "number") {
      setDaily(initialBudget);
      setTouched(true);
    }
  }, [initialBudget]);

  // The range input fires onChange on every drag step (dozens of events per gesture) — persist
  // only the settled value, not one PUT + workspace-wide refresh per pixel of drag.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const MIN_DAILY = 20;

  async function persist(value: number, previous: number) {
    const r = await fetch(`/api/trips/${tripId}/memory`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ budget: value }) });
    if (r.ok) {
      setSaved(true);
      announceWorkspaceChange("preferences");
    } else {
      // The server rejected it (an out-of-range value, or someone who can only view the trip): put the
      // old number back and say why, rather than leave a rejected number looking saved.
      const body = await r.json().catch(() => ({}));
      setDaily(previous);
      notifyToast(r.status === 403 ? "Only people who can edit this trip can change its budget." : typeof body.error === "string" ? body.error : "That didn't save. Try again.", "error");
    }
  }

  function update(value: number) {
    if (!Number.isFinite(value)) return; // an emptied/invalid number field must not persist as budget: null
    // The range input's `min` is enforced natively by the browser, but the free-typed number
    // field's `min` attribute is only checked on form submit, not on every keystroke — a typed
    // negative value reaches here uncapped otherwise.
    const clamped = Math.max(MIN_DAILY, Math.round(value));
    const previous = daily;
    setDaily(clamped);
    setTouched(true);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(clamped, previous), 400);
  }

  const money = (amount: number) => formatMoney(amount, currency);
  const rows: Array<[string, string]> = touched
    ? [
        ["Per person, per day", money(daily)],
        ["Per person, whole trip", days ? money(daily * days) : "Set the trip length"],
        ["Whole group", days && people ? money(daily * days * people) : people ? "Set the trip length" : "Set travellers"],
      ]
    : [["Per person, per day", "Not set yet. Drag the slider to set it."]];
  const wholeTrip = touched && days ? daily * days : null;

  return (
    <section className={cn("rounded-3xl border border-border/70 bg-card p-6 shadow-soft", "max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none")}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={cn("font-display text-lg", "max-lg:eyebrow max-lg:font-sans")}>Budget</h2>
        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onAnimationComplete={(def) => { if (def === "animate") setTimeout(() => setSaved(false), 1600); }}
              className="inline-flex items-center gap-1 text-xs text-leaf"
            >
              <Check className="h-3 w-3" /> Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className={cn("mt-1 text-xs text-muted-foreground", "max-lg:hidden")}>An assumption you set — Roam uses it to weigh options.</p>

      <p aria-hidden className="mt-3 flex flex-wrap items-baseline gap-x-2 lg:hidden">
        <span className={cn("font-display text-[2.5rem] leading-none font-medium tracking-[-0.03em] tabular-nums", !touched && "text-muted-foreground")}>{money(daily)}</span>
        <span className="text-sm text-muted-foreground">{touched ? "per person, per day" : "per person, per day · drag to set"}</span>
      </p>
      <div className="mt-4 flex items-center gap-3 max-lg:mt-2">
        <input
          type="range"
          min={20}
          max={600}
          step={10}
          value={daily}
          onChange={(e) => update(Number(e.target.value))}
          aria-label="Daily budget per person"
          className="flex-1 accent-[var(--coral)] max-lg:h-10"
        />
        <input
          type="number"
          aria-label="Daily budget per person"
          name="daily-budget"
          min={20}
          value={daily}
          onChange={(e) => update(Number(e.target.value))}
          className={cn("w-20 rounded-xl border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums max-lg:h-11 max-lg:w-24", "max-lg:hidden")}
        />
      </div>

      <dl className="mt-4 divide-y divide-border text-sm">
        {rows.map(([label, value], i) => (
          <div key={label} className={cn("flex items-center justify-between gap-3 py-2", i === 0 && "max-lg:hidden")}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-border pt-4">
        {committed && committed !== "loading" && committed.perPerson != null && wholeTrip ? (
          <div className="mb-4 lg:hidden">
            <div role="progressbar" aria-label="Booked against the whole-trip budget" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((committed.perPerson / wholeTrip) * 100))} className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, (committed.perPerson / wholeTrip) * 100)}%` }} />
            </div>
            <p className="mt-2 flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
              <span>{money(committed.convertedTotal)} booked so far</span>
              <span className="font-display text-base text-foreground tabular-nums">{Math.round((committed.perPerson / wholeTrip) * 100)}%</span>
            </p>
          </div>
        ) : null}
        <p className={cn("text-xs text-muted-foreground", "max-lg:hidden")}>Booked so far: every booking with a price, entered by hand or chosen here, flights included. Cancelled ones are left out. Shown in {currency} at today&rsquo;s rates.</p>
        {committed === "loading" ? (
          <dl className="mt-2 space-y-2" aria-label="Adding up what you’ve booked…" aria-live="polite" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-3.5 w-16 rounded-md" />
              </div>
            ))}
          </dl>
        ) : !committed || committed.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing with a price yet. Add bookings on the Bookings page.</p>
        ) : (
          <>
            <dl className={cn("mt-2 space-y-1 text-sm", "max-lg:hidden")}>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Everyone</dt>
                <dd className="font-medium tabular-nums">{money(committed.convertedTotal)}</dd>
              </div>
              {committed.perPerson != null && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Per person</dt>
                  <dd className="font-medium tabular-nums">{money(committed.perPerson)}</dd>
                </div>
              )}
              {committed.perPerson != null && wholeTrip ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Against the whole-trip budget</dt>
                  <dd className="font-medium tabular-nums">{Math.round((committed.perPerson / wholeTrip) * 100)}%</dd>
                </div>
              ) : null}
            </dl>
            {committed.perPerson != null && wholeTrip ? <p className={cn("mt-1.5 text-xs text-muted-foreground", "max-lg:hidden")}>Count that against the budget only if it is meant to cover flights and stays too.</p> : null}
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none max-lg:py-3">{<><span className="lg:hidden">How this adds up</span><span className="max-lg:hidden">By currency</span></>}</summary>
              <div className="mt-1.5 space-y-1.5 lg:hidden">
                <p>Every booking with a price, entered by hand or chosen here, flights included. Cancelled ones are left out. Shown in {currency} at today&rsquo;s rates.</p>
                {committed.perPerson != null && <p>That is {money(committed.perPerson)} per person. Count it against the whole-trip budget only if it is meant to cover flights and stays too.</p>}
              </div>
              <dl className="mt-1.5 space-y-1">
                {committed.lines.map((line) => (
                  <div key={line.currency} className="flex items-center justify-between gap-3">
                    <dt>{line.currency} · {line.count} {line.count === 1 ? "booking" : "bookings"}</dt>
                    <dd className="tabular-nums">{formatMoney(line.total, line.currency)}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {committed.unconverted.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">No rate for {committed.unconverted.map((u) => `${formatMoney(u.total, u.currency)}`).join(", ")}, so {committed.unconverted.length === 1 ? "it isn’t" : "they aren’t"} in the total above.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
