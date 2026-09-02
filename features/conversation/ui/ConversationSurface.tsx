"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, Copy, Mic } from "lucide-react";
import type { AssistantTurnMeta, PlaceCard, ProposedCommand, StayCardItem } from "@/packages/contracts/assistant";
import type { Message } from "../domain/message";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { useSpeechInput } from "@/lib/use-speech-input";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantRequestError } from "../application/streamAssistantResponse";
import { sendConversationMessage } from "../application/sendConversationMessage";
import { cn } from "@/lib/utils";

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd"]);

/** Human names for the providers RETRIEVE may report as unavailable. */
const PROVIDER_LABEL: Record<string, string> = {
  liteapi: "hotel rates",
  duffel: "flight fares",
  ticketmaster: "events",
  eventbrite: "events",
  "google-routes": "transit",
  "transit-app": "transit",
  mapbox: "directions",
  openweather: "weather",
  tavily: "web sources",
  "google-places": "places",
};
const unavailableLabels = (names?: string[]) => Array.from(new Set((names ?? []).map((name) => PROVIDER_LABEL[name] ?? name)));

function Typing() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
      <span className="ml-2 text-xs text-muted-foreground">Thinking through your trip…</span>
    </div>
  );
}

export function ConversationSurface({
  tripId,
  initialMessages,
  onSurfaceSelect,
  onOpenPlace,
  onOpenStay,
  onOpenCompare,
  rail = false,
}: {
  tripId: string;
  initialMessages?: Array<Record<string, unknown>>;
  onSurfaceSelect?: (surface: string) => void;
  onOpenPlace?: (place: PlaceCard) => void;
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string }) => void;
  onOpenCompare?: (placeIds: string[]) => void;
  rail?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>((initialMessages ?? []) as Message[]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [retryContent, setRetryContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(initialMessages));
  const [confirming, setConfirming] = useState(false);
  const [proposal, setProposal] = useState<ProposedCommand | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollFrame = useRef(0);
  const speechBaseRef = useRef("");

  // Dictation: transcript is appended after whatever was already typed when the mic started.
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = input.trim() ? `${input.trim()} ` : "";
    },
    onResult: (text) => setInput(speechBaseRef.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  useEffect(() => () => requestRef.current?.abort(), []);

  // A `?ask=` param (from a detail page's "ask the assistant" link) pre-fills the composer once.
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (!ask) return;
    setInput(ask);
    window.history.replaceState({}, "", window.location.pathname);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // The layout already loads the conversation; only fetch when it didn't (preview route).
  useEffect(() => {
    if (initialMessages) return;
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/conversation`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return response.json();
      })
      .then((body) => {
        if (!controller.signal.aborted) {
          setMessages(body.messages ?? []);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Conversation could not load.");
        setLoaded(true);
      });
    return () => controller.abort();
  }, [tripId, initialMessages]);

  const scrollIfNearBottom = useCallback(() => {
    const log = logRef.current;
    if (log && log.scrollHeight - log.scrollTop - log.clientHeight > 160) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);

  // First landing: open on the most recent message, past the "near bottom" guard.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [loaded]);

  useEffect(() => {
    scrollIfNearBottom();
  }, [messages.length, scrollIfNearBottom]);

  // One scroll per frame while tokens stream, not one per token.
  const scheduleScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      scrollIfNearBottom();
    });
  }, [scrollIfNearBottom]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function confirmProposal() {
    if (!proposal || confirming) return;
    setConfirming(true);
    try {
      const command =
        proposal.type === "record_decision"
          ? { ...proposal, idempotencyKey: proposal.idempotencyKey ?? crypto.randomUUID() }
          : proposal;
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) throw new Error("command");
      const body = await response.json().catch(() => ({}));
      setProposal(null);
      setError("");
      notifyToast(typeof body.changeImpact === "string" && body.changeImpact ? body.changeImpact : "Change saved.", "success");
      announceWorkspaceChange(
        command.type === "update_preferences"
          ? "preferences"
          : command.type === "record_decision"
            ? "decision"
            : command.type === "save_place"
              ? "places"
              : "itinerary",
      );
    } catch {
      setError("That change could not be saved.");
    } finally {
      setConfirming(false);
    }
  }

  async function submit(rawContent: string) {
    const content = rawContent.trim();
    if (!content || sending || !loaded) return;
    if (speech.listening) speech.stop();
    setError("");
    setSending(true);
    setInput("");
    setRetryContent("");
    const previous = messages;
    const userMessage: Message = { id: `local-${Date.now()}`, role: "user", content, created_at: new Date().toISOString() };
    const next = [...previous, userMessage];
    setMessages(next);
    let userSaved = false;
    try {
      const controller = new AbortController();
      requestRef.current = controller;
      let assistantId = "";
      const result = await sendConversationMessage({
        tripId,
        content,
        onSurfaceSelect,
        onProposal: setProposal,
        onUserSaved: () => {
          userSaved = true;
        },
        onAssistantStart: (responseId) => {
          assistantId = responseId;
          setMessages((current) => [
            ...current,
            { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
          ]);
        },
        onAssistantDelta: (assistant) => {
          setMessages((current) => current.map((m) => (m.id === assistantId ? { ...m, content: assistant } : m)));
          scheduleScroll();
        },
        signal: controller.signal,
      });
      // Settle the streamed bubble in place: sanitized text + the structured blocks from the
      // meta frame. No refetch, so ids stay stable and nothing re-mounts.
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId
            ? { ...m, content: result.content || m.content, metadata: result.meta ? (result.meta as unknown as Record<string, unknown>) : m.metadata }
            : m,
        ),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages(userSaved ? next : previous);
      const aiError = err instanceof AssistantRequestError;
      if (userSaved) setRetryContent(content);
      setError(
        userSaved
          ? aiError && err.status === 429
            ? "Your message was saved, but Muse is rate-limited. Try again shortly."
            : "Your message was saved, but Muse is unavailable. Try again shortly."
          : "Message could not be saved. Nothing was added.",
      );
    } finally {
      requestRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    requestRef.current?.abort();
    setSending(false);
    setMessages((current) => current.filter((m) => !(m.role === "assistant" && !m.content.trim())));
  }

  const handlers = {
    tripId,
    onFollowup: (prompt: string) => {
      void submit(prompt);
    },
    onOpenPlace,
    onOpenStay,
    onOpenCompare,
  };

  const proposalText =
    proposal?.type === "update_preferences" && typeof proposal.preferences.budget === "number"
      ? `Set the daily budget assumption to $${proposal.preferences.budget}?`
      : proposal?.type === "update_preferences"
        ? "Save these preferences?"
        : proposal?.type === "record_decision"
          ? `Record this ${proposal.kind} decision?`
          : proposal?.type === "add_itinerary_item"
            ? `Add ${proposal.title} to the itinerary?`
            : "Apply this proposed trip change?";

  const showHero = loaded && messages.length === 0 && !rail;
  const waiting = sending && messages[messages.length - 1]?.content.trim() === "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-slim">
        <div className={cn("mx-auto space-y-6", rail ? "px-1 py-2" : "max-w-2xl py-2")}>
          {showHero && (
            <div className="pb-2">
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                No forms. Tell me as much or as little as you like — I&rsquo;ll keep the trip details organised and open a
                proper view when something is easier to see than to describe.
              </p>
            </div>
          )}

          {messages.map((message, index) => {
            const meta = message.metadata as AssistantTurnMeta | undefined;
            const streaming = message.role === "assistant" && sending && index === messages.length - 1;
            const dir =
              message.role === "assistant" && meta?.language && RTL.has(meta.language.slice(0, 2)) ? "rtl" : undefined;

            if (message.role === "user") {
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="flex justify-end"
                >
                  <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {message.content}
                  </p>
                </motion.div>
              );
            }

            const unavailable = streaming ? [] : unavailableLabels(meta?.unavailableProviders);
            const sources = streaming ? [] : (meta?.sources ?? []);

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                dir={dir}
                className={cn("space-y-2", streaming && "chat-streaming")}
              >
                <AssistantMessage content={message.content} blocks={meta?.blocks} handlers={handlers} />
                {unavailable.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Could not check: {unavailable.join(", ")}.</p>
                )}
                {sources.length > 0 && (
                  <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer select-none">Sources ({sources.length})</summary>
                    <ul className="mt-1 space-y-0.5">
                      {sources.map((source) => (
                        <li key={source.url}>
                          <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:text-foreground hover:underline">
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {message.content.trim() && !streaming && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(message.content)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                )}
              </motion.div>
            );
          })}

          <div role="status" aria-live="polite">{waiting && <Typing />}</div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="sticky bottom-0 mt-2 border-t border-border bg-background/92 pt-3 backdrop-blur">
        {proposal && (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-coral-soft/40 px-3 py-2.5"
          >
            <p className="min-w-0 flex-1 text-xs">{proposalText}</p>
            <button
              type="button"
              onClick={() => void confirmProposal()}
              disabled={confirming}
              className="btn-primary-sm"
            >
              {confirming ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              disabled={confirming}
              className="rounded-full border border-border px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void submit(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/25"
        >
          <textarea
            ref={textareaRef}
            aria-label="Message"
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit(input);
              }
            }}
            placeholder={!loaded ? "Loading…" : speech.listening ? "Listening…" : sending ? "Type your next message…" : "Ask about your trip…"}
            disabled={!loaded}
            className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              aria-label={speech.listening ? "Stop dictation" : "Dictate your message"}
              aria-pressed={speech.listening}
              disabled={!loaded || sending}
              className={cn(
                "mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-35",
                speech.listening
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Mic className={cn("h-4 w-4", speech.listening && "animate-pulse")} />
            </button>
          )}
          {sending ? (
            <button
              type="button"
              onClick={stop}
              className="mb-0.5 shrink-0 rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!loaded || !input.trim()}
              className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </form>

        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}{" "}
            {retryContent && (
              <button
                type="button"
                onClick={() => {
                  setRetryContent("");
                  void submit(retryContent);
                }}
                className="underline"
              >
                Retry
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
