import { useCallback, useState } from "react";
import { isEmptyDraft, type Draft } from "@/features/bookings/domain/reservation-form";
import type { ReservationDraft } from "@/lib/reservation-draft";

/**
 * Paste a confirmation and let Roam read it into the form. It only fills the fields: the traveller reviews and saves.
 * `onFound` receives what was read (and a return leg, for a round trip) once there is something to fill in.
 */
export function useConfirmationReader({ tripId, onFound }: { tripId: string; onFound: (found: Draft, returnLeg: Draft | null) => void }) {
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPasted("");
    setReadNote(null);
  }, []);

  async function read() {
    const text = pasted.trim();
    if (text.length < 10 || reading) return;
    setReading(true);
    setReadNote(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/reservations/parse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't read that. You can still fill it in by hand.");
      const found = body.draft as ReservationDraft;
      // Text with no booking in it comes back as an empty draft: say so rather than claim it was filled in.
      if (isEmptyDraft(found)) {
        setReadNote("That doesn’t look like a booking confirmation, so nothing was filled in. You can still add it by hand.");
        return;
      }
      onFound(found, (body.returnDraft as Draft | null) ?? null);
      setReadNote(body.returnDraft ? "Filled in from your confirmation. It has a return leg too, which opens next. Check each field before you add it." : "Filled in from your confirmation. Check each field before you add it.");
    } catch (e) {
      setReadNote(e instanceof Error ? e.message : "Couldn't read that. You can still fill it in by hand.");
    } finally {
      setReading(false);
    }
  }

  return { pasted, setPasted, reading, readNote, setReadNote, read, reset };
}
