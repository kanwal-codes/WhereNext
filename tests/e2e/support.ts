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

/** Create a configured trip for tests whose subject is downstream of trip setup. */
export async function createTripViaForm(page: Page, t: TripFormInput): Promise<string> {
  const response = await page.request.post("/api/trips", {
    data: {
      name: t.name,
      destination: t.destination,
      origin: t.origin,
      durationDays: t.days,
      travelerCount: t.travelers,
      preferences: { interests: [], ...(t.vibe ? { vibe: t.vibe } : {}) },
    },
  });
  const body = (await response.json()) as { trip?: { id?: string } };
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const id = body.trip?.id;
  if (!id) throw new Error("trip creation returned no id");
  await page.goto(`/trips/${id}`);
  return id;
}

export type ConvoMessage = { role: string; content: string; metadata?: Record<string, unknown> };

/** Fetch the trip conversation from inside the browser (auth cookie in scope). */
export async function conversation(page: Page, tripId: string): Promise<ConvoMessage[]> {
  const response = await page.request.get(`/api/trips/${tripId}/conversation`);
  return response.ok() ? ((await response.json()).messages ?? []) : [];
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
