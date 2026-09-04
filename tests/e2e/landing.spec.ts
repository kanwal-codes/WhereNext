import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("renders for a signed-out visitor", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Talk about it.", level: 1 })).toBeVisible();

    // Both intentional by design: hero + closing panel each carry the same CTA pair.
    const primaryCta = page.getByRole("link", { name: "Create free account" });
    await expect(primaryCta).toHaveCount(2);
    await expect(primaryCta.first()).toHaveAttribute("href", "/sign-up");

    await expect(page.locator("header").getByText("Where next?")).toBeVisible();
    // nav + hero + closing panel each carry their own "Sign in" link.
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(3);

    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
