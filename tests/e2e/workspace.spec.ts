import { test, expect } from "@playwright/test";

test("preview trip renders the routed workspace shell and every surface route", async ({ page }) => {
  // Visits ~9 routes + redirects in one cold `next dev` session; the AI SDK in the chat
  // route's module graph makes the first compile heavier than the 30s default allows.
  test.setTimeout(180_000);
  await page.goto("/trips/rebuild-preview");
  await expect(page.getByRole("heading", { name: "What we know", exact: true })).toBeVisible();

  const snapshot = await page.evaluate(async () => {
    const response = await fetch("/api/trips/rebuild-preview/workspace");
    return response.status;
  });
  expect([401, 503]).toContain(snapshot);

  const sidebar = page.locator("aside");
  const routes: Array<[string, RegExp]> = [
    ["Roam", /\/trips\/rebuild-preview\/chat$/],
    ["Discover", /\/trips\/rebuild-preview\/discover$/],
    ["Getting around", /\/trips\/rebuild-preview\/map$/],
    ["Stay", /\/trips\/rebuild-preview\/stay$/],
    ["Itinerary", /\/trips\/rebuild-preview\/itinerary$/],
    ["Trip knowledge", /\/trips\/rebuild-preview\/knowledge$/],
    ["Bookings & essentials", /\/trips\/rebuild-preview\/bookings$/],
  ];

  for (const [label, url] of routes) {
    await sidebar.getByRole("link", { name: label }).click();
    // Each route cold-compiles on first hit in `next dev` (Conversation pulls in the AI SDK,
    // the map route mapbox-gl) — the 5s default is not enough for the first paint.
    await expect(page).toHaveURL(url, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  }

  await sidebar.getByRole("link", { name: "Overview" }).click();
  await expect(page).toHaveURL(/\/trips\/rebuild-preview$/, { timeout: 30_000 });

  // Transport merged into "Getting around", Budget into "Trip knowledge" — old routes still land.
  // Wait for the destination page's own heading before checking the client-set <title>: the map
  // route pulls in mapbox-gl and cold-compiles slowly in `next dev`, and the title is only set
  // once RouteScaffold/PageHeader mount.
  await page.goto("/trips/rebuild-preview/transport");
  await expect(page).toHaveURL(/\/trips\/rebuild-preview\/map$/);
  await expect(page.getByRole("heading", { name: "Your trip on a map" })).toBeVisible({ timeout: 40_000 });
  await expect(page).toHaveTitle(/Getting around/, { timeout: 10_000 });
  await page.goto("/trips/rebuild-preview/budget");
  await expect(page).toHaveURL(/\/trips\/rebuild-preview\/knowledge$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "What Roam remembers" })).toBeVisible({ timeout: 20_000 });
});

test("identity recovery is reachable and account deletion requires authentication", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: /way back in/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  const response = await page.request.delete("/api/account");
  expect([401, 503]).toContain(response.status());
});

test("dedicated sign-in and sign-up pages expose working auth forms", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: /pick up where the plan left off/i })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("heading", { name: /start a trip by talking about it/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});
