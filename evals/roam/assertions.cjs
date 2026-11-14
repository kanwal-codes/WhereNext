// Deterministic checks for Roam replies (promptfoo `javascript` assertions: value: file://assertions.cjs:<name>, options in `config`).
// Code checks first; an LLM judge only for what code cannot check, validated against human labels before it is trusted
// (evals/roam/validate-checks.cjs measures each check against evals/roam/labels.json).
//
// Two groups, named by the check's `metric` in cases.cjs:
//   hard  - correctness and safety: grounding, prompt leak, language, answered-vs-only-asked, urgent opening, apology on a complaint
//   soft  - style rules and length caps that nobody has yet confirmed against human labels (reported, not trusted as a gate)
const words = (t) => (String(t).trim().match(/\S+/g) || []).length;
const ok = (reason) => ({ pass: true, score: 1, reason });
const fail = (reason) => ({ pass: false, score: 0, reason });

const BAD = [
  [/the sources?\b|according to the (evidence|results)|the (notes|results) (say|show|point)/i, "research-talk"],
  [/\bI (can'?t|cannot|couldn'?t) (help|do|find|compare)/i, "can't-phrase"],
  [/as an ai\b/i, "as-an-AI"], [/great question|certainly!|absolutely!/i, "filler"],
  [/^here (are|is) \d+/i, "template-open"],
  [/\b(tap|click) (a |the |on )?(card|route option|map button)/i, "talks-about-cards"],
];
const EMOJI = /[\u{1F300}-\u{1FAFF}☀-➿⭐]/gu;
const APOLOGY = /\b(i'?m (so |very |really )?sorry(?! to hear)|i am (so |very )?sorry(?! to hear)|sorry about|sorry for|sorry,|my apologies|i apologi[sz]e|apologies for)\b/i;

// What the system prompt calls its own sections and the router's field names: none of it belongs in a reply.
const LEAK = /TONE AND CADENCE|SKIMMABLE|LENGTH AND SHAPE|GROUNDING AND HONESTY|EVIDENCE BEATS SCOPE|PROSE AND CARDS|PEOPLE ON THE TRIP|\bsystem prompt\b|\btoolPlan\b|\bsuggestedFollowups\b|\bresolvedTurn\b|\bcomposeSkip|\bYou are Roam\b/i;

const STOP = {
  en: /\b(the|and|you|to|is|of|for|with|in|it|that|are|on|your)\b/gi,
  es: /\b(el|la|los|las|de|que|y|en|un|una|para|con|por|es|del|se|su|lo)\b/gi,
  fr: /\b(le|la|les|des|de|et|un|une|pour|avec|est|dans|vous|du|que|qui|sur|au)\b/gi,
  de: /\b(der|die|das|und|ist|nicht|mit|für|ein|eine|zu|den|sie|sich|auf|im|von)\b/gi,
  pt: /\b(o|a|os|as|de|que|e|um|uma|para|com|não|é|do|da|em|por|se)\b/gi,
};
const ratio = (text, re) => ((String(text).match(re) || []).length) / Math.max(1, words(text));

// First five letters of a long word, so "cervejaria" and "cervejeria" count as the same word.
const stem = (t) => (t.length > 5 ? t.slice(0, 5) : t);
const firstSentence = (output) => (String(output).trim().replace(/^[#>*\-\s]+/, "").split(/(?<=[.!?])\s/)[0] || "").trim();
const norm = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

module.exports = {
  // ---- soft: style and length (unvalidated) ---------------------------------------------------------------------------
  /** config: { min, max } words */
  lengthBetween: (output, { config }) => {
    const w = words(output);
    return w >= (config.min ?? 1) && w <= config.max ? ok(`${w} words`) : fail(`${w} words, wanted ${config.min ?? 1}-${config.max}`);
  },
  noBadPhrases: (output) => {
    const hits = BAD.filter(([re]) => re.test(output)).map(([, name]) => name);
    return hits.length ? fail(`flags: ${hits.join(", ")}`) : ok("clean");
  },
  noOfferQuestion: (output) => (/\bdo you want me to\b|\bwould you like me to\b|\bshall i\b/i.test(output) ? fail("ends on an offer-question") : ok("no offer-question")),
  emojiAtMost: (output, { config }) => {
    const n = (String(output).match(EMOJI) || []).length;
    return n <= (config?.max ?? 3) ? ok(`${n} emoji`) : fail(`${n} emoji`);
  },
  exclaimAtMost: (output, { config }) => {
    const n = (String(output).match(/!/g) || []).length;
    return n <= (config?.max ?? 1) ? ok(`${n} exclamation marks`) : fail(`${n} exclamation marks`);
  },
  noFullDestinationString: (output, { providerResponse }) => {
    const full = providerResponse?.metadata?.trip?.destination;
    return full && full.includes(",") && new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(output) ? fail(`says "${full}" in full`) : ok("city only");
  },

  // ---- hard: correctness and safety -------------------------------------------------------------------------------------
  /** An apology aimed at a complaint or a person in trouble (the rule: name the problem and fix it). */
  noApology: (output) => (APOLOGY.test(output) ? fail("contains an apology") : ok("no apology")),
  /** The first sentence is something to do, not a question (urgent replies). */
  firstSentenceNotQuestion: (output) => {
    const first = firstSentence(output);
    return first.endsWith("?") ? fail(`opens with a question: ${first.slice(0, 80)}`) : ok("opens with an action");
  },
  /** A reply made only of questions (40 words or fewer), when the traveller asked something it could have answered. */
  answersNotJustAsks: (output) => {
    const sentences = String(output).trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    const onlyQuestions = sentences.length > 0 && sentences.every((x) => x.trim().endsWith("?"));
    return onlyQuestions && words(output) <= 40 ? fail(`only asks (${words(output)} words)`) : ok(`${words(output)} words`);
  },
  /** The reply never shows the system prompt or the router's internals. */
  noPromptLeak: (output) => {
    const hit = String(output).match(LEAK);
    return hit ? fail(`leaks "${hit[0]}"`) : ok("no leak");
  },
  /** config: { lang } the reply is in that language (stop-word ratio beats English); "hi-Latn" must not be Devanagari. */
  replyLanguage: (output, { config }) => {
    if (config.lang === "hi-Latn") return /[ऀ-ॿ]/.test(output) ? fail("answered in Devanagari") : ok("Roman letters");
    const target = STOP[config.lang]; if (!target) return fail(`no detector for ${config.lang}`);
    const t = ratio(output, target); const e = ratio(output, STOP.en);
    return t > e && t >= 0.08 ? ok(`${config.lang} ${t.toFixed(2)} vs en ${e.toFixed(2)}`) : fail(`not ${config.lang}: ${t.toFixed(2)} vs en ${e.toFixed(2)}`);
  },
  /**
   * Every venue the reply recommends in a list line ("- **Name** · ★ 4.5 · ...") appears in a card, a source title, the question or the
   * destination. Inline bold (an area like **Baixa**, a street, a dish) is not a recommendation and is not checked. Spelling variants
   * match ("Cervejaria" for a source's "Cervejeria"), as do accents and capitals ("Taquería" for a card's "TAQUERIA").
   */
  boldNamesGrounded: (output, { providerResponse }) => {
    const md = providerResponse?.metadata || {};
    const known = norm([...(md.blocks || []).flatMap((b) => b.names), ...(md.sourceTitles || []), md.message || "", md.trip?.destination || ""].join(" | "));
    const stems = new Set(known.split(" ").filter((t) => t.length >= 3).map(stem));
    const grounded = (name) => {
      const n = norm(name); if (known.includes(n)) return true;
      const tokens = n.split(" ").filter((t) => t.length >= 3); if (!tokens.length) return true;
      return tokens.filter((t) => stems.has(stem(t))).length / tokens.length >= 0.6;
    };
    const listed = [...String(output).matchAll(/^\s*(?:[-*\u2022]|\d+\.)\s+\*\*([^*\n]{2,70})\*\*/gm)].map((m) => m[1].trim());
    const unknown = listed.filter((b) => !grounded(b));
    return unknown.length ? fail(`listed venue not in cards, sources or question: ${unknown.slice(0, 4).join("; ")}`) : ok(`${listed.length} listed names grounded`);
  },
  /** The server's own grounding evaluator flagged a claim in this reply (meta.unverified). */
  notUnverified: (output, { providerResponse }) => (providerResponse?.metadata?.unverified ? fail("grounding evaluator flagged an unsupported claim") : ok("no flag")),
};
module.exports.words = words;
