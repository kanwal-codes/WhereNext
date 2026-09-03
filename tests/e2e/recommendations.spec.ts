import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect } from "@playwright/test";
import { createTripViaForm } from "./support";

loadEnvConfig(process.cwd());

/**
 * End-to-end coverage for the detail-page recommendation system: the /reco API's three
 * ops against live embeddings + DB, and the "Around here" section rendering on a real
 * place detail page with vibe-appropriate lanes.
 */
test("recommendation system — /reco ops + live detail-page lanes", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const email = `reco-${crypto.randomUUID()}@example.invalid`;
  const password = `Reco-${crypto.randomUUID()}-test`;
  let userId: string | undefined;
  let tripId: string | undefined;

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/trips$/);

    tripId = await createTripViaForm(page, { name: "Reco QA", destination: "Toronto, Canada", days: "3", travelers: "2" });

    // ── /reco op: classify ────────────────────────────────────────────────
    const classify = await page.evaluate(async (id) => {
      const r = await fetch(`/api/trips/${id}/reco`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "classify", id: "probe-1", name: "Allan Gardens Conservatory", primaryType: "point_of_interest" }),
      });
      return { status: r.status, body: await r.json() };
    }, tripId);
    expect(classify.status).toBe(200);
    expect(classify.body.vibe).toBe("green_space"); // keyword scan catches "conservatory"

    // ── /reco op: rank (live OpenAI embeddings) ───────────────────────────
    const rank = await page.evaluate(async (id) => {
      const r = await fetch(`/api/trips/${id}/reco`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "rank",
          anchor: "a peaceful botanical garden with walking paths",
          candidates: [
            { id: "sibling", text: "Japanese Garden and arboretum" },
            { id: "unrelated", text: "underground techno nightclub" },
          ],
        }),
      });
      return { status: r.status, body: await r.json() };
    }, tripId);
    expect(rank.status).toBe(200);
    expect(rank.body.scores.sibling).toBeGreaterThan(rank.body.scores.unrelated);

    // ── /reco op: log → row lands in reco_events ──────────────────────────
    const log = await page.evaluate(async (id) => {
      const r = await fetch(`/api/trips/${id}/reco`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "log",
          anchorKind: "place",
          anchorId: "probe-1",
          vibe: "green_space",
          events: [{ laneId: "gardens", action: "impression", itemKind: "place", itemId: "g1", position: 0 }],
        }),
      });
      return { status: r.status, body: await r.json() };
    }, tripId);
    expect(log.status).toBe(200);
    expect(log.body).toEqual({ ok: true });

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("reco_events")
          .select("*", { count: "exact", head: true })
          .eq("trip_id", tripId!)
          .eq("action", "impression");
        return count ?? 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // ── live detail page: "Around here" with green_space lanes ────────────
    const providerId = await page.evaluate(async (id) => {
      const r = await fetch(`/api/trips/${id}/places?query=${encodeURIComponent("botanical garden Toronto")}`);
      const b = await r.json();
      return (b.places ?? [])[0]?.providerId as string | undefined;
    }, tripId);
    expect(providerId, "a Google place for 'botanical garden Toronto'").toBeTruthy();

    await page.goto(`/trips/${tripId}/place/${encodeURIComponent(providerId!)}`);
    const around = page.getByText("Around here", { exact: true });
    await around.waitFor({ timeout: 45_000 });

    // A garden is green_space → these lanes; and must NOT show the default-vibe "Where to stay nearby".
    await expect(page.getByRole("heading", { name: /More gardens & parks|Coffee & food nearby|Right around here/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Where to stay nearby" })).toHaveCount(0);

    // Visiting the page fires the impression beacon for this real anchor.
    await expect
      .poll(async () => {
        const { count } = await admin
          .from("reco_events")
          .select("*", { count: "exact", head: true })
          .eq("trip_id", tripId!)
          .eq("anchor_id", providerId!);
        return count ?? 0;
      }, { timeout: 20_000 })
      .toBeGreaterThan(0);
  } finally {
    if (tripId) await admin.from("trips").delete().eq("id", tripId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
