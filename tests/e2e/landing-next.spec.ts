import { test, expect, type Locator, type Page } from "@playwright/test";

// opacity is not reflected by toBeVisible, so multiply it up the ancestor chain.
const opacityOf = (locator: Locator) =>
  locator.evaluate((el) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  });

// Scroll a scene into view in steps, the way a visitor arrives, so its once-only entrance fires.
async function arriveAt(page: Page, scene: string) {
  const top = await page.evaluate((s) => document.querySelector(`[data-scene="${s}"]`)!.getBoundingClientRect().top + window.scrollY, scene);
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), from + ((top - from) * i) / 6);
    await page.waitForTimeout(60);
  }
}

// Scrolls so the problem scene's desk sits in the middle of the window.
async function centreDesk(page: Page) {
  await page.evaluate(() => {
    const desk = [...document.querySelectorAll("[data-desk]")].find((d) => (d as HTMLElement).offsetParent) as HTMLElement;
    const rect = desk.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top + rect.height / 2 - window.innerHeight * 0.5);
  });
}

// The landing page: a boarding-pass first screen, then five calm scenes.
test.describe("landing page", () => {
  test("renders the opening scene without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/landing-next");

    await expect(page.getByRole("heading", { name: "Check in to your next trip.", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a trip" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    await expect(page.locator("header").getByRole("link", { name: "Where Next home" })).toBeAttached();
    expect(errors).toEqual([]);
  });

  test("every Start a trip leads back to the prompt box, from anywhere on the page", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    await page.getByRole("link", { name: "Start a trip" }).last().click();
    await expect(page.getByRole("textbox", { name: "Describe the trip you want" })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(20);
  });

  test("a refresh mid-page restarts the story from the top", async ({ page }) => {
    await page.goto("/landing-next");
    await arriveAt(page, "showcase");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);

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
    await expect(prompt.getByRole("heading", { name: "Check in to your next trip.", exact: true })).toBeVisible();
    const box = prompt.getByRole("textbox", { name: "Describe the trip you want" });
    const submit = prompt.getByRole("button", { name: /Start planning/ });
    // Sending nothing is not an error: it takes the visitor to the field.
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(box).toBeFocused();

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
    await expect(prompt.getByRole("alert")).toContainText("We couldn't start that just now");
    await expect(prompt.getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", /\/sign-up/);
    await expect(prompt.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    await expect(prompt.getByRole("button", { name: /Start planning/ })).toBeEnabled();
  });

  test("scene zero asks politely for an account when the daily guest limit is reached", async ({ page }) => {
    await page.route("**/api/guest/start", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "x", code: "guest_busy" }) }),
    );
    await page.goto("/landing-next");
    const prompt = page.locator('[data-scene="prompt"]');
    await prompt.getByRole("textbox", { name: "Describe the trip you want" }).fill("Rome for 5 days");
    await prompt.getByRole("button", { name: /Start planning/ }).click();
    const notice = prompt.getByRole("alert");
    await expect(notice).toContainText("You've been planning a lot today");
    await expect(notice).toContainText("Create a free account to keep going");
    await expect(notice).not.toContainText("That's a lot of new trips");
    await expect(notice.getByRole("link", { name: "Create a free account" })).toBeVisible();
  });

  test("nav compresses after scrolling past the hero", async ({ page }) => {
    await page.goto("/landing-next");
    const header = page.locator("header");
    await expect(header).toHaveClass(/h-20/);

    await page.mouse.wheel(0, 500);
    await expect(header).toHaveClass(/h-16/);
  });

  test("the story scenes wait until they are reached, then play once", async ({ page }) => {
    await page.goto("/landing-next");
    const problem = page.locator('[data-scene="problem"]');
    const headline = problem.getByRole("heading", { name: "Every trip starts as a mess." });
    await page.waitForTimeout(1200);
    expect(await opacityOf(headline)).toBeLessThan(0.05);

    await arriveAt(page, "problem");
    await expect.poll(() => opacityOf(headline), { timeout: 6000 }).toBeGreaterThan(0.95);
    await expect(headline).toHaveAttribute("data-done", "");

    // Scrolling away and back leaves it settled: nothing replays.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await arriveAt(page, "problem");
    expect(await opacityOf(headline)).toBeGreaterThan(0.95);
  });

  test("the pass reads the sentence: place, people, dates, budget and style appear as you type", async ({ page }) => {
    await page.goto("/landing-next");
    const prompt = page.locator('[data-scene="prompt"]');
    await prompt.getByRole("textbox", { name: "Describe the trip you want" }).fill("Four of us, Montreal, Oct 16–19, $900 each, no museums");
    const fields = prompt.locator("dl.bp-fields");
    await expect(fields).toContainText("4 people");
    await expect(fields).toContainText("Oct 16–19");
    await expect(fields).toContainText("$900 each");
    await expect(fields).toContainText("No museums");
    await expect(prompt.locator(".bp-chip")).toHaveText("YUL");
    // Unclear things stay as prompts instead of guesses.
    await prompt.getByRole("textbox", { name: "Describe the trip you want" }).fill("Somewhere nice");
    await expect(fields).toContainText("Add dates");
  });

  test("the first screen is plain text and CSS: no image is loaded for it", async ({ page }) => {
    await page.goto("/landing-next");
    await expect(page.locator('[data-scene="prompt"] img')).toHaveCount(0);
  });

  test("the pile is held for a beat when you stop on it, and is already tidy if you flick past", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/landing-next");
    await page.waitForTimeout(1500);
    const scene = page.locator('[data-scene="problem"]');
    // Stop with the desk centred: still a pile at first, tidy a moment later.
    await centreDesk(page);
    await page.waitForTimeout(500);
    await expect(scene).not.toHaveAttribute("data-settled", "");
    await expect(scene).toHaveAttribute("data-settled", "", { timeout: 4000 });
    await expect(scene.getByText("Roam puts it all in one place.")).toBeAttached();

    // A visitor who flicks straight past it, then comes back, finds it finished (and it stays so going up).
    await page.reload();
    await page.waitForTimeout(1500);
    for (let y = 0; y < 2600; y += 520) {
      await page.mouse.wheel(0, 520);
      await page.waitForTimeout(30);
    }
    await expect(scene).toHaveAttribute("data-settled", "", { timeout: 3000 });
    await centreDesk(page);
    await page.waitForTimeout(400);
    await expect(scene).toHaveAttribute("data-settled", "");
  });

  test("nothing in view is left hidden after a jump, and scrolling back up never takes anything away", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/landing-next");
    await page.waitForTimeout(1500);
    const hiddenInView = () =>
      page.evaluate(() => {
        const vh = window.innerHeight;
        const o = (el: Element) => {
          let v = 1;
          for (let n: Element | null = el; n; n = n.parentElement) v *= parseFloat(getComputedStyle(n).opacity);
          return v;
        };
        return [...document.querySelectorAll(".rv")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().bottom > 70 && e.getBoundingClientRect().top < vh * 0.6 && o(e) < 0.97).length;
      });
    for (const y of [900, 2300, 3300, 4400, 5600]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(150);
      expect(await hiddenInView(), `at ${y}px`).toBe(0);
    }
    // Back up through everything: whatever was revealed stays revealed.
    for (let y = 5600; y >= 0; y -= 450) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(60);
      expect(await hiddenInView(), `going up, at ${y}px`).toBe(0);
    }
  });

  test("say it once: a message is typed once the visitor stops, Roam answers, and the trip brief appears", async ({ page }) => {
    await page.goto("/landing-next");
    await arriveAt(page, "say-it-once");
    const scene = page.locator('[data-scene="say-it-once"]');
    await expect(scene.getByText("Got it. Here’s the trip so far.")).toBeVisible({ timeout: 8000 });
    await expect.poll(() => opacityOf(scene.getByText("No museums", { exact: true })), { timeout: 8000 }).toBeGreaterThan(0.95);
    await expect(scene.getByText("Bad Bunny · Oct 16")).toBeVisible();
  });

  test("showcase swaps one panel as the list advances, on a tall desktop window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/landing-next");
    await arriveAt(page, "showcase");
    const scene = page.locator('[data-scene="showcase"]');
    const track = scene.locator(":scope > div.relative");
    const box = await track.evaluate((el) => ({ top: el.getBoundingClientRect().top + window.scrollY, h: (el as HTMLElement).offsetHeight }));

    const current = () => scene.locator('button[aria-current="true"]').innerText();
    for (const [fraction, title] of [
      [0.08, "Find what fits"],
      [0.5, "Plans change. Roam keeps up."],
      [0.92, "Everything in one place"],
    ] as const) {
      await page.evaluate(([t, h, f]) => window.scrollTo(0, t + (h - window.innerHeight) * f), [box.top, box.h, fraction] as const);
      await expect.poll(current, { timeout: 4000 }).toContain(title);
    }
  });

  test("showcase stacks all three moments on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/landing-next");
    const scene = page.locator('[data-scene="showcase"]');
    for (const title of ["Find what fits", "Plans change. Roam keeps up.", "Everything in one place"]) {
      await expect(scene.getByRole("heading", { name: title })).toBeAttached();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("tradeoff shows a recommendation with its reasons, cost and tradeoff", async ({ page }) => {
    await page.goto("/landing-next");
    await arriveAt(page, "tradeoff");
    const scene = page.locator('[data-scene="tradeoff"]');
    await expect(scene.getByRole("heading", { name: /Roam suggests/ })).toBeVisible();
    for (const label of ["Why it fits", "What it costs", "The tradeoff"]) await expect(scene.getByText(label, { exact: true })).toBeVisible();
  });

  test("the last screen ends on the travel wallet: the question is printed on the pass, a third of it sits in the pocket", async ({ page }) => {
    await page.route("**/api/guest/start", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ tripId: "trip-end" }) }),
    );
    await page.route("**/trips/trip-end/chat", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>chat</body></html>" }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/landing-next");
    await arriveAt(page, "finale");

    const finale = page.locator('[data-scene="finale"]');
    await expect(finale.getByRole("heading", { name: "Where next?" })).toBeAttached();
    // The pass slides out of the wallet and stops with part of it still inside; the stub stays attached.
    await expect(page.locator(".wl")).toHaveAttribute("data-out", "", { timeout: 5000 });
    await page.waitForTimeout(1300);
    await expect(finale.locator(".bp-peeled")).toHaveCount(0);
    const box = finale.getByRole("textbox", { name: "Where do you want to go next?" });
    await expect(box).toHaveValue("");
    await expect(box).toHaveAttribute("placeholder", "Where next?");
    // Nothing is pre-filled: the fields wait for a trip.
    await expect(finale.locator("dl.bp-fields")).toContainText("Add dates");
    const pocket = await page.evaluate(() => {
      const pass = document.querySelector(".wl .bp")!.getBoundingClientRect();
      const front = document.querySelector(".wl-front")!.getBoundingClientRect();
      return (pass.bottom - front.top) / pass.height;
    });
    expect(pocket).toBeGreaterThan(0.2);
    expect(pocket).toBeLessThan(0.4);

    // It is a real send: write a trip, send it, and the chat opens with that sentence.
    await box.fill("Four of us, Montreal, Oct 16–19, $900 each, no museums");
    await expect(finale.locator("dl.bp-fields")).toContainText("4 people");
    const request = page.waitForRequest("**/api/guest/start");
    await finale.getByRole("button", { name: /Start planning/ }).first().click();
    expect((await request).postDataJSON()).toMatchObject({ prompt: "Four of us, Montreal, Oct 16–19, $900 each, no museums" });
    await page.waitForURL("**/trips/trip-end/chat");
  });

  test("the legal line is lettered on the wallet, so the page ends on it", async ({ page }) => {
    await page.goto("/landing-next");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const legal = page.locator(".wl-front footer");
    await expect(legal.getByText("© 2026 Where Next")).toBeVisible();
    await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(page.locator("main ~ footer, #main-content ~ footer")).toHaveCount(0);
  });

  test("jumping straight to the end finds the pass already out of the wallet, with no blank space below it", async ({ page }) => {
    await page.goto("/landing-next");
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".wl")).toHaveAttribute("data-out", "", { timeout: 3000 });
    const gap = await page.evaluate(() => document.documentElement.scrollHeight - (document.querySelector(".wl-front")!.getBoundingClientRect().bottom + window.scrollY));
    expect(gap).toBeLessThan(2);
  });

  test("with reduced motion every scene is simply there", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/landing-next");
    for (const name of ["Every trip starts as a mess.", "One plan, every decision connected."]) {
      expect(await opacityOf(page.getByRole("heading", { name }))).toBe(1);
    }
  });
});
