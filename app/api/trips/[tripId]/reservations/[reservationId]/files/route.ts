import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { MAX_FILES_PER_RESERVATION, RESERVATION_FILES_BUCKET, fileProblem, isOwnFile, reservationFolder, safeFileName } from "@/lib/reservation-files";
import { RESERVATION_COLUMNS, readAttachments, toReservation } from "@/packages/contracts/reservation";

type Ctx = { params: Promise<{ tripId: string; reservationId: string }> };

const fileMeta = z.object({ name: z.string().min(1).max(200), size: z.number().int().positive(), type: z.string().min(1).max(100) });
const registered = fileMeta.extend({ path: z.string().min(1).max(400) });

async function load(supabase: Awaited<ReturnType<typeof requireTripMember>>["supabase"], tripId: string, reservationId: string) {
  const result = await supabase.from("trip_reservations").select(RESERVATION_COLUMNS).eq("trip_id", tripId).eq("id", reservationId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

/** A short-lived link to open one attached file (the bucket is private). */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { tripId, reservationId } = await params;
    const { supabase } = await requireTripMember(tripId);
    const path = new URL(request.url).searchParams.get("path") ?? "";
    if (!isOwnFile(path, tripId, reservationId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const signed = await supabase.storage.from(RESERVATION_FILES_BUCKET).createSignedUrl(path, 600);
    if (signed.error || !signed.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.redirect(signed.data.signedUrl, 302);
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That file is unavailable right now");
  }
}

/** Step 1 of an upload: check the file, then hand back a one-time upload link so the browser sends the bytes straight to storage. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { tripId, reservationId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = fileMeta.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    const row = await load(supabase, tripId, reservationId);
    if (!row) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    const problem = fileProblem(parsed.data, readAttachments(row.attachments).length);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const path = `${reservationFolder(tripId, reservationId)}${randomUUID().slice(0, 8)}-${safeFileName(parsed.data.name)}`;
    const upload = await supabase.storage.from(RESERVATION_FILES_BUCKET).createSignedUploadUrl(path);
    if (upload.error || !upload.data) throw upload.error ?? new Error("No upload link");
    return NextResponse.json({ path, token: upload.data.token });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That file couldn't be uploaded");
  }
}

/** Step 2: the browser finished uploading; confirm the object is really there, then record it on the reservation. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { tripId, reservationId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = registered.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isOwnFile(parsed.data.path, tripId, reservationId)) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    const row = await load(supabase, tripId, reservationId);
    if (!row) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    const current = readAttachments(row.attachments);
    if (current.length >= MAX_FILES_PER_RESERVATION) return NextResponse.json({ error: "Too many files" }, { status: 400 });
    const name = parsed.data.path.split("/")[2]!;
    const found = await supabase.storage.from(RESERVATION_FILES_BUCKET).list(reservationFolder(tripId, reservationId).slice(0, -1), { search: name });
    const stored = found.data?.find((o) => o.name === name);
    if (found.error || !stored) return NextResponse.json({ error: "The upload didn't finish" }, { status: 409 });
    // Trust what storage actually holds, not what the browser declared: the type and size checked at
    // step 1 were the client's own claim. (Falls back to the claim only if storage returns no metadata.)
    const storedMeta = (stored.metadata ?? {}) as { size?: number; mimetype?: string };
    const actual = { name: parsed.data.name, size: Number(storedMeta.size) > 0 ? Number(storedMeta.size) : parsed.data.size, type: typeof storedMeta.mimetype === "string" && storedMeta.mimetype ? storedMeta.mimetype : parsed.data.type };
    const problem = fileProblem(actual, current.length);
    if (problem) {
      await supabase.storage.from(RESERVATION_FILES_BUCKET).remove([parsed.data.path]);
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    const attachments = [...current.filter((f) => f.path !== parsed.data.path), { path: parsed.data.path, name: parsed.data.name, size: actual.size, type: actual.type }];
    const result = await supabase.from("trip_reservations").update({ attachments }).eq("trip_id", tripId).eq("id", reservationId).select(RESERVATION_COLUMNS).single();
    if (result.error) throw result.error;
    return NextResponse.json({ reservation: toReservation(result.data) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That file couldn't be saved");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { tripId, reservationId } = await params;
    const { supabase } = await requireTripMember(tripId, { role: "editor" });
    const parsed = z.object({ path: z.string().min(1).max(400) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isOwnFile(parsed.data.path, tripId, reservationId)) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    const row = await load(supabase, tripId, reservationId);
    if (!row) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    const attachments = readAttachments(row.attachments).filter((f) => f.path !== parsed.data.path);
    const removed = await supabase.storage.from(RESERVATION_FILES_BUCKET).remove([parsed.data.path]);
    if (removed.error) throw removed.error;
    const result = await supabase.from("trip_reservations").update({ attachments }).eq("trip_id", tripId).eq("id", reservationId).select(RESERVATION_COLUMNS).single();
    if (result.error) throw result.error;
    return NextResponse.json({ reservation: toReservation(result.data) });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "That file couldn't be removed");
  }
}
