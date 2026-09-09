import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText, stepCountIs } from "ai";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { fail } from "@/lib/server/with-route";
import { loadTripContext, formatTripMemory } from "@/lib/application/trip-context";
import { runAssistantTurn, finalizeAssistantBlocks } from "@/lib/application/assistant-turn";
import { composeModelChain } from "@/packages/ai/compose-model";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import { compactAiMessages } from "@/packages/contracts/ai-request";
import { stripReasoning } from "@/lib/ai/strip-reasoning";
import { sanitizeAssistantContent } from "@/lib/application/sanitize-assistant";
import { withTripAiTask } from "@/lib/server/trip-ai-queue";
import { recordAiTurn } from "@/lib/server/ai-turn-trace";
import { costUsd, estimateTokens } from "@/lib/ai/pricing";
import { logger } from "@/lib/server/logger";
import { createGroupChatRepository } from "@/features/group-chat/infrastructure/groupChatRepository";
import { mentionsRoam } from "@/features/group-chat/domain/message";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const HISTORY_LIMIT = 50;

const bodySchema = z.object({
  messageId: z.string().min(1),
  // Set by the "Ask Roam about this" message action (long-press / inline expand, same surface
  // as reactions) — lets any member point Roam at any user message, not just one that literally
  // contains the text "@Roam". The typed-mention path (explicit omitted/false) stays stricter:
  // only the sender's own message, and only if it actually mentions Roam.
  explicit: z.boolean().optional(),
});

/** userId -> a display name, best-effort (name/full_name metadata, else the email's local part). */
async function memberNames(tripId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const admin = createSupabaseAdminClient();
    const rows = await admin.from("trip_members").select("user_id").eq("trip_id", tripId);
    await Promise.all(
      ((rows.data ?? []) as Array<{ user_id: string }>).map(async ({ user_id }) => {
        const who = await admin.auth.admin.getUserById(user_id).then((r) => r.data.user, () => null);
        const meta = (who?.user_metadata ?? {}) as { name?: string; full_name?: string };
        map.set(user_id, meta.name || meta.full_name || who?.email?.split("@")[0] || "Someone");
      }),
    );
  } catch {
    // Admin client unavailable — replies just fall back to "Someone" below.
  }
  return map;
}

/**
 * Roam's reply in the shared group chat — strictly reactive: this route is the ONLY writer
 * of role='assistant' group_messages rows, and it only ever speaks on an explicit trigger bound
 * to one specific message id (never "whatever's newest in the thread" — with several members
 * texting at once, that changes out from under a handler between the client's send and this
 * call, either dropping a mention or answering the wrong one). Two ways to trigger it, both
 * re-validated server-side against the actual message:
 *   - typed `@Roam` mention: must be the caller's own message, and it must actually contain
 *     the mention text.
 *   - `explicit: true` (the "Ask Roam about this" message action, alongside reactions): works
 *     on any user message in the trip, not just your own or one that says "@Roam" — matches how
 *     Slack/Discord message actions work, bound to the exact message regardless of who sent it.
 * Either way the reply's metadata carries `replyToMessageId` so the client can thread it back
 * to what it's answering, rather than just appending it wherever it lands in the flat list.
 *
 * Runs the SAME RESOLVE→RETRIEVE→tool-calling→COMPOSE→STRUCTURE pipeline as the personal
 * Conversation tab (via `runAssistantTurn`), so a group-chat @Roam reply gets the same place/
 * stay/itinerary cards and can open the same side panel. Buffered (`generateText`, not
 * `streamText`) — same reasoning as compare-chat/route.ts: no clean way to fail over to another
 * provider mid-stream once partial content has reached the client, and `generateText` supports
 * the identical tools/stopWhen/providerOptions shape, so nothing about tool-calling requires
 * streaming specifically.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const { supabase, user } = await requireTripMember(tripId);
    const repo = createGroupChatRepository(supabase);
    // Roam's own rows are written through the service-role client — regular members' sessions
    // are RLS-restricted to role='user' inserts (see migration 0027), so a request-scoped client
    // can't write an assistant row even if this handler tried to.
    const writeRepo = createGroupChatRepository(createSupabaseAdminClient());

    const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) return NextResponse.json({ error: "Missing message id" }, { status: 400 });

    const [tripCtx, history, names] = await Promise.all([
      loadTripContext(supabase, tripId),
      repo.list(tripId, user.id, { limit: HISTORY_LIMIT }),
      memberNames(tripId),
    ]);

    const target = history.find((m) => m.id === parsedBody.data.messageId);
    const eligible = Boolean(
      target?.role === "user" &&
        (parsedBody.data.explicit ? true : target.userId === user.id && mentionsRoam(target.content)),
    );
    if (!target || !eligible) {
      return NextResponse.json({ error: "Nothing to reply to" }, { status: 409 });
    }
    // Retry-safe per (message, asker): a client retry (or the "Retry" toast action) resubmits
    // the same message id and upserts onto the same reply row instead of composing a second one
    // — but keyed per-asker too, so two different members explicitly asking about the same
    // message each get their own reply rather than overwriting each other's.
    const idempotencyKey = `roam-reply:${target.id}:${user.id}`;

    // Chat-completion messages have no per-speaker field, so a human turn folds the sender's
    // name into its content ("Alex: ...") — Roam's own prior replies stay plain "assistant" turns.
    // `prompt` (fed to RESOLVE) stays the raw, unprefixed text of the message that mentioned Roam.
    const turns = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) =>
        m.role === "user"
          ? { role: "user" as const, content: `${names.get(m.userId ?? "") ?? "Someone"}: ${m.content}` }
          : { role: "assistant" as const, content: m.content },
      );

    const t0 = performance.now();
    const result = await runAssistantTurn(
      { supabase, tripId },
      { tripCtx, prompt: target.content, history: turns, tripSummary: formatTripMemory(tripCtx), signal: request.signal },
    );

    if (result.kind === "declined" || result.kind === "clarify" || result.kind === "ungrounded") {
      const message = await writeRepo.append(tripId, {
        userId: null,
        role: "assistant",
        kind: "text",
        content: result.content,
        metadata: { ...result.meta, replyToMessageId: target.id },
        idempotencyKey,
      });
      return NextResponse.json({ message }, { status: 201 });
    }

    // --- COMPOSE (buffered, bounded tool-calling loop) ------------------------
    const { system, composeSkipLine, composeTools, toolEvidence, allowedUrls, toolPlan, evidenceUnavailableProviders, cardPlaceProviderIds, sideBuilders, resolved } = result;
    const tCompose = performance.now();
    let composedModel: string | undefined;
    let rawText: string;
    if (composeSkipLine) {
      rawText = composeSkipLine;
    } else {
      const messages = compactAiMessages(turns, 12, 12_000);
      rawText = await withTripAiTask(tripId, async () => {
        let lastError: unknown;
        for (const entry of composeModelChain()) {
          try {
            const generated = await generateText({
              model: entry.model,
              system,
              messages,
              tools: composeTools,
              stopWhen: stepCountIs(4),
              abortSignal: withDeadline(request.signal, AI_DEADLINE_MS.composeTtft),
              providerOptions: entry.providerOptions,
            });
            composedModel = entry.modelId;
            return generated.text;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            lastError = error;
            logger.warn({ err: error }, "group-chat compose model failed, trying next in chain");
          }
        }
        throw lastError ?? new Error("compose produced no model");
      });
    }
    const text = stripReasoning(rawText);

    const [checklist, comparison] = await Promise.all([sideBuilders.checklistPromise, sideBuilders.comparisonPromise]);
    const meta = finalizeAssistantBlocks(result.meta, { checklist, comparison }, cardPlaceProviderIds);
    const sanitized = sanitizeAssistantContent(text, allowedUrls);

    const message = await writeRepo.append(tripId, {
      userId: null,
      role: "assistant",
      kind: "text",
      content: sanitized,
      metadata: { ...meta, replyToMessageId: target.id },
      idempotencyKey,
    });

    const composeMs = Math.round(performance.now() - tCompose);
    const totalMs = Math.round(performance.now() - t0);
    const tokensIn = estimateTokens(system);
    const tokensOut = estimateTokens(sanitized);
    const cost = Number(costUsd(process.env.AI_MODEL, tokensIn, tokensOut).toFixed(5));
    const toolsUsed = [...new Set([...toolPlan.map((call) => call.tool), ...toolEvidence.usedTools])];
    const providersFailed = [...new Set([...evidenceUnavailableProviders, ...toolEvidence.unavailableProviders])];
    await recordAiTurn(supabase, tripId, {
      intent: resolved.intent,
      tools: toolsUsed,
      providers_failed: providersFailed,
      blocks: meta.blocks.map((block) => block.type),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: cost,
      resolve_ms: result.timings.resolveMs,
      retrieve_ms: result.timings.retrieveMs,
      compose_ms: composeMs,
      total_ms: totalMs,
      model_resolve: resolved.modelUsed ?? (process.env.RESOLVE_MODEL || process.env.AI_MODEL || undefined),
      model_compose: composedModel,
      degraded: Boolean(resolved.degraded),
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return tripAuthResponse(error) ?? fail(error, "Roam is unavailable right now");
  }
}
