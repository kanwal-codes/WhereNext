import { NextResponse } from "next/server";
import { hasBearer } from "@/lib/server/bearer";
import { fail } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { sendEmail } from "@/lib/server/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fallbackRate } from "@/lib/application/fallback-rate";

export const runtime = "nodejs";

// Was 15 (checked every 15 minutes) until the Hobby plan's cron limit (daily jobs only) forced
// this to run once a day instead — kept at 15 with a once-daily trigger would have covered only
// the last 15 minutes of each 24h gap, missing the other 23h45m and starving MIN_SAMPLE most
// days. 24h keeps the check actually covering the period since its last run.
const WINDOW_MINUTES = 24 * 60;
const MIN_SAMPLE = 5;

/**
 * Vercel Cron (Phase 2.3, docs/overhaul/roadmap/phase-2-speed.md): checks RESOLVE's
 * Cerebras-pin fallback rate over the trailing window, emails FALLBACK_ALERT_EMAIL when it
 * crosses THRESHOLD. Auth matches trip-review's cron: `Authorization: Bearer $CRON_SECRET`.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!hasBearer(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // `||`, not `??` — an unset var is `undefined` (falls through, correct), but a var that's
    // present-but-blank (e.g. added in the Vercel dashboard with no value, or copied verbatim
    // from .env.example's empty placeholder) is `""`, which `??` would NOT fall through on;
    // `Number("")` is `0`, silently turning the 20% default into "alert on any fallback at all."
    const rawThreshold = Number(process.env.FALLBACK_RATE_THRESHOLD || 0.2);
    // A typo'd env value (e.g. "abc") parses to NaN, which makes every `rate > threshold`
    // comparison false — alerting silently disables itself with no error. Fall back to the
    // default instead and log so it's visible.
    const threshold = Number.isFinite(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 1 ? rawThreshold : 0.2;
    if (threshold !== rawThreshold) {
      logger.warn({ cron: "fallback-rate", rawThreshold, fallbackTo: threshold }, "FALLBACK_RATE_THRESHOLD is invalid; using default");
    }
    const admin = createSupabaseAdminClient();
    const result = await fallbackRate(admin, WINDOW_MINUTES);
    const breach = result.total >= MIN_SAMPLE && result.rate > threshold;
    if (breach) {
      const to = process.env.FALLBACK_ALERT_EMAIL;
      if (to) {
        const pct = Math.round(result.rate * 100);
        await sendEmail({
          to,
          subject: `RESOLVE fallback rate at ${pct}% (last ${WINDOW_MINUTES}m)`,
          text: `${result.fallback}/${result.total} RESOLVE calls in the last ${WINDOW_MINUTES} minutes fell back off ${result.pinnedModel}. Threshold: ${Math.round(threshold * 100)}%.`,
          html: `<p>${result.fallback}/${result.total} RESOLVE calls in the last ${WINDOW_MINUTES} minutes fell back off <code>${result.pinnedModel}</code>.</p><p>Threshold: ${Math.round(threshold * 100)}%.</p>`,
        }).catch(() => false);
      } else {
        logger.warn({ cron: "fallback-rate", ...result }, "fallback rate breach but FALLBACK_ALERT_EMAIL is not set; no alert sent");
      }
    }
    logger.info({ cron: "fallback-rate", ...result, breach }, "fallback rate checked");
    return NextResponse.json({ ...result, breach });
  } catch (error) {
    return fail(error, "The fallback-rate check failed.");
  }
}

export const GET = run;
export const POST = run;
