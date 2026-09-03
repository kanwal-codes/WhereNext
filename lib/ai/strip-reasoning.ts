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

  // <think>…</think> / <reasoning>…</reasoning> blocks (only when properly closed).
  out = out.replace(/<(think|reasoning|analysis)>[\s\S]*?<\/\1>/gi, "");

  return out.trim();
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
  assert(stripReasoning("no close <think> tag here stays") === "no close <think> tag here stays", "unclosed think untouched");
  console.log("ok");
}
