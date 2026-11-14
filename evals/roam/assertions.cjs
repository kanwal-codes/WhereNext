// Deterministic checks for Roam replies (promptfoo `javascript` assertions: value: file://assertions.cjs:<name>, config in `config`).
// Ported from the 2026-11-14 style battery scorer. Code checks first; add an LLM judge only for what code cannot check, and validate it
// against human labels before trusting it (see the validate-evaluator skill).
const words = (t) => (String(t).trim().match(/\S+/g) || []).length;
const ok = (reason) => ({ pass: true, score: 1, reason });
const fail = (reason) => ({ pass: false, score: 0, reason });

const BAD = [
  [/the sources?\b|according to the (evidence|results)|the (notes|results) (say|show|point)/i, "research-talk"],
  [/\bI (can'?t|cannot|couldn'?t) (help|do|find|compare)/i, "can't-phrase"],
  [/as an ai\b/i, "as-an-AI"], [/great question|certainly!|absolutely!/i, "filler"],
  [/^here (are|is) \d+/i, "template-open"], [/lisbon, portugal/i, "full-destination-string"],
  [/\bdo you want me to\b|\bwould you like me to\b|\bshall i\b/i, "offer-question"],
  [/\b(tap|click) (a |the |on )?(card|route option|map button)/i, "talks-about-cards"],
];
const EMOJI = /[\u{1F300}-\u{1FAFF}☀-➿⭐]/gu;

module.exports = {
  /** config: { min, max } words */
  lengthBetween: (output, { config }) => {
    const w = words(output);
    return w >= config.min && w <= config.max ? ok(`${w} words`) : fail(`${w} words, wanted ${config.min}-${config.max}`);
  },
  noBadPhrases: (output) => {
    const hits = BAD.filter(([re]) => re.test(output)).map(([, name]) => name);
    return hits.length ? fail(`flags: ${hits.join(", ")}`) : ok("clean");
  },
  emojiAtMost: (output, { config }) => {
    const n = (String(output).match(EMOJI) || []).length;
    return n <= (config?.max ?? 3) ? ok(`${n} emoji`) : fail(`${n} emoji`);
  },
  exclaimAtMost: (output, { config }) => {
    const n = (String(output).match(/!/g) || []).length;
    return n <= (config?.max ?? 1) ? ok(`${n} exclamation marks`) : fail(`${n} exclamation marks`);
  },
  noApology: (output) => (/\b(sorry|apolog)/i.test(output) ? fail("opens with or contains an apology") : ok("no apology")),
  /** The first sentence is something to do, not a question (urgent replies). */
  firstSentenceNotQuestion: (output) => {
    const first = String(output).trim().split(/(?<=[.!?])\s/)[0] || "";
    return first.trim().endsWith("?") ? fail(`opens with a question: ${first.slice(0, 80)}`) : ok("opens with an action");
  },
  /** Roman-letter message answered in Roman letters. */
  noDevanagari: (output) => (/[ऀ-ॿ]/.test(output) ? fail("answered in Devanagari") : ok("Roman letters")),
  /** config: { maxMs } on the first word reaching the client. */
  firstTextUnder: (output, { config, providerResponse }) => {
    const ms = providerResponse?.metadata?.firstTextMs;
    if (ms == null) return fail("no first-text time");
    return ms <= config.maxMs ? ok(`${ms} ms`) : fail(`${ms} ms, wanted <= ${config.maxMs}`);
  },
  /** config: { maxMs } whole turn */
  turnUnder: (output, { config, providerResponse }) => {
    const ms = providerResponse?.metadata?.totalMs;
    if (ms == null) return fail("no total time");
    return ms <= config.maxMs ? ok(`${ms} ms`) : fail(`${ms} ms, wanted <= ${config.maxMs}`);
  },
};
module.exports.words = words;
