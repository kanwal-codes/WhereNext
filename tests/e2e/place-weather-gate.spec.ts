import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect, type Page } from "@playwright/test";
import { createTripViaForm } from "./support";

loadEnvConfig(process.cwd());

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const firstProviderId = (page: Page, tripId: string, query: string) =>
  page.evaluate(
    async ({ id, q }) => {
      const r = await fetch(`/api/trips/${id}/places?query=${encodeURIComponent(q)}`);
      const b = await r.json();
      return (b.places ?? [])[0]?.providerId as string | undefined;
    },
    { id: tripId, q: query },
  );

/** The trip-weather line renders one of these labels; none of them = weather is hidden. */
const WEATHER_LINE = /Typical weather|During your trip|Checking the weather/;

/**
 * The reported bug: the weather line showed on an ice-cream shop's detail page. It should
 * only appear for weather-exposed places (parks, beaches, hikes, ski hills, viewpoints).
 * This spec locks in the fix — indoor/casual places get no weather line — with a near-future
 * trip window so the weather feature would otherwise have every reason to render it.
 * (The positive case — weather DOES show on a park — is covered by the `isWeatherRelevantPlace`
 * unit tests; end to end it depends on the openweather forecast call, which is out of scope here.)
 */
test("no weather line on indoor / casual place detail pages", async ({ page }) => {
  test.setTimeout(180_000);
  const db = admin();
  const email = `weather-${crypto.randomUUID()}@example.invalid`;
  const password = `Weather-${crypto.randomUUID()}-x`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  let tripId: string | undefined;

  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/trips(?:\/new)?$/);

    tripId = await createTripViaForm(page, { name: "Weather QA", destination: "Montreal, Canada", days: "5", travelers: "3" });
    // Near-future window: the weather feature would render a line here if the place allowed it.
    const start = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10);
    const upd = await db.from("trips").update({ start_date: start, end_date: end }).eq("id", tripId);
    expect(upd.error).toBeNull();

    for (const q of ["ice cream shop Montreal", "art museum Montreal", "cocktail bar Montreal", "bookstore Montreal"]) {
      const pid = await firstProviderId(page, tripId, q);
      expect(pid, `a place for "${q}"`).toBeTruthy();
      await page.goto(`/trips/${tripId}/place/${encodeURIComponent(pid!)}`);
      await page.getByRole("heading").first().waitFor({ timeout: 45_000 });
      await page.waitForTimeout(5000); // give any weather fetch time to resolve and render
      await expect(page.getByText(WEATHER_LINE), `weather wrongly shown on "${q}"`).toHaveCount(0);
    }
  } finally {
    if (tripId) await db.from("trips").delete().eq("id", tripId);
    await db.auth.admin.deleteUser(userId);
  }
});
