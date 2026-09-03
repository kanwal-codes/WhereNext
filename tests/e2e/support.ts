import { expect, type Page } from "@playwright/test";

export type TripFormInput = {
  name: string;
  destination: string;
  origin?: string;
  /** Trip length in days. Uses the form's "Set length instead" toggle. */
  days?: string;
  travelers?: string;
  vibe?: string;
};

/**
 * Fill and submit the new-trip form, returning the created trip id. Kept here so
 * the form's field contract lives in one place — the form has a Dates block with
 * a "length instead" toggle, not a "Days" field.
 */
export async function createTripViaForm(page: Page, t: TripFormInput): Promise<string> {
  await page.goto("/trips/new");
  await page.getByLabel("Trip name").fill(t.name);
  await page.getByLabel("Destination").fill(t.destination);
  if (t.origin) await page.getByLabel("Starting from").fill(t.origin);
  if (t.travelers) await page.getByLabel("Travelers").fill(t.travelers);
  if (t.vibe) await page.getByLabel("Vibe").fill(t.vibe);
  if (t.days) {
    await page.getByRole("button", { name: "Not sure yet? Set length instead" }).click();
    await page.getByPlaceholder("Number of days").fill(t.days);
  }
  await page.getByRole("button", { name: "Create trip" }).click();
  // The app redirects a new trip straight to .../chat (sometimes with ?ask=…).
  // Generous timeout: the chat route is the heaviest and cold-compiles on first hit in `next dev`.
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}(\/|\?|$)/i, { timeout: 30_000 });
  const id = page.url().match(/\/trips\/([0-9a-f-]{36})/i)?.[1];
  if (!id) throw new Error(`no trip id in ${page.url()}`);
  // Land on the overview regardless of where the app sent us, so callers get a stable page.
  await page.goto(`/trips/${id}`);
  return id;
}

export type ConvoMessage = { role: string; content: string; metadata?: Record<string, unknown> };

/** Fetch the trip conversation from inside the browser (auth cookie in scope). */
export async function conversation(page: Page, tripId: string): Promise<ConvoMessage[]> {
  return page.evaluate(async (id) => {
    const r = await fetch(`/api/trips/${id}/conversation`);
    return r.ok ? ((await r.json()).messages ?? []) : [];
  }, tripId);
}

/**
 * Every URL an assistant turn commits to. By design the prose carries none —
 * links and photos live on the card blocks and in `metadata.sources`.
 */
export function turnUrls(message: ConvoMessage | undefined): string[] {
  const m = (message?.metadata ?? {}) as { sources?: unknown[]; blocks?: unknown[] };
  const out: string[] = [];
  for (const s of m.sources ?? []) {
    const url = (s as { url?: unknown }).url;
    if (typeof url === "string") out.push(url);
  }
  for (const b of m.blocks ?? []) {
    const block = b as { places?: unknown[]; items?: unknown[] };
    for (const p of block.places ?? []) {
      const { sourceUrl, photoUrl } = p as { sourceUrl?: unknown; photoUrl?: unknown };
      if (typeof sourceUrl === "string") out.push(sourceUrl);
      if (typeof photoUrl === "string") out.push(photoUrl);
    }
    for (const it of block.items ?? []) {
      const url = (it as { url?: unknown }).url;
      if (typeof url === "string") out.push(url);
    }
  }
  return out;
}

/** Count of assistant turns right now — capture before sending, pass as `sinceCount` below. */
export async function assistantCount(page: Page, tripId: string): Promise<number> {
  return (await conversation(page, tripId)).filter((m) => m.role === "assistant").length;
}

/** The most recent assistant turn (with its metadata), or undefined. */
export async function lastAssistant(page: Page, tripId: string): Promise<ConvoMessage | undefined> {
  return (await conversation(page, tripId)).filter((m) => m.role === "assistant").at(-1);
}

/** Split a URL list into total links and the photo-proxy subset — for spec telemetry. */
export function urlStats(urls: string[]): { links: number; photos: number } {
  return {
    links: urls.filter((u) => /^https?:\/\//.test(u)).length,
    photos: urls.filter((u) => /\/api\/trips\/.*\/places\/google\/photo/.test(u)).length,
  };
}

/** Poll until a NEW assistant turn (past `sinceCount`) has landed, then return its content. */
export async function waitForAssistant(page: Page, tripId: string, sinceCount: number, timeout = 60_000): Promise<string> {
  let content = "";
  await expect
    .poll(async () => {
      const assistants = (await conversation(page, tripId)).filter((m) => m.role === "assistant");
      content = assistants.length > sinceCount ? (assistants.at(-1)?.content ?? "") : "";
      return content;
    }, { timeout })
    .toBeTruthy();
  return content;
}

/**
 * Poll until a NEW assistant turn (past `sinceCount`) has landed AND exposes at
 * least one URL in its metadata, then return those URLs joined. Fails loudly
 * (times out) if a turn that should cite sources never does.
 */
export async function assistantTurnUrls(page: Page, tripId: string, sinceCount: number, timeout = 60_000): Promise<string> {
  let joined = "";
  await expect
    .poll(async () => {
      const assistants = (await conversation(page, tripId)).filter((m) => m.role === "assistant");
      if (assistants.length <= sinceCount) return "";
      joined = turnUrls(assistants.at(-1)).join(" ");
      return joined;
    }, { timeout })
    .not.toBe("");
  return joined;
}
