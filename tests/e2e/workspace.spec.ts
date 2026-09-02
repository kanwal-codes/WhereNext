import { test, expect } from "@playwright/test";

test("preview trip opens the coordinated workspace surfaces", async ({ page }) => {
  await page.goto("/trips/rebuild-preview");
  await expect(page.getByRole("heading", { name: "your destination" })).toBeVisible();
  const snapshot = await page.evaluate(async () => { const response = await fetch("/api/trips/rebuild-preview/workspace"); return response.status; });
  expect([401, 503]).toContain(snapshot);
  const navigation = page.getByRole("navigation", { name: "Trip workspace surfaces" });
  for (const surface of ["Conversation", "Discover", "Itinerary", "Map", "Transport", "Stay", "Budget", "Essentials", "Trip context"]) {
    await navigation.getByRole("button", { name: surface }).click();
    await expect(page.getByRole("heading", { name: surface === "Discover" ? "Discover" : surface })).toBeVisible();
  }
});

test("identity recovery is reachable and account deletion requires authentication", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Reset your password." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send recovery link" })).toBeVisible();
  const response = await page.request.delete("/api/account");
  expect([401, 503]).toContain(response.status());
});

test("dedicated sign-in and sign-up pages expose working auth forms", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("heading", { name: "Start planning." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});
