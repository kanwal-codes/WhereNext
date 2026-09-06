import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect } from "@playwright/test";
import { createTripViaForm } from "./support";

loadEnvConfig(process.cwd());

/**
 * Two real, separately-authenticated browser contexts on the SAME trip — the one shape the
 * rest of the e2e suite never exercises. Regression coverage for a class of bugs found by
 * auditing the codebase: trip_essentials was missing from trip-realtime.ts's subscribed-table
 * list, and EssentialsSurface/BudgetSurface/TripContextSurface seeded local state from their
 * `initial*` prop via useState() with no effect to resync it when a fresh prop arrived without
 * a full remount. Either bug alone means a collaborator's edit never appears on the other
 * viewer's already-open tab — this test drives the real Realtime channel end to end, no reload.
 */
test("a collaborator's essentials edit reaches the other viewer's already-open tab, live", async ({ browser }) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !serviceRoleKey || !publishableKey, "Supabase integration credentials are required");
  const admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false } });
  const baseURL = test.info().project.use.baseURL;

  const ownerEmail = `rebuild-e2e-owner-${crypto.randomUUID()}@example.invalid`;
  const collabEmail = `rebuild-e2e-collab-${crypto.randomUUID()}@example.invalid`;
  const password = `Rebuild-${crypto.randomUUID()}-test`;
  let ownerId: string | undefined;
  let collabId: string | undefined;
  let tripId: string | undefined;

  const ownerContext = await browser.newContext({ baseURL });
  const collabContext = await browser.newContext({ baseURL });
  try {
    const ownerCreated = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    if (ownerCreated.error) throw ownerCreated.error;
    ownerId = ownerCreated.data.user.id;
    const collabCreated = await admin.auth.admin.createUser({ email: collabEmail, password, email_confirm: true });
    if (collabCreated.error) throw collabCreated.error;
    collabId = collabCreated.data.user.id;

    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/sign-in");
    await ownerPage.getByLabel("Email").fill(ownerEmail);
    await ownerPage.getByLabel("Password").fill(password);
    await ownerPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(ownerPage).toHaveURL(/\/trips(?:\/new)?$/, { timeout: 15_000 });

    tripId = await createTripViaForm(ownerPage, { name: "Collab realtime check", destination: "Lisbon" });

    // Bypass the invite UI (a separate concern) — add the collaborator as an editor directly.
    const membership = await admin.from("trip_members").insert({ trip_id: tripId, user_id: collabId, role: "editor" });
    if (membership.error) throw membership.error;

    const collabPage = await collabContext.newPage();
    await collabPage.goto("/sign-in");
    await collabPage.getByLabel("Email").fill(collabEmail);
    await collabPage.getByLabel("Password").fill(password);
    await collabPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(collabPage).toHaveURL(/\/trips(?:\/new)?$/, { timeout: 15_000 });

    // The collaborator opens the checklist and STAYS on it — no reload from here on. Only a
    // live realtime round-trip (not a fresh page load) can make the next assertion pass.
    await collabPage.goto(`/trips/${tripId}/bookings`);
    const item = "Check weather and packing needs";
    const collabItemText = collabPage.getByRole("button", { name: item }).locator("span").last();
    await expect(collabItemText).not.toHaveClass(/line-through/);

    await ownerPage.goto(`/trips/${tripId}/bookings`);
    await ownerPage.getByRole("button", { name: item }).click();

    await expect(collabItemText).toHaveClass(/line-through/, { timeout: 30_000 });
  } finally {
    if (tripId) await admin.from("trips").delete().eq("id", tripId);
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    if (collabId) await admin.auth.admin.deleteUser(collabId);
    await ownerContext.close();
    await collabContext.close();
  }
});
