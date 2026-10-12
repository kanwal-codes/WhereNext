"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { cachedGet } from "@/lib/client/cached-get";
import { formatMoney } from "@/lib/currency";
import { readStayDecision } from "@/packages/contracts/stay";
import type { Reservation } from "@/packages/contracts/reservation";

/**
 * What's already reserved with a real price on it (stays, hand-entered reservations), grouped by
 * currency. Deliberately separate from the daily-spend estimate above, which is a planning
 * assumption for food/activities/transit and explicitly excludes lodging — summing a booked stay
 * into that number would misrepresent what it was ever meant to track. Flights aren't included:
 * the trip's flight choice stores its fare as a display string ("642 CAD"), not a number to sum.
 */
export function committedByCurrency(reservations: Reservation[], decisions: ReadonlyArray<{ kind: string; value: unknown }>): Array<[string, number]> {
  const totals = new Map<string, number>();
  const add = (amount: number | null, currency: string | null) => {
    if (amount == null || !currency) return;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  };
  for (const r of reservations) add(r.amount, r.currency);
  const stay = readStayDecision(decisions);
  if (stay) add(stay.totalAmount, stay.currency);
  return [...totals.entries()];
}

export function BudgetSurface({
  tripId,
  durationDays,
  travelers,
  initialBudget,
  decisions = [],
}: {
  tripId: string;
  durationDays?: number | null;
  travelers?: number | null;
  /** Seeded from the layout's workspace snapshot; the surface only fetches when it's absent. */
  initialBudget?: unknown;
  /** Trip decisions, read for the locked stay's price — same shape every other surface reads them in. */
  decisions?: ReadonlyArray<{ kind: string; value: unknown }>;
}) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  useEffect(() => {
    cachedGet(`/api/trips/${tripId}/reservations`, { ttlMs: 0 })
      .then((r) => (r.ok ? r.json() : { reservations: [] }))
      .then((body) => setReservations(body.reservations ?? []))
      .catch(() => undefined);
  }, [tripId]);
  const committed = committedByCurrency(reservations, decisions);
  const seeded = typeof initialBudget === "number";
  const [daily, setDaily] = useState(seeded ? (initialBudget as number) : 100);
  const [saved, setSaved] = useState(false);
  const days = durationDays || null;
  const people = travelers || null;

  useEffect(() => {
    if (seeded) return;
    fetch(`/api/trips/${tripId}/memory`)
      .then((r) => r.json())
      .then((body) => {
        if (typeof body.memory?.budget === "number") setDaily(body.memory.budget);
      })
      .catch(() => undefined);
  }, [tripId, seeded]);

  // A collaborator's edit lands here as a fresh `initialBudget` prop (realtime -> router.refresh()
  // -> a re-rendered server parent) — useState's initializer only runs once, so without this the
  // budget shown would keep whatever was true at first mount.
  useEffect(() => {
    if (typeof initialBudget === "number") setDaily(initialBudget);
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
      // The server correctly 400s an out-of-range value the client let through — without this
      // the input stays showing that rejected number until a full reload, looking saved when
      // it never was.
      setDaily(previous);
      notifyToast("That didn't save. Try again.", "error");
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
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(clamped, previous), 400);
  }

  const rows: Array<[string, string]> = [
    ["Per person, per day", `$${daily}`],
    ["Per person, whole trip", days ? `$${daily * days}` : "Set the trip length"],
    ["Whole group", days && people ? `$${daily * days * people}` : people ? "Set the trip length" : "Set travellers"],
  ];

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

      {committed.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Booked so far — stays and reservations with a price, separate from the daily assumption above. Flights aren’t counted here.</p>
          <dl className="mt-2 space-y-1 text-sm">
            {committed.map(([currency, total]) => (
              <div key={currency} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{currency}</dt>
                <dd className="font-medium tabular-nums">{formatMoney(total, currency)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
