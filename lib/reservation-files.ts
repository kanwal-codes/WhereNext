/** Rules for files attached to a reservation. Shared by the API (which enforces them) and the sheet (which checks first). */

export const RESERVATION_FILES_BUCKET = "reservation-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_RESERVATION = 10;
const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export type ReservationFile = { path: string; name: string; size: number; type: string };

/** A message for a file that can't be attached, or null when it can. */
export function fileProblem(file: { name: string; size: number; type: string }, existingCount = 0): string | null {
  if (existingCount >= MAX_FILES_PER_RESERVATION) return `You can attach up to ${MAX_FILES_PER_RESERVATION} files.`;
  if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) return "Attach a PDF or a photo (JPG, PNG, WebP, HEIC).";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return `That file is over ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** A name that is safe in a storage path: no folders, no odd characters, never empty. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.-]+/, "").slice(-100);
  return cleaned || "file";
}

export const reservationFolder = (tripId: string, reservationId: string): string => `${tripId}/${reservationId}/`;

/** True only for a path inside this reservation's own folder, with no way out of it. */
export function isOwnFile(path: string, tripId: string, reservationId: string): boolean {
  return path.startsWith(reservationFolder(tripId, reservationId)) && !path.includes("..") && path.split("/").length === 3;
}

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
