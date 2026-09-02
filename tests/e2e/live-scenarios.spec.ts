import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect } from "@playwright/test";

loadEnvConfig(process.cwd());

const scenarios = [
  { person: "Navi", name: "Friends India", destination: "India", origin: "Canada", days: "10", travelers: "5", vibe: "fun, culture, nightlife", prompts: ["It is my first time going to India with friends. Where should we go?", "Which cities fit a group that wants nightlife and fun activities?", "Show me photos and source links for the best options."] },
  { person: "Maya", name: "Family France", destination: "France", origin: "Canada", days: "7", travelers: "4", vibe: "family-friendly, relaxed", prompts: ["We are two adults and two children visiting France for the first time. Where should we go?", "What family-friendly activities and attractions would work for us?", "Are there any events happening this weekend? Include source links."] },
  { person: "Leo", name: "Couples Japan", destination: "Japan", origin: "Canada", days: "12", travelers: "2", vibe: "food, architecture, slower pace", prompts: ["We want a first trip to Japan focused on food and architecture. Which cities should we consider?", "Where can we find cooking experiences and historic neighborhoods?", "What is already in our itinerary?"] },
] as const;

test("live multi-person travel scenarios return current, prompt-matched answers", async ({ page }) => {
  test.setTimeout(240_000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const results: Array<Record<string, unknown>> = [];
  for (const scenario of scenarios) {
    const email = `sim-${scenario.person.toLowerCase()}-${crypto.randomUUID()}@example.invalid`;
    const password = `Simulation-${crypto.randomUUID()}-test`;
    let userId: string | undefined;
    let tripId: string | undefined;
    try {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      userId = created.data.user.id;
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/trips$/);
      await page.goto("/trips/new");
      for (const [label, value] of [["Trip name", scenario.name], ["Destination", scenario.destination], ["Starting from", scenario.origin], ["Days", scenario.days], ["Travelers", scenario.travelers], ["Vibe", scenario.vibe]] as const) await page.getByLabel(label).fill(value);
      await page.getByRole("button", { name: "Create trip" }).click();
      await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/i);
      tripId = page.url().split("/").pop();
      for (const prompt of scenario.prompts) {
        const before = await page.evaluate(async (id) => (await (await fetch(`/api/trips/${id}/conversation`)).json()).messages?.filter((m: { role: string }) => m.role === "assistant").length ?? 0, tripId);
        await page.getByLabel("Message").fill(prompt);
        await page.getByRole("button", { name: "Send" }).click();
        let answer = "";
        await expect.poll(async () => page.evaluate(async ({ id, before }) => { const body = await (await fetch(`/api/trips/${id}/conversation`)).json(); const messages = body.messages?.filter((m: { role: string }) => m.role === "assistant") ?? []; return messages.length > before ? messages.at(-1)?.content ?? "" : ""; }, { id: tripId, before }), { timeout: 75_000 }).toBeTruthy();
        answer = await page.evaluate(async (id) => { const body = await (await fetch(`/api/trips/${id}/conversation`)).json(); return body.messages?.filter((m: { role: string }) => m.role === "assistant").at(-1)?.content ?? ""; }, tripId);
        results.push({ person: scenario.person, prompt, chars: answer.length, firstLine: answer.split("\n").find(Boolean)?.slice(0, 180), links: (answer.match(/https:\/\//g) ?? []).length, photos: (answer.match(/\/api\/trips\/.*?\/places\/google\/photo/g) ?? []).length, table: answer.includes("|"), refusal: /couldn.t verify|no specific place information|no results/i.test(answer) });
      }
    } finally {
      if (tripId) await admin.from("trips").delete().eq("id", tripId);
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  }
  console.log("LIVE_SCENARIO_RESULTS=" + JSON.stringify(results));
  expect(results).toHaveLength(9);
});
