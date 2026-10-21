"use client";

import type { Ref } from "react";
import { Loader2 } from "lucide-react";
import { SendButton } from "@/components/ComposerButtons";
import { COMPARE_VERDICT_PROMPT, useCompareChat } from "@/components/useCompareChat";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";

type Chat = ReturnType<typeof useCompareChat>;

/** The ask box floats over the bottom of the panel (a soft fade behind it, no rule), like the main chat's message box. The panel's own
 *  content gets bottom padding as tall as it is, measured, so the last of it can always be scrolled clear. */
export function TripPanelComposer({ boxRef, chat, isCompare }: { boxRef: Ref<HTMLDivElement>; chat: Chat; isCompare: boolean }) {
  const { chat: messages, input, setInput, sending, ask, verdictMsg } = chat;
  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-surface from-60% to-transparent px-3 pt-8 pb-3">
    <div className="pointer-events-auto flex flex-col gap-2">
      {messages.filter((m) => m !== verdictMsg && !(m.role === "user" && m.content === COMPARE_VERDICT_PROMPT)).length > 0 && (
        <div className="max-h-[40dvh] shrink-0 space-y-3 overscroll-contain overflow-y-auto scrollbar-slim rounded-2xl border border-border bg-card px-4 py-3 shadow-lift">
          {messages.map((m, i) => {
            // The auto-verdict prompt is never something the traveller typed — show its answer, not the prompt.
            if (m.role === "user" && m.content === COMPARE_VERDICT_PROMPT) return null;
            if (verdictMsg && m === verdictMsg) return null;
            const loading = sending && i === messages.length - 1;
            if (m.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {m.content}
                  </p>
                </div>
              );
            }
            return (
              <div key={i} className="space-y-2">
                {m.content ? (
                  <AssistantMessage content={m.content} />
                ) : loading ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="shrink-0"
      >
        {/* The same pill as the main chat's message box, so asking about a card feels like asking Roam. */}
        <div className="flex items-center gap-1 rounded-full border border-input bg-card py-1.5 pl-4 pr-1.5 shadow-lift transition-[border-color,box-shadow] duration-200 focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_6%,transparent),var(--shadow-lift)]">
          <input
            aria-label="Ask about this item"
            name="panel-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isCompare ? "Ask about these — value, location, what to pick…" : "Ask about this — does it fit my trip?"}
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <SendButton canSend={!sending && Boolean(input.trim())} />
        </div>
      </form>
    </div>
    </div>
  );
}
