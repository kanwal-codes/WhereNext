/**
 * Some providers occasionally narrate a follow-up tool call as raw JSON in the visible
 * completion instead of issuing a proper structured call — seen with gpt-oss-class models on a
 * second/third COMPOSE tool call, most often once the step budget (`stopWhen`) is nearly spent.
 * The AI SDK's own tool-calling protocol never puts this in `.text` when it works correctly, so
 * this is pure leakage — brace-matched (not a flat regex) so a nested `"arguments": {...}` object
 * doesn't truncate the match early, and gated on seeing BOTH a `"tool"`/`"function"` key and a
 * `"call"`/`"arguments"` key so ordinary JSON a user pasted into chat is never touched.
 */
function stripLeakedToolCalls(text: string): string {
  const signature = /\{\s*"(?:tool|function)"\s*:/;
  let out = text;
  for (let guard = 0; guard < 5; guard++) {
    const match = signature.exec(out);
    if (!match) break;
    const start = match.index;
    let depth = 0;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end === -1) {
      out = out.slice(0, start); // unterminated — a truncated stream; drop the dangling fragment
      break;
    }
    const blob = out.slice(start, end);
    if (!/"(call|arguments)"\s*:/.test(blob)) break; // JSON-shaped, but not this leak — leave it
    out = out.slice(0, start) + out.slice(end);
  }
  return out.trim();
}

/**
 * Remove reasoning-model scratchpad that some providers (gpt-oss on Cerebras,
 * DeepSeek/Qwen "think" blocks) leak into the assistant's visible content.
 * Only strips clearly-delimited reasoning — never touches ordinary prose.
 */
export function stripReasoning(text: string): string {
  let out = stripLeakedToolCalls(text);

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
