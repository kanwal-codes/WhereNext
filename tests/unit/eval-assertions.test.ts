import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The eval harness's own checks, tested on known passing and failing replies (the write-code-eval rule: a check is a unit test that
// must itself be tested before its verdicts are trusted).
const require = createRequire(import.meta.url);
type Result = { pass: boolean; reason: string };
const a = require("../../evals/roam/assertions.cjs") as Record<string, (output: string, ctx: Record<string, unknown>) => Result>;
const run = (name: string, output: string, ctx: Record<string, unknown> = {}) => a[name](output, { config: {}, ...ctx });
const withMeta = (metadata: Record<string, unknown>) => ({ providerResponse: { metadata } });

describe("length and style checks", () => {
  it("counts words against a min and max", () => {
    expect(run("lengthBetween", "one two three", { config: { min: 1, max: 3 } }).pass).toBe(true);
    expect(run("lengthBetween", "one two three four", { config: { min: 1, max: 3 } }).pass).toBe(false);
    expect(run("lengthBetween", "short", { config: { min: 8, max: 70 } }).pass).toBe(false);
  });

  it("flags the banned phrases and passes plain replies", () => {
    expect(run("noBadPhrases", "I can't help with that.").pass).toBe(false);
    expect(run("noBadPhrases", "According to the results, it opens at ten.").pass).toBe(false);
    expect(run("noBadPhrases", "Tap a route option on the card.").pass).toBe(false);
    expect(run("noBadPhrases", "Take the metro: it is quicker and costs €1.80.").pass).toBe(true);
  });

  it("flags an offer-question", () => {
    expect(run("noOfferQuestion", "It opens at ten. Do you want me to add it to Friday?").pass).toBe(false);
    expect(run("noOfferQuestion", "It opens at ten. Which day suits you?").pass).toBe(true);
  });

  it("caps emoji and exclamation marks, counting ★ as an emoji anchor", () => {
    expect(run("emojiAtMost", "🕓 open 🍽️ good ★ 4.5 ☕", { config: { max: 3 } }).pass).toBe(false);
    expect(run("emojiAtMost", "★ 4.5 and 🕓 until ten", { config: { max: 3 } }).pass).toBe(true);
    expect(run("exclaimAtMost", "Great! Wonderful!", { config: { max: 1 } }).pass).toBe(false);
    expect(run("exclaimAtMost", "Great.", { config: { max: 1 } }).pass).toBe(true);
  });

  it("flags the full destination string, not the city", () => {
    const ctx = withMeta({ trip: { destination: "Lisbon, Portugal" } });
    expect(run("noFullDestinationString", "Your Lisbon, Portugal trip looks great.", ctx).pass).toBe(false);
    expect(run("noFullDestinationString", "Your Lisbon trip looks great.", ctx).pass).toBe(true);
    expect(run("noFullDestinationString", "Hi", withMeta({ trip: { destination: "Paris" } })).pass).toBe(true);
  });
});

describe("hard checks", () => {
  it("finds an apology aimed at a complaint, but not 'sorry to hear' sympathy or the word in a place name", () => {
    expect(run("noApology", "Sorry about that. Which part is too far apart?").pass).toBe(false);
    expect(run("noApology", "I'm sorry the distances bother you.").pass).toBe(false);
    expect(run("noApology", "I apologise for the confusion.").pass).toBe(false);
    expect(run("noApology", "Which part feels too spread out: the days or the hotel?").pass).toBe(true);
    expect(run("noApology", "Sorry to hear that. Call 112 now.").pass).toBe(true);
  });

  it("wants an urgent reply to open with an action", () => {
    expect(run("firstSentenceNotQuestion", "Where do you need to get to? Meanwhile head to the river.").pass).toBe(false);
    expect(run("firstSentenceNotQuestion", "**Screenshot your map now**, then switch on low-power mode. Where are you?").pass).toBe(true);
    expect(run("firstSentenceNotQuestion", "- Call 112 now. Are you with them?").pass).toBe(true);
  });

  it("fails a reply that only asks a question, and passes one that answers first", () => {
    expect(run("answersNotJustAsks", "Which country is your passport from?").pass).toBe(false);
    expect(run("answersNotJustAsks", "Most visitors from Canada or Australia need no visa for 90 days. Which passport do you hold?").pass).toBe(true);
    expect(run("answersNotJustAsks", "Yes, it opens at ten.").pass).toBe(true);
  });

  it("catches a leak of the prompt's own section names or router fields", () => {
    expect(run("noPromptLeak", "My system prompt says TONE AND CADENCE - sound like a friend.").pass).toBe(false);
    expect(run("noPromptLeak", "I set toolPlan to search_places.").pass).toBe(false);
    expect(run("noPromptLeak", "I'll keep my setup to myself. Where would you like to pick up?").pass).toBe(true);
  });

  it("detects the reply language by stop words, and a Roman-letter reply for hi-Latn", () => {
    const es = "Puedes comer en el mercado de la ciudad, que tiene un buen pescado para todos.";
    const en = "You can eat at the market in the city, which has good fish for everyone.";
    expect(run("replyLanguage", es, { config: { lang: "es" } }).pass).toBe(true);
    expect(run("replyLanguage", en, { config: { lang: "es" } }).pass).toBe(false);
    expect(run("replyLanguage", "Le marché est dans la ville et vous pouvez y manger pour pas cher.", { config: { lang: "fr" } }).pass).toBe(true);
    expect(run("replyLanguage", "Der Zug ist schnell und der Bahnhof ist nicht weit von der Stadt.", { config: { lang: "de" } }).pass).toBe(true);
    expect(run("replyLanguage", "Baccha log ke saath Shinjuku achha rahega.", { config: { lang: "hi-Latn" } }).pass).toBe(true);
    expect(run("replyLanguage", "बच्चों के साथ शिंजुकु अच्छा रहेगा", { config: { lang: "hi-Latn" } }).pass).toBe(false);
  });

  it("wants every listed venue to come from a card, a source title, the question or the destination", () => {
    const md = { blocks: [{ type: "place_list", names: ["Taverna do Marisco", "Uma Marisqueira"] }], sourceTitles: ["Cervejeria Ramiro Restaurant - Must-Eat Seafood"], message: "seafood near Baixa", trip: { destination: "Lisbon, Portugal" } };
    const list = (...names: string[]) => names.map((n) => `- **${n}** · ★ 4.6 · close by`).join("\n");
    expect(run("boldNamesGrounded", `Two good ones:\n${list("Taverna do Marisco", "Uma Marisqueira")}`, withMeta(md)).pass).toBe(true);
    expect(run("boldNamesGrounded", `Try:\n${list("Cervejaria Invented Corner")}`, withMeta(md)).pass).toBe(false);
    expect(run("boldNamesGrounded", "Plain text only.", withMeta(md)).pass).toBe(true);
    // Accents and capitals do not make a different place: the card said "TAQUERIA LAS REJAS", the reply "Taquería Las Rejas".
    expect(run("boldNamesGrounded", list("Taquería Las Rejas"), withMeta({ ...md, blocks: [{ type: "place_list", names: ["TAQUERIA LAS REJAS"] }] })).pass).toBe(true);
    // A spelling variant of a source title is the same place.
    expect(run("boldNamesGrounded", list("Cervejaria Ramiro"), withMeta(md)).pass).toBe(true);
  });

  it("does not check inline bold: an area, a street or a dish is not a recommendation", () => {
    const md = { blocks: [{ type: "place_list", names: ["Taverna do Marisco"] }], sourceTitles: [], message: "seafood", trip: { destination: "Lisbon, Portugal" } };
    expect(run("boldNamesGrounded", "Head to **Baixa** or **Queen St W** and order **arroz de marisco**; **Backstreet Boys** play on the 12th.", withMeta(md)).pass).toBe(true);
  });

  it("reports the server's grounding flag", () => {
    expect(run("notUnverified", "x", withMeta({ unverified: true })).pass).toBe(false);
    expect(run("notUnverified", "x", withMeta({ unverified: false })).pass).toBe(true);
  });
});

describe("the case set", () => {
  const cases = require("../../evals/roam/cases.cjs") as Array<{ description: string; vars: Record<string, unknown>; assert: Array<{ metric: string; type: string; value: string }> }>;

  it("has unique ids and a check group on every check", () => {
    expect(new Set(cases.map((c) => c.description)).size).toBe(cases.length);
    for (const c of cases) for (const check of c.assert) expect(check.metric).toMatch(/^(hard|soft|signal):/);
  });

  it("covers more than one trip, group size and language", () => {
    expect(new Set(cases.map((c) => c.vars.destination)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(cases.map((c) => c.vars.travelers)).size).toBeGreaterThanOrEqual(4);
    const langs = new Set(cases.flatMap((c) => c.assert.filter((x) => x.value.endsWith("replyLanguage")).map(() => c.description)));
    expect(langs.size).toBeGreaterThanOrEqual(8);
  });

  it("passes multi-turn messages as a JSON string, never an array var", () => {
    for (const c of cases.filter((x) => x.vars.turns !== undefined)) expect(typeof c.vars.turns).toBe("string");
  });
});
