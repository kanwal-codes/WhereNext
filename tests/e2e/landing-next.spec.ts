import { test, expect } from "@playwright/test";

// Landing page overhaul (docs/LandingPage_Overhaul) — grows scene by scene
// alongside Build_Plan step 5 / Storyboard order.
test.describe("landing page overhaul", () => {
  test("renders the hero scene without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/landing-next");

    await expect(page.getByRole("heading", { name: "we should go." })).toBeVisible();
    // Was "group chat" — the tagline shouldn't read as group-trip-only when
    // the product works for solo travelers too (see HeroScene.tsx).
    await expect(page.getByText(/turns your trip chat into one shared itinerary/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a trip" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-it-works");
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    await expect(page.locator("header").getByText("Where Next")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("nav compresses after scrolling past the hero", async ({ page }) => {
    await page.goto("/landing-next");
    const header = page.locator("header");
    await expect(header).toHaveClass(/h-20/);

    await page.mouse.wheel(0, 500);
    await expect(header).toHaveClass(/h-16/);
  });

  test("navigation links resolve to real landing-page sections", async ({ page }) => {
    await page.goto("/landing-next");

    await expect(page.locator("#discover")).toHaveCount(1);
    await expect(page.locator("#how-it-works")).toHaveCount(1);
    await expect(page.locator("header").getByRole("link", { name: "Discover", exact: true })).toHaveAttribute("href", "#discover");
    await expect(page.locator("header").getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#how-it-works");
  });

  test("chaos scene reveals scattered objects and freezes on the second headline", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(500);

    const chaos = page.locator('[data-scene="chaos"]');
    await expect(chaos.getByText("Roam brings them together.")).toBeVisible();
    await expect(chaos.getByText("Fairmont Le Château")).toBeVisible();
    await expect(chaos.getByText("Montreal weekend?")).toBeVisible();
  });

  test("context scene composes a trip brief, then opens into Montreal photography", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const start = await page.evaluate(() => {
      const el = document.querySelector('[data-scene="context"]')!;
      const spacer = el.closest(".pin-spacer") ?? el.parentElement!;
      return spacer.getBoundingClientRect().top + window.scrollY;
    });
    await page.evaluate((y) => window.scrollTo(0, y), start + 4400 * 0.45);
    await page.waitForTimeout(1500);

    const context = page.locator('[data-scene="context"]');
    await expect(context.getByRole("heading", { name: "Montreal" })).toBeVisible();
    await expect(context.getByText("Roam gets the whole trip.")).toBeVisible();
    await expect(context.getByText("Vegetarian")).toBeVisible();
    await expect(context.getByText("No museums", { exact: true })).toBeVisible();

    await page.evaluate((y) => window.scrollTo(0, y), start + 4400 * 0.92);
    await page.waitForTimeout(2000);

    await expect(context.getByText("Saturday is wide open.")).toBeVisible();
    await expect(context.getByText("One shared picture")).toHaveCSS("opacity", "0");
  });

  test("Discover has accessibility affordances and reveals the focal card", async ({ page }) => {
    await page.goto("/landing-next");

    const discover = page.locator('[data-scene="discover"]');
    await expect(page.getByRole("link", { name: "Skip Discover section" })).toBeAttached();
    await expect(page.getByText("This section scrolls horizontally")).toBeAttached();
    await expect(discover.getByText("Pottery Workshop")).toBeAttached();
    await expect(discover.getByRole("button", { name: "+ Add to trip" })).toBeAttached();
  });

  test("narrative controls advance the story instead of posing as dead buttons", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeScrollBy = window.scrollBy.bind(window);
      window.scrollBy = ((options: ScrollToOptions | number, y?: number) => {
        const top = typeof options === "number" ? (y ?? 0) : (options.top ?? 0);
        (window as typeof window & { __narrativeAdvances?: number[] }).__narrativeAdvances ??= [];
        (window as typeof window & { __narrativeAdvances: number[] }).__narrativeAdvances.push(top);
        if (typeof options === "number") nativeScrollBy(options, y ?? 0);
        else nativeScrollBy(options);
      }) as typeof window.scrollBy;
    });
    await page.goto("/landing-next");

    for (const label of ["+ Add to trip", "Fix Saturday"]) {
      const button = page.getByRole("button", { name: label });
      await button.dispatchEvent("click");
    }

    const advances = await page.evaluate(
      () => (window as typeof window & { __narrativeAdvances?: number[] }).__narrativeAdvances,
    );
    // "Ask Roam" is no longer its own button — asking is now a chat message
    // in the thread (see PlansChangeScene.tsx), so only two narrative
    // controls remain: Discover's exit and Fix Saturday.
    expect(advances).toEqual([500, 600]);
  });

  test("mobile keeps navigation usable and Discover becomes a native horizontal gallery", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/landing-next");

    await expect(page.locator("header").getByRole("link", { name: "Discover", exact: true })).toBeHidden();
    await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Start a trip" })).toBeVisible();

    const discover = page.locator('[data-scene="discover"]');
    await expect(discover).toHaveCSS("overflow-x", "auto");
    await expect(discover.getByText("Pottery Workshop")).toBeAttached();
  });

  test("plans change: a group message leads to a user-initiated Ask Roam fix, not an automatic one", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    for (const y of [3000, 6000, 8000, 10500, 13076]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
    }

    // Measured, not hardcoded — this scene's own pin length grew (4200,
    // see PlansChangeScene.tsx) to give the itinerary's own reveal beat and
    // the closing headline pair room, same reasoning as the
    // bookings/cinematic-travel tests below.
    const start = await page.evaluate(() => {
      const el = document.querySelector('[data-scene="plans-change"]')!;
      const spacer = el.closest(".pin-spacer") ?? el.parentElement!;
      return spacer.getBoundingClientRect().top + window.scrollY;
    });

    const plansChange = page.locator('[data-scene="plans-change"]');
    await expect(plansChange.getByText("pottery place says they")).toBeVisible();
    // Asking Roam is now a chat message from the viewer, not a button —
    // see PlansChangeScene.tsx.
    await expect(plansChange.getByText("@Roam find another timing")).toBeVisible();

    // The itinerary card used to have no opacity gating at all — fully
    // visible from the moment the scene mounted, before the conversation
    // explaining the change had even played. It should stay at opacity 0
    // until after Roam's reply. (opacity isn't reflected by
    // toBeVisible/toBeHidden, hence the direct CSS check — same reasoning
    // as the bookings test above.)
    await page.evaluate((y) => window.scrollTo(0, y), start + 4200 * 0.46);
    await page.waitForTimeout(500);
    await expect(plansChange.getByText("I found another workshop")).toBeVisible();
    await expect(plansChange.locator('[data-plan-block="itinerary"]')).toHaveCSS("opacity", "0");

    await page.evaluate((y) => window.scrollTo(0, y), start + 4200 * 0.97);
    await page.waitForTimeout(800);

    await expect(plansChange.getByText("Roam keeps up.")).toBeVisible();
    await expect(plansChange.getByText("Pottery Workshop (alt.)")).toBeVisible();
    await expect(plansChange.getByRole("button", { name: "Fix Saturday" })).toBeAttached();
  });

  test("bookings scene presents a static confirmation cluster around the itinerary", async ({ page }) => {
    await page.goto("/landing-next");
    const bookings = page.locator('[data-scene="bookings"]');
    await bookings.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(bookings.locator("[data-booking-packet]")).toHaveCSS("pointer-events", "none");
    await expect(bookings.locator('[data-booking-doc="hotel"]')).toHaveCSS("pointer-events", "auto");
    await expect(bookings.getByRole("heading", { name: "Everything you need." })).toBeVisible();
    await expect(bookings.getByText("Fairmont Le Château")).toBeVisible();
    await expect(bookings.getByText("VIA Rail")).toBeVisible();
    await expect(bookings.getByText("Saturday", { exact: true })).toBeVisible();
  });

  // These two scenes' pin start shifts with viewport width (confirmed
  // earlier in this build — a 1280x720 vs 1440x900 session disagreed by
  // ~186px), so their checkpoints are computed from the actual rendered pin
  // start rather than hardcoded, unlike the scroll-from-zero warmup above.
  test("cinematic travel crossfades through all four Friday moments", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    for (const y of [3000, 6000, 8000, 10500, 13000, 15000, 17576, 19176]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
    }

    const start = await page.evaluate(() => {
      const el = document.querySelector('[data-scene="cinematic-travel"]')!;
      const spacer = el.closest(".pin-spacer") ?? el.parentElement!;
      return spacer.getBoundingClientRect().top + window.scrollY;
    });
    const cinematic = page.locator('[data-scene="cinematic-travel"]');

    await page.evaluate((y) => window.scrollTo(0, y), start + 4200 * 0.19);
    await page.waitForTimeout(1200);
    await expect(cinematic.getByText("Your train leaves in 15 minutes.")).toBeVisible();

    await page.evaluate((y) => window.scrollTo(0, y), start + 4200 * 0.42);
    await page.waitForTimeout(1200);
    await expect(cinematic.getByText("Welcome to Montreal.")).toBeVisible();

    await page.evaluate((y) => window.scrollTo(0, y), start + 4200 * 0.885);
    await page.waitForTimeout(1200);
    await expect(cinematic.getByText("Dinner · 8 minute walk.")).toBeVisible();
  });

  test("finale follows travel directly with the final invitation", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    for (const y of [3000, 6000, 8000, 10500, 13000, 15000, 17576, 19176, 22076]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
    }

    const start = await page.evaluate(() => {
      const el = document.querySelector('[data-scene="finale"]')!;
      const spacer = el.closest(".pin-spacer") ?? el.parentElement!;
      return spacer.getBoundingClientRect().top + window.scrollY;
    });
    const nav = page.locator("header");
    const finale = page.locator('[data-scene="finale"]');

    await page.evaluate((y) => window.scrollTo(0, y), start + 8);
    await page.waitForTimeout(500);
    await expect(nav).toHaveCSS("opacity", "1");
    await expect(finale.getByText("You should go.")).toBeVisible();
  });

  test("footer renders after the finale, unanimated", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);

    const footer = page.locator("footer");
    await expect(footer.getByText("Go somewhere.")).toBeVisible();
    await expect(footer.getByText("© 2026 Where Next")).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
