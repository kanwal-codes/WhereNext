"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pencil, X } from "lucide-react";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";
import { certaintyFor, decisionSummary } from "@/lib/decisions-ui";
import { CertaintyBadge } from "@/components/CertaintyBadge";
import { ProgressRing } from "@/components/ProgressRing";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { tripCompleteness, type Certainty } from "@/lib/design";
import { readStayDecision } from "@/packages/contracts/stay";
import { readSuggestions, type SuggestionKey } from "@/packages/contracts/suggestion";

type Decision = { id: string; kind: string; value: Record<string, unknown>; source: string; created_at?: string };
type PrefKey = "budget" | "groupType" | "pace" | "interests" | "dislikes" | "dietaryNeeds";

const csv = (value: unknown): string =>
  Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
const toList = (value: string): string[] => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const fmtDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const PREF_PLACEHOLDER: Record<PrefKey, string> = {
  budget: "e.g. 120 a day, or “moderate”",
  groupType: "couple, friends, family…",
  pace: "relaxed · balanced · packed",
  interests: "food, bookshops, long walks",
  dislikes: "museums, early starts",
  dietaryNeeds: "vegetarian, halal…",
};

type Row = {
  id: string;
  label: string;
  value: string;
  certainty: Certainty;
  editKey?: PrefKey;
  /** Editable but not through the memory PUT — currently just the trip date range. */
  editable?: boolean;
  suggestionKey?: SuggestionKey;
  note?: string;
};

export function TripContextSurface({
  tripId,
  trip,
  initialMemory,
  initialDecisions,
}: {
  tripId: string;
  trip: Trip | null;
  initialMemory?: Record<string, unknown>;
  initialDecisions?: Array<Record<string, unknown>>;
}) {
  const [memory, setMemory] = useState<Record<string, unknown>>(initialMemory ?? {});
  const [decisions, setDecisions] = useState<Decision[]>((initialDecisions ?? []) as Decision[]);
  const [editing, setEditing] = useState<PrefKey | null>(null);
  const [draft, setDraft] = useState("");
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [tripDates, setTripDates] = useState({ start: trip?.start_date ?? "", end: trip?.end_date ?? "" });
  const [editingDates, setEditingDates] = useState(false);
  const [dStart, setDStart] = useState("");
  const [dEnd, setDEnd] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  useEffect(() => {
    setTripDates({ start: trip?.start_date ?? "", end: trip?.end_date ?? "" });
  }, [trip?.start_date, trip?.end_date]);

  const refresh = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([
        fetch(`/api/trips/${tripId}/memory`).then((r) => r.json()),
        fetch(`/api/trips/${tripId}/decisions`).then((r) => r.json()),
      ]);
      setMemory(m.memory ?? {});
      setDecisions(d.decisions ?? []);
    } catch {
      // keep what we have
    }
  }, [tripId]);

  useEffect(() => {
    if (!initialMemory && !initialDecisions) void refresh();
  }, [initialMemory, initialDecisions, refresh]);

  const suggestions = useMemo(() => readSuggestions(decisions), [decisions]);
  const suggestionFor = (key: SuggestionKey) => suggestions.find((s) => s.key === key);
  const lockedStay = useMemo(() => readStayDecision(decisions), [decisions]);
  const realDecisions = decisions.filter((d) => !["suggestion", "stay", "stay_area", "transport"].includes(d.kind));

  const progress = useMemo(
    () => tripCompleteness({ preferences: memory, decisions: decisions.filter((d) => d.kind !== "suggestion"), conversation: [], itinerary: [], savedPlaces: [], essentials: [] }),
    [memory, decisions],
  );

  async function savePref(key: PrefKey, raw: string) {
    setSavingKey(key);
    const multi = key === "interests" || key === "dislikes" || key === "dietaryNeeds";
    const value: unknown = multi ? toList(raw) : key === "budget" && raw.trim() && !Number.isNaN(Number(raw)) ? Number(raw) : raw.trim();
    try {
      const response = await fetch(`/api/trips/${tripId}/memory`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error();
      setMemory((await response.json()).memory ?? {});
      setEditing(null);
      setFlash(key);
      setTimeout(() => setFlash(null), 1200);
      announceWorkspaceChange("preferences");
    } catch {
      notifyToast("Could not save — trip owner only.", "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveDates() {
    if (dStart && dEnd && dEnd < dStart) {
      notifyToast("The end date is before the start date.", "error");
      return;
    }
    setSavingDates(true);
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: dStart || null, endDate: dEnd || null }),
      });
      if (!response.ok) {
        const detail = await response.json().then((b) => (b && typeof b.error === "string" ? b.error : null)).catch(() => null);
        throw new Error(detail ?? "Could not save those dates.");
      }
      setTripDates({ start: dStart, end: dEnd });
      setEditingDates(false);
      setFlash("dates");
      setTimeout(() => setFlash(null), 1200);
      announceWorkspaceChange("preferences");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "Could not save those dates.", "error");
    } finally {
      setSavingDates(false);
    }
  }

  async function act(key: SuggestionKey, action: "confirm" | "dismiss") {
    setBusyKey(key);
    try {
      const response = await fetch(`/api/trips/${tripId}/suggestions`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, action }),
      });
      if (!response.ok) throw new Error();
      if (action === "confirm") {
        setFlash(`sugg-${key}`);
        setTimeout(() => setFlash(null), 1200);
        notifyToast("Locked in.", "success");
      }
      await refresh();
      announceWorkspaceChange(action === "confirm" ? "preferences" : "decision");
    } catch {
      notifyToast("Could not update that.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  // --- Build the ordered field list ---------------------------------------------
  const rows: Row[] = [];
  const push = (r: Row) => rows.push(r);

  const fact = (id: string, label: string, value: string) =>
    push({ id, label, value, certainty: value ? "confirmed" : "undecided" });

  fact("destination", "Destination", trip?.destination ?? "");
  fact("length", "Trip length", trip?.duration_days ? `${trip.duration_days} days` : "");
  fact("travellers", "Travellers", trip?.travelers ? `${trip.travelers}` : "");

  // A field that may be confirmed (from memory / a decision) OR carry a live suggestion.
  const softField = (id: string, label: string, confirmedValue: string, sKey: SuggestionKey, editKey?: PrefKey) => {
    if (confirmedValue) {
      push({ id, label, value: confirmedValue, certainty: "confirmed", editKey });
      return;
    }
    const s = suggestionFor(sKey);
    if (s) {
      push({ id, label, value: s.display, certainty: "suggested", suggestionKey: sKey, note: s.rationale });
      return;
    }
    push({ id, label, value: "", certainty: "undecided", editKey });
  };

  // Dates: the real trip range if set, else a live suggestion, else open. Editable inline.
  const dateRange = tripDates.start && tripDates.end
    ? `${fmtDate(tripDates.start)} – ${fmtDate(tripDates.end)}`
    : tripDates.start ? `From ${fmtDate(tripDates.start)}` : "";
  if (dateRange) {
    push({ id: "dates", label: "Dates", value: dateRange, certainty: "confirmed", editable: true });
  } else {
    const s = suggestionFor("dates");
    if (s) push({ id: "dates", label: "Dates", value: s.display, certainty: "suggested", suggestionKey: "dates", note: s.rationale, editable: true });
    else push({ id: "dates", label: "Dates", value: "", certainty: "undecided", editable: true });
  }

  softField("occasion", "Occasion", csv(memory.occasion), "occasion");
  softField("budget", "Budget", csv(memory.budget), "budget", "budget");
  softField("group", "Who's travelling", csv(memory.groupType), "group", "groupType");
  softField("pace", "Pace", csv(memory.pace), "pace", "pace");
  softField(
    "interests",
    "Interests",
    csv(memory.interests) || csv(memory.likes),
    "interests",
    "interests",
  );
  softField(
    "base_area",
    "Base neighbourhood",
    (() => {
      const d = decisions.find((x) => x.kind === "stay_area");
      return d ? decisionSummary("stay_area", d.value) : "";
    })(),
    "base_area",
  );
  softField(
    "getting_around",
    "Getting around",
    csv(memory.transport) ||
      (() => {
        const d = decisions.find((x) => x.kind === "transport");
        return d ? decisionSummary("transport", d.value) : "";
      })(),
    "getting_around",
  );
  softField("arrival", "Arrival", csv(memory.arrival), "arrival");

  push({ id: "dislikes", label: "Avoid", value: csv(memory.dislikes), certainty: csv(memory.dislikes) ? "confirmed" : "undecided", editKey: "dislikes" });
  push({ id: "dietary", label: "Dietary", value: csv(memory.dietaryNeeds), certainty: csv(memory.dietaryNeeds) ? "confirmed" : "undecided", editKey: "dietaryNeeds" });
  push({
    id: "stay",
    label: "Where you're staying",
    value: lockedStay ? `${lockedStay.hotelName} · ${lockedStay.roomName}` : "",
    certainty: lockedStay ? "confirmed" : "undecided",
  });
  for (const d of realDecisions) {
    push({ id: `dec-${d.id}`, label: d.kind.replaceAll("_", " "), value: decisionSummary(d.kind, d.value), certainty: certaintyFor(d.source) });
  }

  const openQuestions = rows.filter((r) => r.certainty === "undecided").map((r) => r.label);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="eyebrow">Trip context</p>
          <h3 className="mt-1 font-display text-base">What we know</h3>
        </div>
        <ProgressRing value={progress} size={44} />
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const isEditing = row.id === "dates" ? editingDates : editing != null && editing === row.editKey;
          const flashId = row.suggestionKey ? `sugg-${row.suggestionKey}` : row.editKey ?? row.id;
          return (
            <motion.div
              key={row.id}
              layout
              animate={flash === flashId ? { boxShadow: ["0 0 0 0 transparent", "0 0 0 3px var(--leaf-soft)", "0 0 0 0 transparent"] } : {}}
              transition={{ boxShadow: { duration: 1.2 }, layout: { duration: 0.16, ease: [0.22, 0.61, 0.36, 1] } }}
              className={cn("rounded-xl border bg-card px-3 py-2.5", row.certainty === "suggested" ? "border-water/40" : "border-border")}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">{row.label}</p>
                <CertaintyBadge certainty={row.certainty} />
              </div>

              {isEditing && row.id === "dates" ? (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      aria-label="Start date"
                      value={dStart}
                      onChange={(e) => {
                        setDStart(e.target.value);
                        if (dEnd && e.target.value && dEnd < e.target.value) setDEnd(e.target.value);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      aria-label="End date"
                      value={dEnd}
                      min={dStart || undefined}
                      onChange={(e) => setDEnd(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => void saveDates()} disabled={savingDates} className="btn-primary-sm">
                      {savingDates ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingDates(false)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                    {(dStart || dEnd) && (
                      <button type="button" onClick={() => { setDStart(""); setDEnd(""); }} className="ml-auto text-[11px] text-muted-foreground hover:text-destructive">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ) : isEditing ? (
                <div className="mt-1.5 space-y-1.5">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void savePref(row.editKey!, draft);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    placeholder={PREF_PLACEHOLDER[row.editKey!]}
                    className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => void savePref(row.editKey!, draft)} disabled={savingKey === row.editKey} className="btn-primary-sm">
                      {savingKey === row.editKey ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.p
                      key={row.value}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.25 }}
                      className={cn("min-w-0 truncate text-sm", !row.value && "text-muted-foreground")}
                    >
                      {row.value || (row.editKey || row.editable ? "Not set" : "Not decided")}
                    </motion.p>
                  </AnimatePresence>
                  {(row.editKey || row.editable) && !row.suggestionKey && (
                    <button
                      type="button"
                      aria-label={`Edit ${row.label}`}
                      onClick={() => {
                        if (row.id === "dates") {
                          setDStart(tripDates.start);
                          setDEnd(tripDates.end);
                          setEditingDates(true);
                        } else {
                          setEditing(row.editKey!);
                          setDraft(row.value);
                        }
                      }}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {row.suggestionKey && !isEditing && (
                <div className="mt-2 rounded-lg bg-muted px-2 py-1.5">
                  {row.note && <p className="text-[11px] leading-relaxed text-muted-foreground">{row.note}</p>}
                  <div className="mt-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void act(row.suggestionKey!, "confirm")}
                      disabled={busyKey === row.suggestionKey}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-leaf disabled:opacity-60"
                    >
                      <Check className="h-3 w-3" /> Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(row.suggestionKey!, "dismiss")}
                      disabled={busyKey === row.suggestionKey}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
                    >
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {openQuestions.length > 0 && (
        <div className="rounded-xl border border-dashed border-border px-3 py-3">
          <p className="eyebrow">Still open</p>
          <ul className="mt-2 space-y-1.5">
            {openQuestions.map((q) => (
              <li key={q} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                {q}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">The assistant fills these in as you talk — nothing is locked until you confirm it.</p>
        </div>
      )}
    </div>
  );
}
