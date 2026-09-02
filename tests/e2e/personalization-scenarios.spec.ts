import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect } from "@playwright/test";

loadEnvConfig(process.cwd());

const scenarios = [
  { person: "Aisha", name: "Family Kerala", destination: "Kerala, India", origin: "Toronto, Canada", days: "8", travelers: "4", vibe: "family-friendly, nature, relaxed", prompts: ["What do you know about our trip and what kind of pace should you recommend?", "What is already in our itinerary?"] },
  { person: "Daniel", name: "Budget Lisbon", destination: "Lisbon, Portugal", origin: "Montreal, Canada", days: "5", travelers: "2", vibe: "architecture, food, budget-friendly", prompts: ["Remember that we want architecture and local food on a budget. What should we prioritize?", "What is already in our itinerary?"] },
] as const;

  test("personalized personas retain trip constraints and itinerary memory", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const results: Array<Record<string, unknown>> = [];
  for (const scenario of scenarios) {
    const email = `personalization-${scenario.person.toLowerCase()}-${crypto.randomUUID()}@example.invalid`;
    const password = `Personalization-${crypto.randomUUID()}-test`;
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
      const seeded = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/itinerary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Confirmed first-day plan", dayIndex: 1 }) }); return response.status; }, tripId);
      expect(seeded).toBe(201);
      for (const prompt of scenario.prompts) {
        const before = await page.evaluate(async (id) => (await (await fetch(`/api/trips/${id}/conversation`)).json()).messages?.filter((m: { role: string }) => m.role === "assistant").length ?? 0, tripId);
        await page.getByLabel("Message").fill(prompt);
        await page.getByRole("button", { name: "Send" }).click();
        await expect.poll(async () => page.evaluate(async ({ id, count }) => { const body = await (await fetch(`/api/trips/${id}/conversation`)).json(); const messages = body.messages?.filter((m: { role: string }) => m.role === "assistant") ?? []; return messages.length > count ? messages.at(-1)?.content ?? "" : document.querySelector('[role="alert"]')?.textContent ?? ""; }, { id: tripId, count: before }), { timeout: 20_000 }).toBeTruthy();
        const answer = await page.evaluate(async (id) => { const body = await (await fetch(`/api/trips/${id}/conversation`)).json(); return body.messages?.filter((m: { role: string }) => m.role === "assistant").at(-1)?.content ?? ""; }, tripId);
        results.push({ person: scenario.person, prompt, answer: answer.slice(0, 500), mentionsDestination: answer.toLowerCase().includes(scenario.destination.split(",")[0].toLowerCase()), mentionsSeededItem: /confirmed first[-‑–—]day/i.test(answer) });
      }
    } finally {
      if (tripId) await admin.from("trips").delete().eq("id", tripId);
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  }
  console.log("PERSONALIZATION_RESULTS=" + JSON.stringify(results));
  expect(results).toHaveLength(4);
  expect(results.filter((result) => result.prompt === "What is already in our itinerary?").every((result) => result.mentionsSeededItem)).toBe(true);
});
