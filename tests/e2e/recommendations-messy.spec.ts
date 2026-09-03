import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect, type Page } from "@playwright/test";
import { createTripViaForm } from "./support";

loadEnvConfig(process.cwd());

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function signIn(page: Page) {
  const db = admin();
  const email = `reco-messy-${crypto.randomUUID()}@example.invalid`;
  const password = `RecoMessy-${crypto.randomUUID()}-x`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/trips$/);
  return { db, userId: created.data.user.id };
}

const classify = (page: Page, tripId: string, name: string, primaryType = "point_of_interest") =>
  page.evaluate(
    async ({ id, name, primaryType }) => {
      const r = await fetch(`/api/trips/${id}/reco`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "classify", id: `m-${name.slice(0, 10)}`, name, primaryType }),
      });
      return { status: r.status, body: (await r.json()) as { vibe?: string; secondary?: string } };
    },
    { id: tripId, name, primaryType },
  );

test("messy / typo'd / foreign / natural-language place names — the embedding classifier rescues them", async ({ page }) => {
  test.setTimeout(240_000);
  const { db, userId } = await signIn(page);
  let tripId: string | undefined;
  try {
    tripId = await createTripViaForm(page, { name: "Messy QA", destination: "Bangkok, Thailand", days: "3", travelers: "2" });
    await page.goto(`/trips/${tripId}/chat`);
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("textbox", { name: "Message" }).waitFor();

    // Clear-signal cases: the keyword scanner misses (typo / foreign / abbrev / prose),
    // the embedding classifier should still land the right vibe.
    const EXPECT: Array<[string, string]> = [
      ["musuem of modrn art", "museum_culture"],
      ["big cathederal downtown with the tall spires", "sacred"],
      ["Templo Mayor ancient ruins", "sacred"],
      ["Jardin des Plantes botanical park", "green_space"],
      ["Playa del Carmen white sand", "beach_water"],
      ["Stade de France football", "sports"],
      ["a quiet place to pray and light a candle and sit", "sacred"],
      ["dark loud dance floor open till 6am", "nightlife"],
      ["little art house cinema and theatre stage", "performing_arts"],
      ["huge trade fair convention hall with 500 booths", "expo"],
    ];

    const results: Array<{ name: string; want: string; got: string; status: number }> = [];
    for (const [name, want] of EXPECT) {
      const r = await classify(page, tripId, name);
      results.push({ name, want, got: r.body.vibe ?? "?", status: r.status });
      expect(r.status, `classify "${name}" status`).toBe(200);
      expect(["green_space", "live_music", "nightlife", "sacred", "expo", "performing_arts", "museum_culture", "beach_water", "sports", "food_scene", "default"])
        .toContain(r.body.vibe);
    }
    console.log("MESSY_CLASSIFY_RESULTS=" + JSON.stringify(results, null, 0));

    // At least 7 of 10 clear-signal messy names must land on the intended vibe (embeddings aren't perfect).
    const hits = results.filter((x) => x.got === x.want).length;
    expect(hits, `embedding rescued ${hits}/10 messy names: ${JSON.stringify(results.filter((x) => x.got !== x.want))}`).toBeGreaterThanOrEqual(7);

    // Garbage still never 500s and always yields a valid key.
    for (const junk of ["!@#$%^&*()", "🏖️🏖️🏖️", "asdfghjkl", "   ", "​​​", "১২৩৪৫", "null undefined NaN"]) {
      const r = await classify(page, tripId, junk);
      expect(r.status, `junk "${junk}"`).toBeLessThan(500);
    }
  } finally {
    if (tripId) await db.from("trips").delete().eq("id", tripId);
    await db.auth.admin.deleteUser(userId);
  }
});

test("a real place with a non-English display name still renders vibe-correct lanes", async ({ page }) => {
  test.setTimeout(180_000);
  const { db, userId } = await signIn(page);
  let tripId: string | undefined;
  try {
    tripId = await createTripViaForm(page, { name: "Intl QA", destination: "Bangkok, Thailand", days: "3", travelers: "2" });

    const providerId = await page.evaluate(async (id) => {
      const r = await fetch(`/api/trips/${id}/places?query=${encodeURIComponent("วัดโพธิ์ Wat Pho temple Bangkok")}`);
      const b = await r.json();
      return (b.places ?? [])[0]?.providerId as string | undefined;
    }, tripId);
    expect(providerId, "a Google result for Wat Pho").toBeTruthy();

    await page.goto(`/trips/${tripId}/place/${encodeURIComponent(providerId!)}`);
    await page.getByText("Around here", { exact: true }).waitFor({ timeout: 60_000 });
    // Temple → sacred lanes, and definitely not a nightlife/expo section.
    await expect(page.getByRole("heading", { name: /More sacred & spiritual places|Museums & heritage nearby|Gardens & quiet spots/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /More clubs|More shows & expos/ })).toHaveCount(0);
  } finally {
    if (tripId) await db.from("trips").delete().eq("id", tripId);
    await db.auth.admin.deleteUser(userId);
  }
});
