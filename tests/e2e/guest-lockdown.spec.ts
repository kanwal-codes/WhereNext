import { test, expect } from "@playwright/test";

// Live check of the guest (anonymous) experience against the real Supabase project: guests get
// Roam and nothing else, and a reload throws the session away. It creates and deletes real
// anonymous users and spends one model call, so it only runs on request:
//   GUEST_LIVE=1 npx playwright test tests/e2e/guest-lockdown.spec.ts
test.describe("guest lockdown (live)", () => {
  test.skip(!process.env.GUEST_LIVE, "set GUEST_LIVE=1 to run against the real Supabase project");
  test.setTimeout(180_000);
  // Each run uses its own client key so the per-IP guest limits don't accumulate across runs.
  test.use({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` } });

  test("Roam works, everything else is closed, and a reload wipes the session", async ({ page, context }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Describe the trip you want" }).fill("A weekend in Quebec City");
    await page.getByRole("button", { name: /Start planning/ }).click();
    await page.waitForURL(/\/trips\/[^/]+\/chat/, { timeout: 90_000 });
    const tripId = page.url().match(/trips\/([^/]+)\/chat/)![1];

    // The landing sentence became the first message and Roam answered it.
    await expect(page.getByText("A weekend in Quebec City").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible({ timeout: 90_000 });

    // The UI: Conversation is the only open door.
    const nav = page.locator("aside nav");
    await expect(nav.getByRole("link", { name: "Conversation" })).toBeVisible();
    for (const label of ["Overview", "Group chat", "Discover", "Getting around", "Stay", "Itinerary", "Trip knowledge", "Bookings & essentials"]) {
      await expect(nav.getByRole("button", { name: `${label}, needs an account` })).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
    await nav.getByRole("button", { name: "Itinerary, needs an account" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a free account" });
    await expect(dialog).toContainText("open itinerary");
    // The sign-up form asks one thing at a time: email first, then a password.
    await expect(dialog.getByLabel("Password")).toHaveCount(0);
    await dialog.getByLabel("Email").fill("someone@example.com");
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByLabel("Email")).toHaveCount(0);
    await expect(dialog.getByLabel("Password")).toBeVisible();
    await expect(dialog).toContainText("someone@example.com");
    await dialog.getByRole("button", { name: "Change" }).click();
    await expect(dialog.getByLabel("Email")).toHaveValue("someone@example.com");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // The server: closed by default, whatever the UI does.
    const closed: Array<[string, string]> = [
      ["POST", "/api/trips"],
      ["GET", `/api/trips/${tripId}/itinerary`],
      ["PUT", `/api/trips/${tripId}/places/bookmark`],
      ["GET", `/api/trips/${tripId}/group-chat`],
      ["POST", `/api/trips/${tripId}/invites`],
      ["PATCH", `/api/trips/${tripId}`],
      ["POST", "/api/commands"],
    ];
    for (const [method, path] of closed) {
      const response = await context.request.fetch(path, { method, data: method === "GET" ? undefined : {} });
      expect(response.status(), `${method} ${path}`).toBe(403);
      expect((await response.json()).code).toBe("account_required");
    }
    expect((await context.request.get(`/api/trips/${tripId}/conversation`)).status()).toBe(200);
    for (const path of ["/trips", `/trips/${tripId}/itinerary`]) {
      expect((await context.request.get(path, { maxRedirects: 0 })).status(), path).toBeGreaterThanOrEqual(300);
    }

    // Disposable: a reload deletes the guest and returns to the start.
    await page.reload();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
    const cookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.endsWith("auth-token"));
    expect(cookies).toHaveLength(0);
  });
});
