import { useCallback, useEffect, useRef, useState } from "react";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { noticeBookingsOutside } from "@/lib/application/bookings-outside-notice";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import type { SuggestionKey } from "@/packages/contracts/suggestion";
import { datesError, prefValue, travellersError, type Decision, type PrefKey, type TripField } from "../domain/context-rows";

/**
 * The "What we know" panel's data and edits: the trip's memory and decisions (seeded by the page, re-read after a change), which fact is being
 * edited and its draft, and saving each kind of fact — a preference, the trip's dates, its destination or headcount — or confirming and
 * dismissing a suggestion. A guest can read the panel but is asked to save the trip before editing.
 */
export function useTripContext({ tripId, trip, initialMemory, initialDecisions }: {
  tripId: string;
  trip: { start_date?: string | null; end_date?: string | null; destination?: string | null; travelers?: number | null } | null;
  initialMemory?: Record<string, unknown>;
  initialDecisions?: Array<Record<string, unknown>>;
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
  // The brief highlight on a saved row clears itself; leaving the panel (or a test finishing) must not leave that timer to fire later.
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const flashRow = useCallback((key: string) => {
    setFlash(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1200);
  }, []);

  const [tripDates, setTripDates] = useState({ start: trip?.start_date ?? "", end: trip?.end_date ?? "" });
  const [editingDates, setEditingDates] = useState(false);
  const [dStart, setDStart] = useState("");
  const [dEnd, setDEnd] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  useEffect(() => {
    setTripDates({ start: trip?.start_date ?? "", end: trip?.end_date ?? "" });
  }, [trip?.start_date, trip?.end_date]);

  // Core trip identity — destination and headcount — edited inline the same way as dates.
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
    const invalid = field === "travelers" ? travellersError(value) : null;
    if (invalid) {
      notifyToast(invalid, "error");
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
      flashRow(field);
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

  async function savePref(key: PrefKey, raw: string) {
    setSavingKey(key);
    const value = prefValue(key, raw);
    try {
      const response = await fetch(`/api/trips/${tripId}/memory`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error();
      setMemory((await response.json()).memory ?? {});
      setEditing(null);
      flashRow(key);
      announceWorkspaceChange("preferences");
    } catch {
      notifyToast("Only the trip owner can change this.", "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveDates() {
    const invalid = datesError(dStart, dEnd);
    if (invalid) {
      notifyToast(invalid, "error");
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
      noticeBookingsOutside(await response.json().catch(() => null));
      setTripDates({ start: dStart, end: dEnd });
      setEditingDates(false);
      flashRow("dates");
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
        flashRow(`sugg-${key}`);
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

  return {
    memory, decisions, editing, setEditing, draft, setDraft, savingKey, busyKey, flash,
    tripDates, editingDates, setEditingDates, dStart, setDStart, dEnd, setDEnd, savingDates,
    tripFacts, editingField, setEditingField, fieldDraft, setFieldDraft, savingField,
    guard, saveTripField, savePref, saveDates, act,
  };
}
