import { NextResponse } from "next/server";
import { hasBearer } from "@/lib/server/bearer";
import { fail, withRoute } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { escapeHtml, sendEmail } from "@/lib/server/email";
import { emailShell } from "@/lib/server/email-template";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTripContext } from "@/lib/application/trip-context";
import { reviewTrip, pendingNotifications, type ReviewFinding } from "@/lib/application/trip-review";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export const runtime = "nodejs";

// Bounds on one sweep. Trip creation isn't metered per user, so the work (and the operator-paid
// email volume) must not scale with how many near-dated trips one account creates.
const MAX_TRIPS_PER_RUN = 500;
const MAX_EMAILS_PER_RUN = 200;

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

function digest(tripId: string, tripName: string, findings: ReviewFinding[]) {
  const link = `${siteUrl()}/trips/${tripId}`;
  const lines = findings.map((f) => `• ${f.title} — ${f.detail}`);
  return {
    subject: `${findings.length} thing${findings.length === 1 ? "" : "s"} to check before ${tripName}`,
    text: `A quick review of ${tripName} turned up:\n\n${lines.join("\n")}\n\nOpen the trip: ${link}`,
    html: emailShell({
      preheader: `${findings.length} thing${findings.length === 1 ? "" : "s"} to check before ${tripName}`,
      bodyHtml: `<p style="margin:0 0 10px">A quick review of <strong>${escapeHtml(tripName)}</strong> turned up:</p>
<ul style="margin:0;padding-left:20px">${findings.map((f) => `<li style="margin-bottom:6px"><strong>${escapeHtml(f.title)}</strong> — ${escapeHtml(f.detail)}</li>`).join("")}</ul>`,
      button: { label: "Open the trip", url: link },
    }),
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
  if (!hasBearer(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = createSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const trips = await admin.from("trips").select("id,name,owner_id").gte("start_date", today).lte("start_date", soon).order("start_date", { ascending: true }).limit(MAX_TRIPS_PER_RUN);
    if (trips.error) throw trips.error;

    let flagged = 0;
    let emailed = 0;
    for (const trip of trips.data ?? []) {
      const ctx = await loadTripContext(admin, trip.id).catch((err) => {
        // The trip id just came from a successful query above — a failure loading its context
        // is a real bug or outage, not a legitimate empty case, and skips this trip's review
        // for the day silently unless logged.
        logger.warn({ err, cron: "trip-review", tripId: trip.id }, "failed to load trip context; skipping this trip for today's sweep");
        return null;
      });
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
      if (pending.length && emailed < MAX_EMAILS_PER_RUN) {
        // The recipient comes from trips.owner_id; only mail someone who is actually an owner member of
        // the trip, so a rewritten owner_id can never point the operator's sender at a third party.
        const membership = await admin.from("trip_members").select("user_id").eq("trip_id", trip.id).eq("user_id", trip.owner_id).eq("role", "owner").maybeSingle();
        if (membership.error || !membership.data) continue;
        const owner = await admin.auth.admin.getUserById(trip.owner_id).then((r) => r.data.user, () => null);
        const sent = owner?.email ? await sendEmail({ to: owner.email, ...digest(trip.id, trip.name, pending) }).catch(() => false) : false;
        if (sent) {
          emailed += 1;
          await admin.from("trip_decisions").upsert(
            { trip_id: trip.id, kind: "review_notified", source: "assistant", idempotency_key: `review_notified:${trip.id}`, value: { ids: [...notified, ...pending.map((f) => f.id)] } },
            { onConflict: "trip_id,idempotency_key" },
          );
          invalidateWorkspace(trip.id);
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

export const GET = withRoute(run);
export const POST = withRoute(run);
