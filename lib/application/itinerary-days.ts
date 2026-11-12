import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";

/**
 * A whole-trip plan used to be one model call that wrote every day in turn: about 2 s per day, so 8 days took 17 s, and a day
 * could come back thin because the model ran out of places. Here code decides which places go on which day (so no day is thin
 * and nothing repeats), and the days are written side by side, so a long plan takes about as long as a short one.
 */

export const stopSchema = z.object({
  time: z.string().trim().max(20).optional(),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).optional(),
  placeId: z.string().trim().max(240).optional(),
  kind: z.enum(["food", "sight", "activity", "nightlife", "transit", "event", "rest"]).optional(),
});
export type PlanStop = z.infer<typeof stopSchema>;
const daySchema = z.object({
  label: z.string().trim().min(1).max(40),
  subtitle: z.string().trim().max(80).optional(),
  stops: z.array(stopSchema).max(6),
});
const chunkSchema = z.object({ days: z.array(daySchema).min(1).max(8) });
const introSchema = z.object({ title: z.string().trim().max(80).optional(), intro: z.string().trim().max(420).optional() });
export type DraftDay = z.infer<typeof daySchema>;

export type Candidate = { key: string; name: string; id?: string; category: string; kind: string; dayTrip: boolean; address?: string };

/** The kind label for places the traveller saved to the trip. */
export const SAVED = "Saved by you";
const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);

/**
 * Which candidate places go on which day (index 0 is the first day). Each kind of place is dealt out in turn, so every day is a
 * mix; a day trip's places share one day (two on a long trip); a place is on one day only; and the pool is shared evenly, so a
 * small pool thins every day a little instead of emptying the last ones.
 */
export function assignDays(input: { candidates: Candidate[]; days: number; kindOrder: string[]; avoid?: number[] }): Candidate[][] {
  const { days } = input;
  const out: Candidate[][] = Array.from({ length: days }, () => []);
  const rank = (kind: string) => { const at = input.kindOrder.indexOf(kind); return at === -1 ? input.kindOrder.length : at; };
  const byKind = (list: Candidate[]) => {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of list) groups.set(candidate.kind, [...(groups.get(candidate.kind) ?? []), candidate]);
    return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, group]) => group);
  };
  // A day lost to travel is wrong for a one- or two-day plan: day trips are for plans of three days or more.
  const tripGroups = days >= 3 ? byKind(input.candidates.filter((candidate) => candidate.dayTrip)) : [];
  const queues = byKind(input.candidates.filter((candidate) => days < 3 || !candidate.dayTrip));

  const taken = new Set<number>();
  const freeDay = (wanted: number) => {
    const order = [...Array.from({ length: days - wanted + 1 }, (_, i) => wanted + i), ...Array.from({ length: Math.max(0, wanted - 2) }, (_, i) => wanted - 1 - i)];
    return order.find((day) => day >= 2 && !taken.has(day) && !(input.avoid ?? []).includes(day)) ?? null;
  };
  const wantedTripDays = tripGroups.length ? (days >= 7 && tripGroups.length > 1 ? [Math.round(days / 3), Math.round((days * 2) / 3)] : [Math.ceil(days / 2)]) : [];
  const tripDays: number[] = [];
  wantedTripDays.forEach((wanted, i) => {
    const day = freeDay(wanted);
    if (day === null) return;
    taken.add(day);
    tripDays.push(day);
    out[day - 1].push(...tripGroups[i].slice(0, 4));
  });

  const cityDays = Array.from({ length: days }, (_, i) => i + 1).filter((day) => !tripDays.includes(day) || out[day - 1].length < 2);
  // One kind may fill only about a third of the days (a favourite cuisine earns a few dinners, not every one); the traveller's own
  // saved places have no cap. Days still short of two places afterwards are topped up from the kinds used least, so a small pool
  // (or a single kind) still fills every day.
  const cap = Math.max(1, Math.ceil(days / 3));
  const used = new Map<Candidate[], number>();
  const room = (queue: Candidate[]) => (queue[0]?.kind === SAVED ? queue.length : Math.max(0, Math.min(queue.length, cap - (used.get(queue) ?? 0))));
  const size = new Map(queues.map((queue) => [queue, queue.length]));
  const take = (queue: Candidate[], day: number) => { out[day - 1].push(queue.shift()!); used.set(queue, (used.get(queue) ?? 0) + 1); };
  const available = () => queues.reduce((sum, queue) => sum + room(queue), 0);
  cityDays.forEach((day, i) => {
    // What is available over what is left of the days: an uneven pool gives the early days one more, never the last day none.
    const target = tripDays.includes(day) ? 3 : clamp(Math.ceil(available() / (cityDays.length - i)), 1, 7);
    for (let step = 0; out[day - 1].length < target; step++) {
      const queue = [...queues.slice((i + step) % queues.length), ...queues.slice(0, (i + step) % queues.length)].find((candidate) => room(candidate) > 0);
      if (!queue) break;
      take(queue, day);
    }
  });
  for (;;) {
    const thin = cityDays.filter((day) => out[day - 1].length < 2).sort((a, b) => out[a - 1].length - out[b - 1].length || a - b)[0];
    // A kind the day does not already have first, then the kind used least, then the rarer one (a kind with a dozen results is not a kind
    // the traveller wants a dozen of).
    const there = new Set((thin === undefined ? [] : out[thin - 1]).map((candidate) => candidate.kind));
    const queue = queues.filter((candidate) => candidate.length).sort((a, b) => Number(there.has(a[0].kind)) - Number(there.has(b[0].kind)) || (used.get(a) ?? 0) - (used.get(b) ?? 0) || (size.get(a) ?? 0) - (size.get(b) ?? 0))[0];
    if (thin === undefined || !queue) break;
    take(queue, thin);
  }
  return out;
}

const DAY_SYSTEM = (language: string) => `You write ONE part of a trip plan: the days named below, from the candidate places given for each day. Write "subtitle" and "note" in language "${language}" (BCP-47); "time" and "kind" stay in their given formats. Return JSON only:
{"days":[{"label":"Day 2","subtitle":"<3-5 word theme>","stops":[{"time":"09:00","title":"<exact candidate name>","note":"<one line: why it fits or a tip>","placeId":"<id of the candidate, or omit>","kind":"sight"}]}]}
Rules:
- One entry per day named, labelled exactly as given.
- Use ONLY that day's CANDIDATES: never another day's, never a venue that is not listed. Choose 2 to 4 of them (all of them when there are fewer), in the order you would do them, keeping stops in the same area close together. Copy the title and the id exactly; a candidate with no id gets no placeId.
- Give every stop a real 24-hour clock time at a sensible pace (breakfast ~08:30, lunch ~12:30, dinner ~19:00, a museum or sight ~10:00-15:00, nightlife ~21:00+).
- A restaurant or cafe goes at a meal time and is never the whole day: choose a mix of kinds when the candidates allow it.
- Candidates marked "day trip" are far from the centre: they are the day, with time left for the journey.
- If an EVENT is listed for a day, use it only when it suits the traveller, with its title and time copied exactly, kind "event" and no placeId. A MUST event is booked: it appears exactly once, with its time, and the rest of that day is built around it.
- note: one short line, why it suits this traveller or a practical tip. No fluff.
- The Request may say how to change a day ("more relaxed", "with kids", "something cheaper"): follow it in what you choose and how many stops you give (fewer, slower stops for relaxed). Candidates of kind "Current plan" are what the day holds now: keep the ones that still fit the request.
- If the Request or the Traveller states a budget, favour free and low-cost candidates and keep to its spirit; never state a price you were not given.
- The subtitle names what the listed stops really are. A day with no candidates gets "stops":[].
- kind: one of food | sight | activity | nightlife | transit | event | rest.
No preamble, no markdown.`;

const EDIT_INTRO_SYSTEM = (language: string) => `You write the title and the short lead-in for days of a trip plan that were just reworked at the traveller's request. Write both in language "${language}" (BCP-47). Return JSON only:
{"title":"<Day N reworked, or the days, in a few words>","intro":"<1-2 concise sentences: what changed and why it suits what they asked for>"}
Mention only what THE PLAN below holds; never invent a venue. No preamble, no markdown.`;

const INTRO_SYSTEM = (language: string) => `You write the title and the opening of a day-by-day trip plan. Write both in language "${language}" (BCP-47). Return JSON only:
{"title":"<N> days in <city>","intro":"<2-3 concise sentences: how many days this covers and the shape of them, tied to what the traveller actually asked for (their cuisine, group, base) rather than generic travel talk; if DAYS WITH FEW OPTIONS are listed, say so in one clause (\\"I found fewer options for days 5-8\\", never calling them \\"saved\\" places) and invite them to name what else they want; then one thing to book ahead>"}
Mention only what THE PLAN below holds; never invent a venue. No preamble, no markdown.`;

export type DayBrief = {
  /** The day's number in the trip (Day 1 is 1). */
  number: number;
  candidates: Candidate[];
  /** Ready-made lines for the events on this day, and the booked event, when there are any. */
  events: string[];
  must: string | null;
  /** The city this day is in, for a plan that spans several. */
  city?: string;
};

const describe = (candidate: Candidate) => `- ${candidate.name} | ${candidate.id ? `id:${candidate.id}` : "(saved, no id)"} | ${candidate.category} | kind: ${candidate.kind}${candidate.dayTrip ? ", day trip" : ""}${candidate.address ? ` | ${candidate.address}` : ""}`;

/** Every call gets the time one day of writing needs, however many run at once. */
const deadlineFor = (signal: AbortSignal | undefined, perCall: number) => withDeadline(signal, Math.max(AI_DEADLINE_MS.sideBuilder, 8_000 + perCall * 4_000));

/**
 * Writes the days side by side (up to eight calls, a few days each beyond eight) with the title and intro in parallel. A day whose
 * call failed still gets its candidates as plain stops, so a hiccup never leaves a hole. Null when nothing could be written at all.
 */
export async function writeDays(input: {
  days: DayBrief[];
  tripSummary: string;
  prompt: string;
  pace: string;
  city: string;
  /** "edit": the days are a rework of days already in the trip, so the lead-in says what changed instead of introducing a trip. */
  mode?: "plan" | "edit";
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<{ title?: string; intro?: string; days: DraftDay[] } | null> {
  const language = input.language ?? "en";
  const size = Math.max(1, Math.ceil(input.days.length / 8));
  const chunks = Array.from({ length: Math.ceil(input.days.length / size) }, (_, i) => input.days.slice(i * size, (i + 1) * size));
  const head = `Traveller: ${input.tripSummary}\nPace: ${input.pace}\nRequest: ${input.prompt}\n`;

  const thin = input.days.filter((day) => day.candidates.length < 2).map((day) => day.number);
  const intro = runBulkBuilder(
    input.mode === "edit" ? EDIT_INTRO_SYSTEM(language) : INTRO_SYSTEM(language),
    `${head}City: ${input.city}\nDays: ${input.days.length}\n${thin.length ? `DAYS WITH FEW OPTIONS: ${thin.join(", ")}\n` : ""}\nTHE PLAN:\n${input.days.map((day) => `Day ${day.number}${day.city ? ` (${day.city})` : ""}: ${[...new Set(day.candidates.map((candidate) => candidate.kind))].slice(0, 3).join(", ") || "nothing found yet"}${day.candidates.some((candidate) => candidate.dayTrip) ? " (a day trip)" : ""}${day.events.length ? `; events: ${day.events.map((line) => line.split(" | ")[0]).join(", ")}` : ""}`).join("\n")}`,
    introSchema,
    withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    input.onUsage,
  );
  const written = chunks.map((chunk) => runBulkBuilder(
    DAY_SYSTEM(language),
    `${head}\n${chunk.map((day) => `=== Day ${day.number}${day.city ? ` (${day.city})` : ""}\nCANDIDATES:\n${day.candidates.length ? day.candidates.map(describe).join("\n") : "(none)"}${day.events.length ? `\nEVENTS on this day (title | time | venue):\n${day.events.map((line) => `- ${line}`).join("\n")}` : ""}${day.must ? `\nMUST (booked): ${day.must}` : ""}`).join("\n\n")}`,
    chunkSchema,
    deadlineFor(input.signal, chunk.length),
    input.onUsage,
  ));
  const [introResult, ...results] = await Promise.all([intro, ...written]);
  if (results.every((result) => !result)) return null;

  const byNumber = new Map<number, DraftDay>();
  results.forEach((result, c) => result?.days.forEach((day, i) => byNumber.set(Number(day.label.match(/\d+/)?.[0]) || chunks[c][i]?.number, day)));
  const days = input.days.map((day): DraftDay => {
    const drafted = byNumber.get(day.number);
    if (drafted) return { ...drafted, label: `Day ${day.number}` };
    return { label: `Day ${day.number}`, stops: day.candidates.slice(0, 3).map((candidate) => ({ title: candidate.name, ...(candidate.id ? { placeId: candidate.id } : {}) })) };
  });
  return { ...(introResult?.title ? { title: introResult.title } : {}), ...(introResult?.intro ? { intro: introResult.intro } : {}), days };
}
