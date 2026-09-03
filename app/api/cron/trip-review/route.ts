import { NextResponse } from "next/server";
import { fail } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { sendEmail } from "@/lib/server/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTripContext } from "@/lib/application/trip-context";
import { reviewTrip, pendingNotifications, type ReviewFinding } from "@/lib/application/trip-review";

export const runtime = "nodejs";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

function digest(tripId: string, tripName: string, findings: ReviewFinding[]) {
  const link = `${siteUrl()}/trips/${tripId}`;
  const lines = findings.map((f) => `• ${f.title} — ${f.detail}`);
  return {
    subject: `${findings.length} thing${findings.length === 1 ? "" : "s"} to check before ${tripName}`,
    text: `A quick review of ${tripName} turned up:\n\n${lines.join("\n")}\n\nOpen the trip: ${link}`,
    html: `<p>A quick review of <strong>${tripName}</strong> turned up:</p>
<ul>${findings.map((f) => `<li><strong>${f.title}</strong> — ${f.detail}</li>`).join("")}</ul>
<p><a href="${link}">Open the trip</a></p>`,
  };
}

/**
 * Sweep upcoming dated trips, run the review, and email each owner a one-time
 * digest of new warn-level findings. Auth: `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron sends this automatically when CRON_SECRET is set on the project).
 * GET and POST both work — Vercel Cron uses GET, `curl` tests use either.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = createSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const trips = await admin.from("trips").select("id,name,owner_id").gte("start_date", today).lte("start_date", soon);
    if (trips.error) throw trips.error;

    let flagged = 0;
    let emailed = 0;
    for (const trip of trips.data ?? []) {
      const ctx = await loadTripContext(admin, trip.id).catch(() => null);
      if (!ctx) continue;
      const findings = reviewTrip(ctx);
      if (findings.length) flagged += 1;

      const decisions = await admin
        .from("trip_decisions")
        .select("kind,value")
        .eq("trip_id", trip.id)
        .in("kind", ["review_dismissed", "review_notified"]);
      const dismissed = new Set<string>(
        (decisions.data ?? []).filter((d) => d.kind === "review_dismissed").map((d) => (d.value as { id?: string })?.id).filter((x): x is string => !!x),
      );
      const notified = new Set<string>(
        ((decisions.data ?? []).find((d) => d.kind === "review_notified")?.value as { ids?: string[] } | undefined)?.ids ?? [],
      );

      const pending = pendingNotifications(findings, notified, dismissed);
      if (pending.length) {
        const owner = await admin.auth.admin.getUserById(trip.owner_id).then((r) => r.data.user, () => null);
        const sent = owner?.email ? await sendEmail({ to: owner.email, ...digest(trip.id, trip.name, pending) }).catch(() => false) : false;
        if (sent) {
          emailed += 1;
          await admin.from("trip_decisions").upsert(
            { trip_id: trip.id, kind: "review_notified", source: "assistant", idempotency_key: `review_notified:${trip.id}`, value: { ids: [...notified, ...pending.map((f) => f.id)] } },
            { onConflict: "trip_id,idempotency_key" },
          );
        }
      }
      logger.info({ cron: "trip-review", tripId: trip.id, findings: findings.map((f) => f.id), pending: pending.map((f) => f.id) }, "trip reviewed");
    }
    logger.info({ cron: "trip-review", trips: trips.data?.length ?? 0, flagged, emailed }, "trip-review sweep done");
    return NextResponse.json({ reviewed: trips.data?.length ?? 0, flagged, emailed });
  } catch (error) {
    return fail(error, "The review sweep failed.");
  }
}

export const GET = run;
export const POST = run;
