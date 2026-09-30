"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";
import { certaintyFor, decisionSummary, isDisplayableDecision } from "@/lib/decisions-ui";
import { CertaintyBadge } from "@/components/CertaintyBadge";
import { ProgressRing } from "@/components/ProgressRing";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { DateRangeField } from "@/components/DateRangeField";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { tripCompleteness, type Certainty } from "@/lib/design";
import { readStayDecision } from "@/packages/contracts/stay";
import { readSuggestions, type SuggestionKey } from "@/packages/contracts/suggestion";

type Decision = { id: string; kind: string; value: Record<string, unknown>; source: string; created_at?: string };
type PrefKey = "budget" | "groupType" | "pace" | "interests" | "dislikes" | "dietaryNeeds" | "occasion" | "arrival" | "transport";

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
  occasion: "birthday, honeymoon, reunion…",
  arrival: "flight number, or landing time",
  transport: "rental car, transit, rideshare…",
};

type Row = {
  id: string;
  label: string;
  value: string;
  certainty: Certainty;
  editKey?: PrefKey;
  /** Editable but not through the memory PUT — currently just the trip date range. */
  editable?: boolean;
  /** A core trip column edited via PATCH /api/trips/[id]. */
  tripField?: "destination" | "travelers";
  suggestionKey?: SuggestionKey;
  note?: string;
};

export function TripContextSurface({
  tripId,
  trip,
  initialMemory,
  initialDecisions,
  itinerary = [],
  savedPlaces = [],
  essentials = [],
  conversation = [],
}: {
  tripId: string;
  trip: Trip | null;
  initialMemory?: Record<string, unknown>;
  initialDecisions?: Array<Record<string, unknown>>;
  /** Same workspace snapshot the trip shell's own progress ring uses — kept identical here so the
   *  two "how complete is this trip" numbers shown to the user never disagree (see lib/design.ts). */
  itinerary?: unknown[];
  savedPlaces?: unknown[];
  essentials?: unknown[];
  conversation?: unknown[];
}) {
  const [memory, setMemory] = useState<Record<string, unknown>>(initialMemory ?? {});
  const [decisions, setDecisions] = useState<Decision[]>((initialDecisions ?? []) as Decision[]);
  // A collaborator's edit lands here as a fresh `initialMemory`/`initialDecisions` prop (via the
  // realtime bus -> router.refresh() -> a re-rendered server parent), but useState's initializer
  // only runs once — without this, this panel would keep showing what was true at first mount.
  useEffect(() => {
    if (initialMemory) setMemory(initialMemory);
  }, [initialMemory]);
  useEffect(() => {
    if (initialDecisions) setDecisions(initialDecisions as Decision[]);
  }, [initialDecisions]);
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

  // Core trip identity — destination and headcount — edited inline the same way as dates.
  type TripField = "destination" | "travelers";
  const [tripFacts, setTripFacts] = useState({ destination: trip?.destination ?? "", travelers: trip?.travelers ?? null as number | null });
  const [editingField, setEditingField] = useState<TripField | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [savingField, setSavingField] = useState(false);
  useEffect(() => {
    setTripFacts({ destination: trip?.destination ?? "", travelers: trip?.travelers ?? null });
  }, [trip?.destination, trip?.travelers]);

  // A guest reads this panel (Roam fills it in as they talk) but can't edit the trip itself.
  const { guest, openGate } = useGuest();
  const guard = () => {
    if (!guest) return false;
    openGate("edit your trip details");
    return true;
  };

  async function saveTripField(field: TripField, raw: string) {
    const value = raw.trim();
    if (field === "travelers" && value && !/^\d+$/.test(value)) {
      notifyToast("Enter the number of travellers as a whole number.", "error");
      return;
    }
    setSavingField(true);
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(field === "destination" ? { destination: value } : { travelerCount: value ? Number(value) : null }),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { trip?: { destination?: string; travelers?: number | null } };
      setTripFacts((prev) => ({
        destination: body.trip?.destination ?? prev.destination,
        travelers: body.trip?.travelers ?? (field === "travelers" && value ? Number(value) : prev.travelers),
      }));
      setEditingField(null);
      setFlash(field);
      setTimeout(() => setFlash(null), 1200);
      announceWorkspaceChange("preferences");
    } catch {
      notifyToast("Only the trip owner can change this.", "error");
    } finally {
      setSavingField(false);
    }
  }

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
  const realDecisions = decisions.filter((d) => isDisplayableDecision(d.kind));

  const progress = useMemo(
    () => tripCompleteness({ preferences: memory, decisions: decisions.filter((d) => d.kind !== "suggestion"), conversation, itinerary, savedPlaces, essentials }),
    [memory, decisions, conversation, itinerary, savedPlaces, essentials],
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
      notifyToast("Only the trip owner can change this.", "error");
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
      if (!response.ok) throw new Error();
      setTripDates({ start: dStart, end: dEnd });
      setEditingDates(false);
      setFlash("dates");
      setTimeout(() => setFlash(null), 1200);
      announceWorkspaceChange("preferences");
    } catch {
      notifyToast("Those dates didn’t save. Try again.", "error");
    } finally {
      setSavingDates(false);
    }
  }

  async function act(key: SuggestionKey, action: "confirm" | "dismiss") {
    if (guard()) return;
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
      notifyToast("That didn’t save. Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  // --- Build the ordered field list ---------------------------------------------
  const rows: Row[] = [];
  const push = (r: Row) => rows.push(r);

  if (tripFacts.destination) {
    push({ id: "destination", label: "Destination", value: tripFacts.destination, certainty: "confirmed", tripField: "destination" });
  } else {
    // A place only ever implied ("I want to see the Eiffel Tower"), never stated as the
    // destination outright — confirm before it becomes the trip, same as any inferred fact.
    const s = suggestionFor("destination");
    if (s) push({ id: "destination", label: "Destination", value: s.display, certainty: "suggested", suggestionKey: "destination", note: s.rationale });
    else push({ id: "destination", label: "Destination", value: "", certainty: "undecided", tripField: "destination" });
  }

  if (trip?.duration_days) {
    push({ id: "length", label: "Trip length", value: `${trip.duration_days} days`, certainty: "confirmed" });
  } else {
    const s = suggestionFor("trip_length");
    if (s) push({ id: "length", label: "Trip length", value: s.display, certainty: "suggested", suggestionKey: "trip_length", note: s.rationale });
    else push({ id: "length", label: "Trip length", value: "", certainty: "undecided" });
  }
  // "Solo" already answers headcount unambiguously — don't leave this stuck in "to decide"
  // (and thus looking unknown) when the chat already locked in who's travelling.
  const impliedSoloCount = /\bsolo\b/i.test(csv(memory.groupType)) ? 1 : null;
  if (tripFacts.travelers) {
    push({ id: "travellers", label: "Travellers", value: `${tripFacts.travelers}`, certainty: "confirmed", tripField: "travelers" });
  } else if (impliedSoloCount) {
    push({ id: "travellers", label: "Travellers", value: "1 (solo)", certainty: "confirmed", tripField: "travelers" });
  } else {
    // A headcount only ever guessed at (a booking for N, never "there are N of us") — surfaced
    // as a suggestion to confirm rather than saved outright, same as any other inferred fact.
    const s = suggestionFor("travelers");
    if (s) push({ id: "travellers", label: "Travellers", value: s.display, certainty: "suggested", suggestionKey: "travelers", note: s.rationale });
    else push({ id: "travellers", label: "Travellers", value: "", certainty: "undecided", tripField: "travelers" });
  }

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

  softField("occasion", "Occasion", csv(memory.occasion), "occasion", "occasion");
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
    "transport",
  );
  softField("arrival", "Arrival", csv(memory.arrival), "arrival", "arrival");

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

  const confirmedRows = rows.filter((r) => r.certainty === "confirmed");
  const suggestedRows = rows.filter((r) => r.certainty === "suggested");
  const undecidedRows = rows.filter((r) => r.certainty === "undecided");
  const setCount = confirmedRows.length;

  const renderRow = (row: Row) => {
    const isEditing = row.id === "dates"
      ? editingDates
      : row.tripField
        ? editingField === row.tripField
        : editing != null && editing === row.editKey;
    const flashId = row.tripField ?? (row.suggestionKey ? `sugg-${row.suggestionKey}` : row.editKey ?? row.id);
    return (
      <div
        key={row.id}
        className={cn(
          "group/row px-4 py-3 transition-colors",
          row.certainty === "suggested" ? "bg-coral-soft/25" : "hover:bg-accent/30",
          flash === flashId && "bg-leaf-soft/40",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{row.label}</p>
          {row.certainty === "suggested" && <CertaintyBadge certainty={row.certainty} />}
        </div>

        {isEditing && row.id === "dates" ? (
                <div className="mt-1.5 space-y-1.5">
                  <DateRangeField start={dStart} end={dEnd} onChange={(s, e) => { setDStart(s); setDEnd(e); }} />
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
              ) : isEditing && row.tripField === "destination" ? (
                <div className="mt-1.5 space-y-1.5">
                  <DestinationCombobox
                    tripId={tripId}
                    value={fieldDraft}
                    onChange={setFieldDraft}
                    onSelect={(text) => { setFieldDraft(text); void saveTripField("destination", text); }}
                    placeholder="City or region"
                    autoFocus
                    disabled={savingField}
                  />
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => void saveTripField("destination", fieldDraft)} disabled={savingField} className="btn-primary-sm">
                      {savingField ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingField(null)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : isEditing && row.tripField ? (
                <div className="mt-1.5 space-y-1.5">
                  <input
                    autoFocus
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={fieldDraft}
                    onChange={(e) => setFieldDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveTripField(row.tripField!, fieldDraft);
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    placeholder="How many of you"
                    className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/25"
                  />
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => void saveTripField(row.tripField!, fieldDraft)} disabled={savingField} className="btn-primary-sm">
                      {savingField ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingField(null)} className="text-[11px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
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
                    className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none [color-scheme:light_dark] focus:ring-2 focus:ring-ring/25"
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
                  <p className={cn("min-w-0 truncate text-sm", !row.value && "text-muted-foreground")}>
                    {row.value || (row.editKey || row.editable || row.tripField ? "Not set" : "Not decided")}
                  </p>
                  {(row.editKey || row.editable || row.tripField) && !row.suggestionKey && (
                    <button
                      type="button"
                      aria-label={`Edit ${row.label}`}
                      onClick={() => {
                        if (guard()) return;
                        if (row.id === "dates") {
                          setDStart(tripDates.start);
                          setDEnd(tripDates.end);
                          setEditingDates(true);
                        } else if (row.tripField) {
                          setEditingField(row.tripField);
                          setFieldDraft(row.value);
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
          <div className="mt-2">
            {row.note && <p className="text-[11px] leading-relaxed text-muted-foreground">{row.note}</p>}
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void act(row.suggestionKey!, "confirm")}
                disabled={busyKey === row.suggestionKey}
                className="inline-flex items-center gap-1 rounded-full bg-leaf px-2.5 py-1 text-[11px] font-semibold text-background disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> Confirm
              </button>
              <button
                type="button"
                onClick={() => void act(row.suggestionKey!, "dismiss")}
                disabled={busyKey === row.suggestionKey}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                <X className="h-3 w-3" /> Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const startEdit = (row: Row) => {
    if (guard()) return;
    if (row.id === "dates") {
      setDStart(tripDates.start);
      setDEnd(tripDates.end);
      setEditingDates(true);
    } else if (row.tripField) {
      setEditingField(row.tripField);
      setFieldDraft(row.value);
    } else if (row.editKey) {
      setEditing(row.editKey);
      setDraft(row.value);
    }
  };
  const isRowEditing = (row: Row) =>
    row.id === "dates" ? editingDates : row.tripField ? editingField === row.tripField : editing != null && editing === row.editKey;

  return (
    <div className="min-w-0 space-y-4">
      {/* Hero — clean card, the ring carries the colour */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-[0_1px_3px_color-mix(in_oklab,var(--color-ink)_7%,transparent)]">
        <div>
          <h3 className="font-display text-lg leading-tight">What we know</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {setCount === 0 ? "Nothing locked in yet" : `${setCount} thing${setCount === 1 ? "" : "s"} locked in`}
          </p>
        </div>
        {/* A separate, coarser "how far along is the whole trip" score (saved places, itinerary,
            decisions, etc.) — not a percentage of the facts listed below, so it gets its own
            caption rather than sitting unlabeled next to a count it doesn't correspond to. */}
        <div className="flex flex-col items-center gap-1">
          <ProgressRing value={progress} size={56} />
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Trip progress</span>
        </div>
      </div>

      {/* Locked in */}
      {confirmedRows.length > 0 && (
        <section>
          <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Locked in</p>
          <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {confirmedRows.map(renderRow)}
          </div>
        </section>
      )}

      {/* Suggested by the assistant */}
      {suggestedRows.length > 0 && (
        <section>
          <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.16em] text-coral uppercase">Suggested — confirm or dismiss</p>
          <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-coral/25 bg-card">
            {suggestedRows.map(renderRow)}
          </div>
        </section>
      )}

      {/* To decide */}
      {undecidedRows.length > 0 && (
        <section>
          <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">To decide</p>
          <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-3">
            <div className="flex flex-wrap gap-1.5">
              {undecidedRows.map((row) => {
                const canEdit = Boolean(row.editKey || row.editable);
                if (canEdit) {
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => startEdit(row)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        isRowEditing(row)
                          ? "border-coral bg-coral-soft text-coral"
                          : "border-border bg-background text-foreground hover:border-coral/50 hover:text-coral",
                      )}
                    >
                      <Pencil className="h-3 w-3" /> {row.label}
                    </button>
                  );
                }
                return (
                  <span key={row.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                    {row.label}
                  </span>
                );
              })}
            </div>
            {/* Inline editor for whichever undecided row is being edited */}
            {undecidedRows.filter(isRowEditing).map((row) => (
              <div key={`edit-${row.id}`} className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-background">
                {renderRow(row)}
              </div>
            ))}
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
              Tap one to set it now, or just keep talking — Roam fills these in as you plan.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
