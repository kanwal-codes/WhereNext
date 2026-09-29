import { test, expect, type Locator, type Page } from "@playwright/test";

// Pin starts/lengths move with viewport size and earlier scenes, so checkpoints
// are measured from the rendered spacers, never hardcoded.
const PINNED_SCENES = 6; // chaos, context, discover, plans-change, bookings, cinematic-travel

async function pinOf(page: Page, scene: string) {
  // Spacers are created after hydration; measuring before that reports a
  // zero-length pin.
  await page.waitForFunction((n) => document.querySelectorAll(".pin-spacer").length >= n, PINNED_SCENES);
  await page.waitForTimeout(500);
  return page.evaluate((s) => {
    const el = document.querySelector(`[data-scene="${s}"]`)!;
    const spacer = el.closest(".pin-spacer") ?? el;
    const rect = spacer.getBoundingClientRect();
    return { top: rect.top + window.scrollY, distance: rect.height - window.innerHeight };
  }, scene);
}

// Scroll in steps so every pinned scene has measured itself before a jump.
async function scrollThrough(page: Page, target: number) {
  for (let y = 1500; y < target; y += 1500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate((yy) => window.scrollTo(0, yy), target);
}

// opacity is not reflected by toBeVisible, so multiply it up the ancestor chain.
const opacityOf = (locator: Locator) =>
  locator.evaluate((el) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  });

// Landing page overhaul (docs/LandingPage_Overhaul) — grows scene by scene
// alongside Build_Plan step 5 / Storyboard order.
test.describe("landing page overhaul", () => {
  test("renders the opening scene without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/landing-next");

    await expect(page.getByRole("heading", { name: /plan something/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a trip" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    await expect(page.locator("header").getByText("Where Next")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a refresh mid-page restarts the story from the top", async ({ page }) => {
    await page.goto("/landing-next");
    const { top, distance } = await pinOf(page, "plans-change");
    await page.evaluate((y) => window.scrollTo(0, y), top + distance * 0.5);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(top);

    await page.reload();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("scene zero asks where to go and hands the sentence to a guest trip", async ({ page }) => {
    await page.route("**/api/guest/start", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ tripId: "trip-abc" }) }),
    );
    await page.route("**/trips/trip-abc/chat", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>chat</body></html>" }));
    await page.goto("/landing-next");

    const prompt = page.locator('[data-scene="prompt"]');
    await expect(prompt.getByRole("heading", { name: "Let’s plan something." })).toBeVisible();
    const box = prompt.getByRole("textbox", { name: "Describe the trip you want" });
    const submit = prompt.getByRole("button", { name: /Start planning/ });
    await expect(submit).toBeDisabled();

    await prompt.getByRole("button", { name: "Solo week in Kyoto" }).click();
    await expect(box).toHaveValue(/Kyoto/);
    await box.fill("Montreal for Bad Bunny with 3 friends");
    await expect(submit).toBeEnabled();

    const request = page.waitForRequest("**/api/guest/start");
    await submit.click();
    expect((await request).postDataJSON()).toMatchObject({ prompt: "Montreal for Bad Bunny with 3 friends" });
    await page.waitForURL("**/trips/trip-abc/chat");
    // The trip chat sends this as the opening message.
    expect(await page.evaluate(() => window.sessionStorage.getItem("wn:first-message:trip-abc"))).toBe("Montreal for Bad Bunny with 3 friends");
  });

  test("the empty box types example trips by itself, and stops once someone writes", async ({ page }) => {
    await page.goto("/landing-next");
    const box = page.locator('[data-scene="prompt"]').getByRole("textbox", { name: "Describe the trip you want" });
    const placeholder = () => box.getAttribute("placeholder");

    await expect.poll(async () => ((await placeholder()) ?? "").length, { timeout: 6000 }).toBeGreaterThan(12);
    const early = (await placeholder()) ?? "";
    await expect.poll(async () => await placeholder(), { timeout: 8000 }).not.toBe(early);

    await box.focus();
    await expect.poll(placeholder).toBe("Tell Roam about your trip…");
  });

  test("scene zero falls back to sign-up when a guest session can't be opened", async ({ page }) => {
    await page.route("**/api/guest/start", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "We couldn't open a guest session. Sign up to start planning.", code: "guest_unavailable" }) }),
    );
    await page.goto("/landing-next");
    const prompt = page.locator('[data-scene="prompt"]');
    await prompt.getByRole("textbox", { name: "Describe the trip you want" }).fill("Rome for 5 days");
    await prompt.getByRole("button", { name: /Start planning/ }).click();
    await expect(prompt.getByRole("alert")).toContainText("couldn't open a guest session");
    await expect(prompt.getByRole("link", { name: "Sign up to start planning" })).toHaveAttribute("href", /\/sign-up/);
    await expect(prompt.getByRole("button", { name: /Start planning/ })).toBeEnabled();
  });

  test("the opening chat plays when its scene scrolls into view, not on page load", async ({ page }) => {
    await page.goto("/landing-next");
    const { top } = await pinOf(page, "chaos");
    const chaos = page.locator('[data-scene="chaos"]');
    const first = chaos.getByText("ROAD TRIP???");
    const last = chaos.getByText("not it", { exact: true });
    await page.waitForTimeout(3000);
    expect(await opacityOf(first)).toBeLessThan(0.05);

    await page.evaluate((y) => window.scrollTo(0, y), top);
    await expect.poll(() => opacityOf(first), { timeout: 8000 }).toBeGreaterThan(0.95);
    await expect.poll(() => opacityOf(last), { timeout: 8000 }).toBeGreaterThan(0.95);
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
    // The header no longer lists these sections; the anchors stay for in-page links.
    await expect(page.locator("header").getByRole("link", { name: "Discover", exact: true })).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: "How it works" })).toHaveCount(0);
  });

  test("chaos scene reveals scattered objects and holds on the second headline", async ({ page }) => {
    await page.goto("/landing-next");
    const { top, distance } = await pinOf(page, "chaos");
    await scrollThrough(page, top + distance * 0.72);
    await page.waitForTimeout(2500);

    const chaos = page.locator('[data-scene="chaos"]');
    await expect.poll(() => opacityOf(chaos.getByText("Roam brings it together."))).toBeGreaterThan(0.95);
    await expect(chaos.getByText("Fairmont Le Château")).toBeVisible();
    expect(await opacityOf(chaos.getByText("Fairmont Le Château"))).toBeGreaterThan(0.9);
  });

  test("discover shows four places at once, then adds pottery by itself", async ({ page }) => {
    await page.goto("/landing-next");
    const { top, distance } = await pinOf(page, "discover");
    const discover = page.locator('[data-scene="discover"]');
    const title = (name: string) => discover.getByRole("heading", { name });
    const titles = ["Mount Royal at golden hour", "A late set at MTELUS", "Rooftop drinks at Le Bain Public", "Pottery Workshop"];
    const reasons = ["Free, $0 each", "Inside your $900 each", "Open past midnight", "Fits the 2 PM gap"];

    // Mid-hold, before the add: every card, its reasons and the group's ♥ are all on screen together.
    await scrollThrough(page, top + distance * 0.45);
    await page.waitForTimeout(2500);
    for (const name of titles) await expect.poll(() => opacityOf(title(name))).toBeGreaterThan(0.95);
    for (const reason of reasons) await expect.poll(() => opacityOf(discover.getByText(reason, { exact: true }))).toBeGreaterThan(0.95);
    await expect.poll(() => opacityOf(discover.getByText("4 of 4", { exact: true }))).toBeGreaterThan(0.95);
    expect(await opacityOf(discover.getByText("Added · Sat 2:00 PM"))).toBeLessThan(0.05);

    // After the add: pottery is confirmed and the other three step back.
    await page.evaluate((y) => window.scrollTo(0, y), top + distance * 0.75);
    await page.waitForTimeout(2500);
    await expect.poll(() => opacityOf(discover.getByText("Added · Sat 2:00 PM"))).toBeGreaterThan(0.95);
    await expect.poll(() => opacityOf(title("Pottery Workshop"))).toBeGreaterThan(0.95);
    expect(await opacityOf(title("Mount Royal at golden hour"))).toBeLessThan(0.6);
    expect(await discover.getByRole("button").count()).toBe(0);

    // Every photo actually loaded.
    const loaded = await discover.locator("img").evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
    expect(loaded).toHaveLength(4);
    for (const width of loaded) expect(width).toBeGreaterThan(640);
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

    await page.getByRole("button", { name: "Fix Saturday" }).dispatchEvent("click");

    const advances = await page.evaluate(
      () => (window as typeof window & { __narrativeAdvances?: number[] }).__narrativeAdvances,
    );
    // "Ask Roam" is no longer its own button — asking is now a chat message
    // in the thread (see PlansChangeScene.tsx), and Discover adds pottery by
    // itself, so the one narrative control left is Fix Saturday.
    expect(advances).toEqual([900]);
  });

  test("mobile keeps navigation usable and Discover fits all four places on one screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/landing-next");

    await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Start a trip" })).toBeVisible();

    const { top, distance } = await pinOf(page, "discover");
    await page.evaluate((y) => window.scrollTo(0, y), top + distance * 0.45);
    await page.waitForTimeout(2500);

    const discover = page.locator('[data-scene="discover"]');
    const titles = ["Mount Royal at golden hour", "A late set at MTELUS", "Rooftop drinks at Le Bain Public", "Pottery Workshop"];
    for (const name of titles) {
      const heading = discover.getByRole("heading", { name });
      await expect.poll(() => opacityOf(heading)).toBeGreaterThan(0.95);
      const box = await heading.boundingBox();
      // Below the fixed header, above the bottom edge: nothing to scroll to see it.
      expect(box!.y).toBeGreaterThan(64);
      expect(box!.y + box!.height).toBeLessThan(844);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("plans change: a group message leads to a user-initiated Ask Roam fix, not an automatic one", async ({ page }) => {
    await page.goto("/landing-next");
    const { top, distance } = await pinOf(page, "plans-change");
    const plansChange = page.locator('[data-scene="plans-change"]');

    // Reply has landed, but the itinerary (opacity isn't reflected by
    // toBeVisible, hence the direct measure) must wait until after it.
    await scrollThrough(page, top + distance * 0.25);
    await page.waitForTimeout(2500);
    await expect(plansChange.getByText("pottery place says they")).toBeVisible();
    await expect(plansChange.getByText("@Roam find another timing")).toBeVisible();
    await expect.poll(() => opacityOf(plansChange.getByText("I found another workshop"))).toBeGreaterThan(0.95);
    expect(await opacityOf(plansChange.locator('[data-plan-block="itinerary"]'))).toBeLessThan(0.05);

    await page.evaluate((y) => window.scrollTo(0, y), top + distance * 0.85);
    await page.waitForTimeout(2500);

    await expect.poll(() => opacityOf(plansChange.getByText("Roam keeps up."))).toBeGreaterThan(0.95);
    await expect.poll(() => opacityOf(plansChange.getByText("Pottery Workshop (alt.)"))).toBeGreaterThan(0.95);
    await expect(plansChange.getByRole("button", { name: "Fix Saturday" })).toBeAttached();
  });

  test("bookings scene presents a static confirmation cluster around the itinerary", async ({ page }) => {
    await page.goto("/landing-next");
    const bookings = page.locator('[data-scene="bookings"]');
    // Assembles as it rises, then rests pinned — check mid-hold.
    const { top, distance } = await pinOf(page, "bookings");
    await scrollThrough(page, top + distance * 0.45);
    await page.waitForTimeout(1500);
    await expect(bookings.locator("[data-bookings-stage]")).toHaveCSS("opacity", "1");
    await expect(bookings.locator("[data-booking-packet]")).toHaveCSS("pointer-events", "none");
    await expect(bookings.locator('[data-booking-doc="hotel"]')).toHaveCSS("pointer-events", "auto");
    await expect(bookings.getByRole("heading", { name: "Everything you need." })).toBeVisible();
    await expect(bookings.getByText("Fairmont Le Château")).toBeVisible();
    await expect(bookings.getByText("VIA Rail")).toBeVisible();
    await expect(bookings.getByText("Saturday", { exact: true })).toBeVisible();
    for (const item of await bookings.locator("[data-reveal]").all()) expect(await opacityOf(item)).toBeGreaterThan(0.95);
  });

  // The page's seam rule: a scene's closing content fades out before its pin
  // releases, so the section that scrolls away is empty and the next one rises
  // into a clean canvas (never two scenes' content on screen together).
  for (const scene of ["chaos", "context", "discover", "plans-change", "bookings", "cinematic-travel"]) {
    test(`${scene} is empty before its pin releases`, async ({ page }) => {
      await page.goto("/landing-next");
      const { top, distance } = await pinOf(page, scene);

      const brightest = () =>
        page.evaluate((s) => {
          const root = document.querySelector(`[data-scene="${s}"]`)!;
          const effective = (el: Element) => {
            let o = 1;
            for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
              const cs = getComputedStyle(n);
              if (cs.visibility === "hidden") return 0;
              o *= parseFloat(cs.opacity);
            }
            return o;
          };
          const content = [...root.querySelectorAll("*")].filter(
            (el) => el.tagName === "IMG" || (el.children.length === 0 && (el.textContent ?? "").trim() !== ""),
          );
          return Math.max(0, ...content.map(effective));
        }, scene);

      // Guard against passing vacuously: the scene does have content mid-pin.
      await scrollThrough(page, top + distance * 0.45);
      await page.waitForTimeout(2500);
      expect(await brightest()).toBeGreaterThan(0.9);

      await page.evaluate((y) => window.scrollTo(0, y), top + distance - 60);
      await page.waitForTimeout(3000);
      expect(await brightest()).toBeLessThan(0.05);
    });
  }

  // A scene plays once: after a full pass down, scrolling back up shows each
  // scene as it was left (settled, held) — never its beats replayed in reverse.
  test("scrolling back up shows finished scenes settled instead of replaying them in reverse", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/landing-next");
    await pinOf(page, "chaos");

    await page.evaluate(() => {
      const seen: Record<string, { found: boolean; max: number }> = {};
      const watch = (key: string, scene: string, text: string) => {
        const root = document.querySelector(`[data-scene="${scene}"]`)!;
        const el = [...root.querySelectorAll("*")].find((n) => (n.children.length === 0 || n.tagName === "H2") && n.textContent?.includes(text));
        seen[key] = { found: !!el, max: 0 };
        return el;
      };
      const targets: [string, Element | undefined][] = [
        ["chaos-mid", watch("chaos-mid", "chaos", "Planning gets messy.")],
        ["chaos-end", watch("chaos-end", "chaos", "Roam brings it together.")],
        ["plans-mid", watch("plans-mid", "plans-change", "Plans change.")],
        ["plans-end", watch("plans-end", "plans-change", "Roam keeps up.")],
        ["cinematic-mid", watch("cinematic-mid", "cinematic-travel", "Your train leaves in 15 minutes.")],
        ["cinematic-end", watch("cinematic-end", "cinematic-travel", "Dinner · 8 minute walk.")],
      ];
      const opacity = (el: Element) => {
        let o = 1;
        for (let n: Element | null = el; n; n = n.parentElement) {
          if (getComputedStyle(n).visibility === "hidden") return 0;
          o *= parseFloat(getComputedStyle(n).opacity);
        }
        return o;
      };
      const w = window as unknown as Record<string, unknown>;
      w.__seen = seen;
      w.__record = () => targets.forEach(([key, el]) => el && (seen[key].max = Math.max(seen[key].max, opacity(el))));
      w.__reset = () => Object.values(seen).forEach((v) => (v.max = 0));
      w.__sweep = (dist: number, speed: number) =>
        new Promise<void>((resolve) => {
          const dir = Math.sign(dist);
          const total = Math.abs(dist);
          let moved = 0;
          let last = performance.now();
          const t0 = last;
          const tick = (now: number) => {
            const dt = now - last;
            last = now;
            if (moved < total) {
              const step = Math.min((speed * dt) / 1000, total - moved);
              document.documentElement.dispatchEvent(new WheelEvent("wheel", { deltaY: dir * step, deltaMode: 0, bubbles: true, cancelable: true }));
              moved += step;
            }
            (w.__record as () => void)();
            if (moved < total || now - t0 < (total / speed) * 1000 + 2000) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
    });

    const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const sweep = (dist: number, speed: number) =>
      page.evaluate(([d, v]) => (window as unknown as { __sweep: (d: number, v: number) => Promise<void> }).__sweep(d, v), [dist, speed]);
    const read = () =>
      page.evaluate(() => (window as unknown as { __seen: Record<string, { found: boolean; max: number }> }).__seen);

    await sweep(total, 900); // first pass: every beat plays
    const down = await read();
    for (const k of ["chaos-mid", "plans-mid", "cinematic-mid"]) {
      expect(down[k].found).toBe(true);
      expect(down[k].max, `${k} should play on the way down`).toBeGreaterThan(0.5);
    }

    await page.evaluate(() => (window as unknown as { __reset: () => void }).__reset());
    await sweep(-total, 1500); // back up
    const up = await read();
    for (const k of ["chaos-end", "plans-end", "cinematic-end"]) {
      expect(up[k].max, `${k} should be the settled frame on the way up`).toBeGreaterThan(0.9);
    }
    for (const k of ["chaos-mid", "plans-mid", "cinematic-mid"]) {
      expect(up[k].max, `${k} must not replay on the way up`).toBeLessThan(0.15);
    }
  });

  // These two scenes' pin start shifts with viewport width (confirmed
  // earlier in this build — a 1280x720 vs 1440x900 session disagreed by
  // ~186px), so their checkpoints are computed from the actual rendered pin
  // start rather than hardcoded, unlike the scroll-from-zero warmup above.
  test("cinematic travel crossfades through all four Friday moments", async ({ page }) => {
    await page.goto("/landing-next");
    const { top, distance } = await pinOf(page, "cinematic-travel");
    const cinematic = page.locator('[data-scene="cinematic-travel"]');

    await scrollThrough(page, top + distance * 0.26);
    await page.waitForTimeout(2500);
    await expect.poll(() => opacityOf(cinematic.getByText("Your train leaves in 15 minutes."))).toBeGreaterThan(0.95);

    await page.evaluate((y) => window.scrollTo(0, y), top + distance * 0.44);
    await page.waitForTimeout(2500);
    await expect.poll(() => opacityOf(cinematic.getByText("Welcome to Montreal."))).toBeGreaterThan(0.95);

    await page.evaluate((y) => window.scrollTo(0, y), top + distance * 0.8);
    await page.waitForTimeout(2500);
    await expect.poll(() => opacityOf(cinematic.getByText("Dinner · 8 minute walk."))).toBeGreaterThan(0.95);
  });

  test("finale follows travel directly with the final invitation", async ({ page }) => {
    await page.goto("/landing-next");
    const { top } = await pinOf(page, "finale");
    await scrollThrough(page, top + 8);
    await page.waitForTimeout(1500);

    const nav = page.locator("header");
    const finale = page.locator('[data-scene="finale"]');
    await expect(nav).toHaveCSS("opacity", "1");
    await expect(finale.getByText("so... Where Next?")).toBeVisible();
  });

  test("footer renders after the finale, unanimated", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);

    const footer = page.locator("footer");
    await expect(footer.getByText("© 2026 Where Next")).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
