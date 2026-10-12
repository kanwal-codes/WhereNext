"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { cachedGet } from "@/lib/client/cached-get";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";

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
    <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg">Budget</h2>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-leaf">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">An assumption you set — Roam uses it to weigh options.</p>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="range"
          min={20}
          max={600}
          step={10}
          value={daily}
          onChange={(e) => update(Number(e.target.value))}
          aria-label="Daily budget per person"
          className="flex-1 accent-[var(--coral)]"
        />
        <input
          type="number"
          aria-label="Daily budget per person"
          name="daily-budget"
          min={20}
          value={daily}
          onChange={(e) => update(Number(e.target.value))}
          className="w-20 rounded-xl border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums"
        />
      </div>

      <dl className="mt-4 divide-y divide-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">Booked so far: every booking with a price, entered by hand or chosen here, flights included. Cancelled ones are left out. Shown in {currency} at today&rsquo;s rates.</p>
        {committed === "loading" ? (
          <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">Adding up what you&rsquo;ve booked…</p>
        ) : !committed || committed.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing with a price yet. Add bookings on the Bookings page.</p>
        ) : (
          <>
            <dl className="mt-2 space-y-1 text-sm">
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
            {committed.perPerson != null && wholeTrip ? <p className="mt-1.5 text-xs text-muted-foreground">Count that against the budget only if it is meant to cover flights and stays too.</p> : null}
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">By currency</summary>
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
