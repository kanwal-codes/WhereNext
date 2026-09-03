import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect } from "@playwright/test";
import { createTripViaForm, assistantCount, waitForAssistant, assistantTurnUrls } from "./support";

loadEnvConfig(process.cwd());

test("authenticated user can create and reload a trip workspace", async ({ page }) => {
  test.setTimeout(240_000); // sign-in + create + 4 live LLM chat turns with provider retrieval
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !serviceRoleKey || !publishableKey, "Supabase integration credentials are required");
  const admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false } });
  const email = `rebuild-e2e-${crypto.randomUUID()}@example.invalid`;
  const password = `Rebuild-${crypto.randomUUID()}-test`;
  let userId: string | undefined;
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 });
    const tripId = await createTripViaForm(page, { name: "Rebuild verification", destination: "Montreal", origin: "Toronto", days: "6", travelers: "2", vibe: "architecture" });
    await expect(page.locator("main").getByRole("heading", { name: "Rebuild verification" })).toBeVisible();
    await page.reload();
    await expect(page.locator("main").getByRole("heading", { name: "Rebuild verification" })).toBeVisible();
    const memory = await page.evaluate(async (id) => (await fetch(`/api/trips/${id}/memory`)).json(), tripId);
    expect(memory.memory).toMatchObject({ vibe: "architecture" });
    const snapshot = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/workspace`); return { status: response.status, body: await response.json() }; }, tripId);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.trip).toMatchObject({ name: "Rebuild verification", destination: "Montreal" });
    expect(snapshot.body.itinerary).toEqual([]);
    // Links, photos and sources live on the card blocks / metadata.sources — never in the prose.
    await page.goto(`/trips/${tripId}/chat`);
    let seen = await assistantCount(page, tripId);
    await page.getByRole("textbox", { name: "Message" }).fill("What is already in my itinerary?");
    await page.getByRole("button", { name: "Send" }).click();
    await waitForAssistant(page, tripId, seen);

    await page.goto(`/trips/${tripId}/chat`);
    seen = await assistantCount(page, tripId);
    await page.getByRole("textbox", { name: "Message" }).fill("List the top historic sites to visit in Montreal.");
    await page.getByRole("button", { name: "Send" }).click();
    expect(await assistantTurnUrls(page, tripId, seen, 90_000)).toMatch(/https:\/\//);

    await page.goto(`/trips/${tripId}/chat`);
    seen = await assistantCount(page, tripId);
    await page.getByRole("textbox", { name: "Message" }).fill("Show me photos of Notre-Dame Basilica and other historic sites in Montreal.");
    await page.getByRole("button", { name: "Send" }).click();
    expect(await assistantTurnUrls(page, tripId, seen, 90_000)).toMatch(/\/api\/trips\/.*\/places\/google\/photo/);

    await page.goto(`/trips/${tripId}/chat`);
    seen = await assistantCount(page, tripId);
    await page.getByRole("textbox", { name: "Message" }).fill("Find concerts and events on in Montreal this weekend.");
    await page.getByRole("button", { name: "Send" }).click();
    expect(await assistantTurnUrls(page, tripId, seen, 90_000)).toMatch(/https:\/\//);
    const item = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/itinerary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Old Port", dayIndex: 1 }) }); return { status: response.status, body: await response.json() }; }, tripId);
    expect(item.status).toBe(201);
    const locked = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/itinerary`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Old Port", locked: true }) }); return response.status; }, tripId);
    expect(locked).toBe(200);
    const blockedMove = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/itinerary`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Old Port", dayIndex: 2 }) }); return response.status; }, tripId);
    expect(blockedMove).toBe(409);
    const removed = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/itinerary`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Old Port" }) }); return response.status; }, tripId);
    expect(removed).toBe(409);
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
