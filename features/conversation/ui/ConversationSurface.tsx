"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, ChevronRight, Copy, Mic } from "lucide-react";
import type { AssistantTurnMeta, PlaceCard, ProposedCommand, StayCardItem } from "@/packages/contracts/assistant";
import type { EventSeed } from "@/components/TripPanelProvider";
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
  openweather: "the weather",
  tavily: "the web",
  predicthq: "events",
  "google-places": "places",
};
const unavailableLabels = (names?: string[]) => Array.from(new Set((names ?? []).map((name) => PROVIDER_LABEL[name] ?? name)));

const humanKey = (key: string) => key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const humanValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(humanValue).join(", ") || "—";
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === "" || value == null) return "—";
  return String(value);
};

/** The exact fields a proposed change will write — shown behind an expander so the user can check before confirming. */
function describeProposal(proposal: ProposedCommand): Array<[string, string]> {
  switch (proposal.type) {
    case "update_preferences":
      return Object.entries(proposal.preferences).map(([key, value]) => [humanKey(key), humanValue(value)]);
    case "record_decision":
      return [["Type", proposal.kind.replaceAll("_", " ")], ...Object.entries(proposal.value).map(([key, value]) => [humanKey(key), humanValue(value)] as [string, string])];
    case "add_itinerary_item":
      return [["Title", proposal.title], ["Day", String(proposal.dayIndex)]];
    case "save_place":
      return [
        ["Name", proposal.place.name],
        ["Category", humanValue(proposal.place.category)],
        ["Address", humanValue(proposal.place.address)],
      ];
    default:
      return [];
  }
}

// The turn does real work before the first token (plan the turn, hit live providers, start the
// model). Advance the label on a timer so a 3–8s wait reads as progress, not a stall. Purely
// cosmetic — mounts fresh each turn, so the timers reset with it.
const THINKING_STATES = [
  "Thinking through your trip…",
  "Checking live sources…",
  "Pulling the details together…",
  "Almost there…",
  "Still working — this one's taking a bit…",
];

function Typing() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 2500),
      setTimeout(() => setPhase(2), 6000),
      setTimeout(() => setPhase(3), 11000),
      setTimeout(() => setPhase(4), 20000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);
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
      <span className="ml-2 text-xs text-muted-foreground">{THINKING_STATES[phase]}</span>
    </div>
  );
}

export function ConversationSurface({
  tripId,
  initialMessages,
  onSurfaceSelect,
  onOpenPlace,
  onOpenStay,
  onOpenEvent,
  viewContext,
  rail = false,
}: {
  tripId: string;
  initialMessages?: Array<Record<string, unknown>>;
  onSurfaceSelect?: (surface: string) => void;
  onOpenPlace?: (place: PlaceCard) => void;
  onOpenStay?: (stay: StayCardItem, dates: { checkin: string; checkout: string }) => void;
  onOpenEvent?: (seed: EventSeed) => void;
  /** Name of the place/stay the user has open beside the chat, for deictic references. */
  viewContext?: string;
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

  // First landing: jump straight to the latest message. The log has
  // `scroll-behavior: smooth` (nice while streaming), which Chromium also applies to
  // scrollTop assignment — so without this override the page visibly scrolls
  // top→bottom every time it mounts. Re-run once after layout in case card images
  // reflow the height.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const jump = () => {
      const prev = log.style.scrollBehavior;
      log.style.scrollBehavior = "auto";
      log.scrollTop = log.scrollHeight;
      log.style.scrollBehavior = prev;
    };
    jump();
    // Card images / blocks reflow the log taller just after mount — keep it pinned
    // to the bottom for a beat (no smoothing) so we don't land mid-conversation.
    const ids = [60, 200, 500].map((ms) => window.setTimeout(jump, ms));
    ids.push(requestAnimationFrame(jump));
    return () => ids.forEach((id) => { clearTimeout(id); cancelAnimationFrame(id); });
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
        viewContext,
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
            ? "Your message went through, but the assistant is busy right now. Try again in a moment."
            : "Your message went through, but the assistant couldn’t reply. Try again in a moment."
          : "Your message didn’t send. Nothing was added — try again.",
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
    onOpenEvent,
  };

  const proposalRows = proposal ? describeProposal(proposal) : [];
  const proposalText =
    proposal?.type === "update_preferences" && typeof proposal.preferences.budget === "number" && Object.keys(proposal.preferences).length === 1
      ? `Set the daily budget assumption to $${proposal.preferences.budget}?`
      : proposal?.type === "update_preferences"
        ? `Save ${proposalRows.length === 1 ? "this preference" : "these preferences"}: ${proposalRows.map(([k]) => k.toLowerCase()).join(", ")}?`
        : proposal?.type === "record_decision"
          ? `Record this ${proposal.kind.replaceAll("_", " ")} decision?`
          : proposal?.type === "add_itinerary_item"
            ? `Add “${proposal.title}” to day ${proposal.dayIndex}?`
            : proposal?.type === "save_place"
              ? `Save “${proposal.place.name}” to the trip?`
              : "Apply this proposed trip change?";

  const showHero = loaded && messages.length === 0 && !rail;
  const waiting = sending && messages[messages.length - 1]?.content.trim() === "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-slim">
        <div className={cn("mx-auto space-y-6", rail ? "px-1 py-2" : "max-w-2xl py-2")}>
          {!loaded && messages.length === 0 && (
            <div aria-hidden className="space-y-6">
              <div className="flex justify-end">
                <div className="h-9 w-40 animate-pulse rounded-2xl rounded-br-lg bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-11/12 animate-pulse rounded bg-muted" />
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-28 w-full animate-pulse rounded-2xl bg-muted" />
              </div>
              <div className="flex justify-end">
                <div className="h-9 w-52 animate-pulse rounded-2xl rounded-br-lg bg-muted" />
              </div>
            </div>
          )}

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
                {!streaming && meta?.degraded && (
                  <p className="text-[11px] text-muted-foreground">Answered from your trip details — the planner had trouble reading that one. Rephrasing may help.</p>
                )}
                {unavailable.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Couldn’t check {unavailable.join(", ")} just now — this is from your trip so far.</p>
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
          <div role="alert" className="mb-3 rounded-xl border border-primary/25 bg-coral-soft/40 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs">{proposalText}</p>
              <button type="button" onClick={() => void confirmProposal()} disabled={confirming} className="btn-primary-sm">
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
            {proposalRows.length > 0 && (
              <details className="group mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  See exactly what will be saved
                </summary>
                <dl className="mt-1.5 space-y-1 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed">
                  {proposalRows.map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="w-24 shrink-0 font-medium text-muted-foreground">{key}</dt>
                      <dd className="min-w-0 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
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
