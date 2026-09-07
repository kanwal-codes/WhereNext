/**
 * Remove reasoning-model scratchpad that some providers (gpt-oss on Cerebras,
 * DeepSeek/Qwen "think" blocks) leak into the assistant's visible content.
 * Only strips clearly-delimited reasoning — never touches ordinary prose.
 */
export function stripReasoning(text: string): string {
  let out = text;

  // OpenAI "harmony" channels: keep only the final channel's message.
  const finalMarker = /<\|channel\|>\s*final\s*<\|message\|>/gi;
  let m: RegExpExecArray | null;
  let lastFinal = -1;
  while ((m = finalMarker.exec(out)) !== null) lastFinal = m.index + m[0].length;
  if (lastFinal !== -1) out = out.slice(lastFinal);

  // Any leftover harmony / control tokens.
  out = out.replace(/<\|[^|]*\|>/g, "");

  // <think>…</think> / <reasoning>…</reasoning> blocks. Loop so nested blocks are peeled
  // layer by layer (the non-greedy match only removes the innermost pair per pass).
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<(think|reasoning|analysis)>[\s\S]*?<\/\1>/gi, "");
  } while (out !== prev);
  // A reply that OPENS with an unclosed reasoning block is a truncated stream (token cap,
  // dropped connection) — everything after the tag is unfinished scratchpad, drop it. Anchored
  // to the start so ordinary prose that happens to contain "<think>" mid-sentence is untouched.
  out = out.replace(/^\s*<(think|reasoning|analysis)>[\s\S]*$/i, "");
  // A close tag with no matching open (malformed or nested reasoning) — treat everything up
  // to and including it as reasoning residue.
  out = out.replace(/^[\s\S]*?<\/(think|reasoning|analysis)>/i, "");

  return out.trim();
}

/**
 * Streaming guard for the COMPOSE token stream. `stripReasoning` needs the whole text
 * (it slices *after* the final-channel marker); mid-stream it would leak the analysis prose.
 * So this holds every delta back until a reasoning block has closed, then emits only the
 * clean text as it grows. Provider-agnostic: a model that doesn't do reasoning (OpenAI,
 * Gemini) is detected on the first non-`<` character and streams through untouched.
 *
 *   const gate = createReasoningGate();
 *   for await (const delta of textStream) { const clean = gate(delta); if (clean) send(clean); }
 */
export function createReasoningGate(): (delta: string) => string {
  let raw = "";
  let emitted = 0;
  let mode: "unknown" | "plain" | "harmony" | "tag" = "unknown";
  let open = true;

  return (delta: string): string => {
    raw += delta;

    if (mode === "unknown") {
      const head = raw.replace(/^\s+/, "");
      if (head === "" || head === "<" || head === "<|") return ""; // not enough to classify yet
      if (head.startsWith("<|")) mode = "harmony";
      else if (/^<(think|reasoning|analysis)\b/i.test(head)) mode = "tag";
      // A reasoning open tag can arrive split across deltas ("<th", "ink>"). While `head` is
      // still a viable prefix of one, keep waiting rather than locking into "plain" and
      // streaming the scratchpad out.
      else if (/^<[a-z]*$/i.test(head) && ["<think", "<reasoning", "<analysis"].some((t) => t.startsWith(head.toLowerCase()))) return "";
      else { mode = "plain"; open = false; }
    }

    if (mode === "plain") {
      const out = raw.slice(emitted);
      emitted = raw.length;
      return out;
    }

    if (open) {
      if (mode === "harmony" && /<\|channel\|>\s*final\s*<\|message\|>/i.test(raw)) open = false;
      else if (mode === "tag" && /<\/(think|reasoning|analysis)>/i.test(raw)) open = false;
      else return ""; // still inside the reasoning block
    }

    const clean = stripReasoning(raw);
    if (clean.length <= emitted) return "";
    const out = clean.slice(emitted);
    emitted = clean.length;
    return out;
  };
}

// Runnable check: bun run lib/ai/strip-reasoning.ts
if (import.meta.main) {
  const assert = (c: boolean, msg: string) => { if (!c) throw new Error(msg); };
  assert(stripReasoning("plain answer") === "plain answer", "plain passthrough");
  assert(
    stripReasoning("<|channel|>analysis<|message|>The user wants X. We should ask first.<|end|><|start|>assistant<|channel|>final<|message|>Which hotel would you like?<|return|>") === "Which hotel would you like?",
    "harmony final only",
  );
  assert(stripReasoning("<think>hmm let me think</think>\n\nThe answer is 42.") === "The answer is 42.", "think block");
  assert(stripReasoning("no close <think> tag here stays") === "no close <think> tag here stays", "mid-prose unclosed think untouched");
  assert(stripReasoning("<think>truncated mid thought, stream cut") === "", "leading unclosed think dropped");
  assert(stripReasoning("<think>outer <think>inner</think> tail</think>Answer.") === "Answer.", "nested think blocks peeled");

  // Gate: harmony reasoning is held until the final channel, then streams clean.
  const g1 = createReasoningGate();
  let acc = "";
  for (const d of ["<|channel|>analysis<|message|>The ", "user wants clubs. ", "<|end|><|start|>assistant<|channel|>final<|message|>Try ", "Bar Rouge.", "<|return|>"]) acc += g1(d);
  assert(acc === "Try Bar Rouge.", `gate harmony -> "${acc}"`);

  // Gate: a plain model streams straight through.
  const g2 = createReasoningGate();
  assert(g2("Here ") === "Here ", "gate plain 1");
  assert(g2("we go.") === "we go.", "gate plain 2");

  // Gate: <think> block held then released.
  const g3 = createReasoningGate();
  let acc3 = "";
  for (const d of ["<think>hmm ", "let me see</think>", "The answer is 42."]) acc3 += g3(d);
  assert(acc3 === "The answer is 42.", `gate think -> "${acc3}"`);

  // Gate: opening tag split one char at a time must still be caught as reasoning.
  const g4 = createReasoningGate();
  let acc4 = "";
  for (const d of ["<", "th", "in", "k", ">", "secret", "</think>", "Answer."]) acc4 += g4(d);
  assert(acc4 === "Answer.", `gate split-tag -> "${acc4}"`);

  // Gate: a plain reply that opens "<3" is not mistaken for a reasoning tag.
  const g5 = createReasoningGate();
  assert(g5("<3 Lisbon") === "<3 Lisbon", "gate <3 stays plain");

  console.log("ok");
}
