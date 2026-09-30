import { z } from "zod";
import type { ReservationFile } from "@/lib/reservation-files";

export const RESERVATION_KINDS = ["stay", "flight", "train", "activity", "dining", "other"] as const;
export type ReservationKind = (typeof RESERVATION_KINDS)[number];

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-12");
const clock = z.string().regex(/^[0-2]\d:[0-5]\d$/, "Use a time like 19:30");
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

/** What the client sends to add or edit a reservation. */
export const reservationInput = z
  .object({
    kind: z.enum(RESERVATION_KINDS),
    title: z.string().trim().min(1, "Give it a name").max(160),
    startsOn: z.preprocess((v) => (v === "" ? null : v), isoDay.nullable().optional()),
    endsOn: z.preprocess((v) => (v === "" ? null : v), isoDay.nullable().optional()),
    startTime: z.preprocess((v) => (v === "" ? null : v), clock.nullable().optional()),
    place: optionalText(200),
    confirmationCode: optionalText(80),
    amount: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().min(0).max(10_000_000).nullable()),
    currency: optionalText(8),
    notes: optionalText(1000),
  })
  .refine((v) => !v.endsOn || !v.startsOn || v.endsOn >= v.startsOn, { message: "The end date is before the start", path: ["endsOn"] });
export type ReservationInput = z.infer<typeof reservationInput>;

export type Reservation = {
  id: string;
  kind: ReservationKind;
  title: string;
  startsOn: string | null;
  endsOn: string | null;
  startTime: string | null;
  place: string | null;
  confirmationCode: string | null;
  amount: number | null;
  currency: string | null;
  notes: string | null;
  attachments: ReservationFile[];
  createdAt: string;
};

type ReservationRow = {
  id: string;
  kind: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  place: string | null;
  confirmation_code: string | null;
  amount: number | string | null;
  currency: string | null;
  notes: string | null;
  attachments?: unknown;
  created_at: string;
};

export const RESERVATION_COLUMNS = "id,kind,title,starts_on,ends_on,start_time,place,confirmation_code,amount,currency,notes,attachments,created_at";

export function readAttachments(value: unknown): ReservationFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const f = entry as Partial<ReservationFile> | null;
    return f && typeof f.path === "string" && typeof f.name === "string" ? [{ path: f.path, name: f.name, size: typeof f.size === "number" ? f.size : 0, type: typeof f.type === "string" ? f.type : "" }] : [];
  });
}

/** DB row (snake_case) to API shape (camelCase). */
export function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    kind: row.kind as ReservationKind,
    title: row.title,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    startTime: row.start_time,
    place: row.place,
    confirmationCode: row.confirmation_code,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency,
    notes: row.notes,
    attachments: readAttachments(row.attachments),
    createdAt: row.created_at,
  };
}

/** API input to DB columns. */
export function toReservationRow(input: ReservationInput) {
  return {
    kind: input.kind,
    title: input.title,
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    start_time: input.startTime ?? null,
    place: input.place ?? null,
    confirmation_code: input.confirmationCode ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    notes: input.notes ?? null,
  };
}
