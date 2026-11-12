"use client";

import {
  Ban, BedDouble, CalendarDays, Car, Check, Clock, Compass, Home, MapPin, PartyPopper, Pencil, PlaneLanding,
  Plus, Sparkles, Users, Utensils, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import { useTripContext } from "../application/useTripContext";
import { buildRows, groupRows, type PrefKey, type Row } from "../domain/context-rows";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { DateRangeField } from "@/components/DateRangeField";

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

/** One plain line icon per fact. No tinted chips: the list is read by its words, and colour is kept for what needs the traveller. */
const ROW_ICON: Record<string, LucideIcon> = {
  destination: MapPin,
  length: Clock,
  travellers: Users,
  dates: CalendarDays,
  occasion: PartyPopper,
  budget: Wallet,
  group: Users,
  pace: Zap,
  interests: Sparkles,
  base_area: Home,
  getting_around: Car,
  arrival: PlaneLanding,
  dislikes: Ban,
  dietary: Utensils,
  stay: BedDouble,
};

const FIELD = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-foreground/30 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent)] [color-scheme:light_dark]";
const SECTION_LABEL = "mb-1 px-1 text-xs font-medium text-muted-foreground";

/** Save, Cancel and (for dates) Clear, the same under every editor. */
function EditorActions({ saving, onSave, onCancel, onClear }: { saving: boolean; onSave: () => void; onCancel: () => void; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-0.5">
      <button type="button" onClick={onSave} disabled={saving} className="btn-primary-sm">
        {saving ? "…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
        Cancel
      </button>
      {onClear && (
        <button type="button" onClick={onClear} className="ml-auto text-xs text-muted-foreground transition-colors hover:text-destructive">
          Clear
        </button>
      )}
    </div>
  );
}

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
  const {
    memory, decisions, editing, setEditing, draft, setDraft, savingKey, busyKey, flash,
    tripDates, editingDates, setEditingDates, dStart, setDStart, dEnd, setDEnd, savingDates,
    tripFacts, editingField, setEditingField, fieldDraft, setFieldDraft, savingField,
    guard, saveTripField, savePref, saveDates, act,
  } = useTripContext({ tripId, trip, initialMemory, initialDecisions });
  const rows = buildRows({ trip, tripFacts, tripDates, memory, decisions });
  const isRowEditing = (row: Row) =>
    row.id === "dates" ? editingDates : row.tripField ? editingField === row.tripField : editing != null && editing === row.editKey;
  const { confirmed: confirmedRows, suggested: suggestedRows, undecided: undecidedRows } = groupRows(rows);
  const setCount = confirmedRows.length;
  // The meter: what is settled in ink, what waits on the traveller in coral, the rest is the empty track.
  const share = (n: number) => (rows.length ? `${(n / rows.length) * 100}%` : "0%");

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

  const renderRow = (row: Row) => {
    const isEditing = isRowEditing(row);
    const Icon = ROW_ICON[row.id] ?? Compass;
    const flashId = row.tripField ?? (row.suggestionKey ? `sugg-${row.suggestionKey}` : row.editKey ?? row.id);
    const canEdit = Boolean(row.editKey || row.editable || row.tripField);
    return (
      <div key={row.id} className={cn("group/row flex items-start gap-3.5 py-3.5 transition-colors duration-500", flash === flashId && "bg-leaf-soft/40")}>
        <Icon aria-hidden strokeWidth={1.5} className={cn("mt-[1px] size-[1.125rem] shrink-0", row.certainty === "suggested" ? "text-coral" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <p className="min-w-0 text-xs text-muted-foreground">{row.label}</p>
          {isEditing && row.id === "dates" ? (
            <div className="mt-2 space-y-2">
              <DateRangeField start={dStart} end={dEnd} onChange={(s, e) => { setDStart(s); setDEnd(e); }} />
              <EditorActions
                saving={savingDates}
                onSave={() => void saveDates()}
                onCancel={() => setEditingDates(false)}
                onClear={dStart || dEnd ? () => { setDStart(""); setDEnd(""); } : undefined}
              />
            </div>
          ) : isEditing && row.tripField === "destination" ? (
            <div className="mt-2 space-y-2">
              <DestinationCombobox
                tripId={tripId}
                value={fieldDraft}
                onChange={setFieldDraft}
                onSelect={(text) => { setFieldDraft(text); void saveTripField("destination", text); }}
                placeholder="City or region"
                autoFocus
                disabled={savingField}
              />
              <EditorActions saving={savingField} onSave={() => void saveTripField("destination", fieldDraft)} onCancel={() => setEditingField(null)} />
            </div>
          ) : isEditing && row.tripField ? (
            <div className="mt-2 space-y-2">
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
                className={FIELD}
              />
              <EditorActions saving={savingField} onSave={() => void saveTripField(row.tripField!, fieldDraft)} onCancel={() => setEditingField(null)} />
            </div>
          ) : isEditing ? (
            <div className="mt-2 space-y-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void savePref(row.editKey!, draft);
                  if (e.key === "Escape") setEditing(null);
                }}
                placeholder={PREF_PLACEHOLDER[row.editKey!]}
                className={FIELD}
              />
              <EditorActions saving={savingKey === row.editKey} onSave={() => void savePref(row.editKey!, draft)} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div className="mt-0.5 flex items-start justify-between gap-2">
              {/* A value is often "X to Y" or a full name ("Driving between Niagara Falls an…", "Bakal Tulum · Booking on Bakal Tulum H…"):
                  cutting it to one line lost the half that made it legible, so it wraps to two. */}
              <p className={cn("min-w-0 line-clamp-2 text-sm leading-[1.4]", !row.value && "text-muted-foreground")}>
                {row.value || (canEdit ? "Not set" : "Not decided")}
              </p>
              {canEdit && !row.suggestionKey && (
                <button
                  type="button"
                  aria-label={`Edit ${row.label}`}
                  onClick={() => startEdit(row)}
                  // Quiet until the row is hovered or focused; always there on a touch screen, where nothing hovers.
                  className="hit-44 -my-1.5 -mr-1.5 grid size-8 shrink-0 max-lg:-my-2.5 max-lg:-mr-3 max-lg:size-10 place-items-center rounded-full text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}

          {row.note && !row.suggestionKey && !isEditing && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{row.note}</p>}
          {row.suggestionKey && !isEditing && (
            <div className="mt-1.5">
              {row.note && <p className="text-xs leading-relaxed text-muted-foreground">{row.note}</p>}
              <div className="mt-2.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void act(row.suggestionKey!, "confirm")}
                  disabled={busyKey === row.suggestionKey}
                  className="btn-primary-sm"
                >
                  <Check className="size-3" aria-hidden /> Confirm
                </button>
                <button
                  type="button"
                  onClick={() => void act(row.suggestionKey!, "dismiss")}
                  disabled={busyKey === row.suggestionKey}
                  className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground disabled:opacity-60"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-w-0 space-y-7">
      <header className="px-1 pt-1">
        <h3 className="font-display text-2xl leading-8 tracking-tight">What we know</h3>
        <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">
          {setCount === 0 ? "Nothing locked in yet" : `${setCount} locked in`}
          {suggestedRows.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-coral-ink">{suggestedRows.length} needs you</span>
            </>
          )}
          {undecidedRows.length > 0 && ` · ${undecidedRows.length} still open`}
        </p>
        <div aria-hidden className="mt-3.5 flex h-[3px] overflow-hidden rounded-full bg-border/70">
          <i className="h-full bg-ink transition-[width] duration-500 ease-out" style={{ width: share(setCount) }} />
          <i className="h-full bg-coral transition-[width] duration-500 ease-out" style={{ width: share(suggestedRows.length) }} />
        </div>
      </header>

      {/* Locked in */}
      {confirmedRows.length > 0 && (
        <section className="-mt-5 divide-y divide-border/60 px-1">{confirmedRows.map(renderRow)}</section>
      )}

      {/* Suggested by the assistant */}
      {suggestedRows.length > 0 && (
        <section>
          <p className={cn(SECTION_LABEL, "text-coral-ink")}>Needs your call</p>
          <div className="mx-1 divide-y divide-coral/15 rounded-2xl bg-coral-soft/60 px-4">{suggestedRows.map(renderRow)}</div>
        </section>
      )}

      {/* To decide */}
      {undecidedRows.length > 0 && (
        <section>
          <p className={cn(SECTION_LABEL, "mb-2.5")}>Still open</p>
          <div className="flex flex-wrap gap-2 px-1">
            {undecidedRows.map((row) => {
              if (!(row.editKey || row.editable)) {
                return (
                  <span key={row.id} className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-sm text-muted-foreground">
                    {row.label}
                  </span>
                );
              }
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => startEdit(row)}
                  aria-pressed={isRowEditing(row)}
                  className="hit-44 inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card pr-3.5 pl-3 text-sm text-ink-soft transition-[border-color,color,background-color,transform] duration-150 hover:border-foreground/30 hover:text-foreground active:scale-[0.97] aria-pressed:border-foreground/40 aria-pressed:text-foreground"
                >
                  <Plus className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  {row.label}
                </button>
              );
            })}
          </div>
          {/* Inline editor for whichever undecided row is being edited */}
          {undecidedRows.filter(isRowEditing).map((row) => (
            <div key={`edit-${row.id}`} className="mx-1 mt-3 rounded-2xl border border-border/60 bg-card px-4">
              {renderRow(row)}
            </div>
          ))}
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
            Tap one to set it now, or just keep talking — Roam fills these in as you plan.
          </p>
        </section>
      )}
    </div>
  );
}
