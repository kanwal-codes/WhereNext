import { expect, test } from "@playwright/test";

const tripId = "rebuild-preview";

const publicRoutes = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/reset-password/update",
  "/account",
  "/privacy",
  "/terms",
  "/~offline",
  "/join/invalid-token",
  "/s/invalid-share",
  "/s/invalid-share/map",
  "/trips",
  "/trips/new",
];
const workspaceRoutes = [
  `/trips/${tripId}`,
  `/trips/${tripId}/chat`,
  `/trips/${tripId}/discover`,
  `/trips/${tripId}/map`,
  `/trips/${tripId}/stay`,
  `/trips/${tripId}/stay/example-hotel`,
  `/trips/${tripId}/stay/alternatives`,
  `/trips/${tripId}/place/example-place`,
  `/trips/${tripId}/event`,
  `/trips/${tripId}/itinerary`,
  `/trips/${tripId}/today`,
  `/trips/${tripId}/compare`,
  `/trips/${tripId}/knowledge`,
  `/trips/${tripId}/bookings`,
  `/trips/${tripId}/budget`,
  `/trips/${tripId}/transport`,
];

const viewports = [
  { name: "narrow phone", width: 320, height: 720 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "wide desktop", width: 1440, height: 900 },
];

test("public and trip surfaces keep the app canvas inside every viewport", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of [...publicRoutes, ...workspaceRoutes]) {
      pageErrors.length = 0;
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (workspaceRoutes.includes(route)) {
        expect(response?.status(), `${viewport.name} ${route} did not render its real screen`).toBeLessThan(400);
      }
      await expect(page.locator("body")).toBeVisible();
      await page.waitForTimeout(80);

      const metrics = await page.evaluate(() => ({
        rootWidth: document.documentElement.clientWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        mainRight: document.querySelector("main")?.getBoundingClientRect().right ?? 0,
        viewportWidth: window.innerWidth,
      }));

      expect(metrics.rootScrollWidth, `${viewport.name} ${route} widens the document`).toBeLessThanOrEqual(metrics.rootWidth + 1);
      expect(metrics.bodyScrollWidth, `${viewport.name} ${route} widens the body`).toBeLessThanOrEqual(metrics.bodyWidth + 1);
      expect(metrics.mainRight, `${viewport.name} ${route} pushes its main surface off-screen`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(pageErrors, `${viewport.name} ${route} raised a browser error`).toEqual([]);
    }
  }
});

test("visible controls expose accessible names on public and trip surfaces", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of [...publicRoutes, ...workspaceRoutes]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(80);

    const unnamed = await page.locator("button:visible, input:visible, textarea:visible, select:visible").evaluateAll((controls) =>
      controls.flatMap((control) => {
        const element = control as HTMLInputElement;
        const hasName = Boolean(
          element.getAttribute("aria-label")?.trim()
          || element.getAttribute("aria-labelledby")?.trim()
          || element.getAttribute("title")?.trim()
          || element.labels?.length
          || element.textContent?.trim()
          || (element instanceof HTMLInputElement && ["submit", "button", "reset"].includes(element.type) && element.value.trim()),
        );
        return hasName ? [] : [element.outerHTML.slice(0, 180)];
      }),
    );

    expect(unnamed, `${route} has visible unnamed controls`).toEqual([]);
  }
});

test("reduced-motion users receive stable responsive routes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/sign-up", "/forgot-password", `/trips/${tripId}/chat`]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth, `${route} overflows with reduced motion`).toBeLessThanOrEqual(metrics.width + 1);
  }
});
