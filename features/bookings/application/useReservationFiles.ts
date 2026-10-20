import { useCallback, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { RESERVATION_FILES_BUCKET, fileProblem, type ReservationFile } from "@/lib/reservation-files";
import type { Reservation } from "@/packages/contracts/reservation";

/**
 * The tickets and confirmations attached to a booking. On one being edited they go up at once; on a new one they wait here until it exists
 * (the sheet then sends each with `uploadOne`).
 */
export function useReservationFiles({ tripId, editing, onSaved }: { tripId: string; editing: Reservation | null; onSaved: (reservation: Reservation) => void }) {
  // Files already on the reservation, and (for a new one) files waiting for it to be created first.
  const [files, setFiles] = useState<ReservationFile[]>([]);
  const [staged, setStaged] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = useCallback((attachments: ReservationFile[]) => {
    setFiles(attachments);
    setStaged([]);
    setFileError(null);
  }, []);

  /** Send one file straight to storage with a one-time link from the API, then record it on the reservation. */
  async function uploadOne(reservationId: string, file: File): Promise<Reservation> {
    const base = `/api/trips/${tripId}/reservations/${reservationId}/files`;
    const init = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, type: file.type }) });
    const initBody = await init.json().catch(() => ({}));
    if (!init.ok) throw new Error(initBody.error ?? "That file couldn't be uploaded.");
    const sent = await createSupabaseBrowserClient().storage.from(RESERVATION_FILES_BUCKET).uploadToSignedUrl(initBody.path, initBody.token, file, { contentType: file.type });
    if (sent.error) throw new Error("That file couldn't be uploaded.");
    const done = await fetch(base, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: initBody.path, name: file.name, size: file.size, type: file.type }) });
    const doneBody = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(doneBody.error ?? "That file couldn't be saved.");
    return doneBody.reservation as Reservation;
  }

  async function pick(list: FileList | File[]) {
    const chosen = Array.from(list);
    if (chosen.length === 0) return;
    setFileError(null);
    let count = editing ? files.length : staged.length;
    const ok: File[] = [];
    for (const file of chosen) {
      const problem = fileProblem(file, count);
      if (problem) {
        setFileError(`${file.name}: ${problem}`);
        continue;
      }
      ok.push(file);
      count += 1;
    }
    if (ok.length === 0) return;
    if (!editing) return setStaged((current) => [...current, ...ok]);
    setUploading(true);
    try {
      for (const file of ok) {
        const updated = await uploadOne(editing.id, file);
        setFiles(updated.attachments);
        onSaved(updated);
      }
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "That file couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(file: ReservationFile) {
    if (!editing) return;
    setFileError(null);
    const res = await fetch(`/api/trips/${tripId}/reservations/${editing.id}/files`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: file.path }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setFileError(body.error ?? "That file couldn't be removed.");
    setFiles(body.reservation.attachments);
    onSaved(body.reservation as Reservation);
  }

  return { files, staged, setStaged, uploading, fileError, uploadOne, pick, removeFile, reset };
}
