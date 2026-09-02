"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, Copy, Mic } from "lucide-react";
import type { AssistantTurnMeta, PlaceCard, ProposedCommand } from "@/packages/contracts/assistant";
import type { Message } from "../domain/message";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantRequestError } from "../application/streamAssistantResponse";
import { sendConversationMessage } from "../application/sendConversationMessage";
import { cn } from "@/lib/utils";

const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd"]);

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
  rail = false,
}: {
  tripId: string;
  initialMessages?: Array<Record<string, unknown>>;
  onSurfaceSelect?: (surface: string) => void;
  onOpenPlace?: (place: PlaceCard) => void;
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
  const [notice, setNotice] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    return () => {
      controller.abort();
      requestRef.current?.abort();
    };
  }, [tripId]);

  useEffect(() => {
    const log = logRef.current;
    if (log && log.scrollHeight - log.scrollTop - log.clientHeight > 160) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
      setNotice(typeof body.changeImpact === "string" ? body.changeImpact : "");
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

  async function savePlace(cardPlace: PlaceCard) {
    const { photoUrl: _photoUrl, trust: _trust, ...place } = cardPlace;
    const response = await fetch(`/api/trips/${tripId}/places`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(place),
    });
    if (response.ok) {
      announceWorkspaceChange("places");
      setError("");
    } else setError(`${cardPlace.name} could not be saved.`);
  }

  async function addItineraryFromCard(cardPlace: PlaceCard) {
    const response = await fetch("/api/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "add_itinerary_item", tripId, title: cardPlace.name, dayIndex: 1 }),
    });
    if (response.ok) {
      announceWorkspaceChange("itinerary");
      setError("");
    } else setError(`${cardPlace.name} could not be added.`);
  }

  async function submit(rawContent: string) {
    const content = rawContent.trim();
    if (!content || sending || !loaded) return;
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
      await sendConversationMessage({
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
        onAssistantDelta: (assistant) =>
          setMessages((current) => current.map((m) => (m.id === assistantId ? { ...m, content: assistant } : m))),
        signal: controller.signal,
      });
      const refreshed = await fetch(`/api/trips/${tripId}/conversation`);
      if (refreshed.ok) {
        const body = (await refreshed.json()) as { messages?: Message[] };
        setMessages(body.messages ?? []);
      }
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
    onFollowup: (prompt: string) => {
      void submit(prompt);
    },
    onSave: (cardPlace: PlaceCard) => {
      void savePlace(cardPlace);
    },
    onAddItinerary: (cardPlace: PlaceCard) => {
      void addItineraryFromCard(cardPlace);
    },
    onOpenPlace,
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={logRef} aria-live="polite" className="flex-1 overflow-y-auto scrollbar-slim">
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

          {sending && messages[messages.length - 1]?.content.trim() === "" && <Typing />}
          <div ref={endRef} />
        </div>
      </div>

      <div className={cn("sticky bottom-0 mt-2 border-t border-border bg-background/92 pt-3 backdrop-blur", rail ? "" : "")}>
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
              className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
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
            placeholder={!loaded ? "Loading…" : "Ask about your trip…"}
            disabled={sending || !loaded}
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <button
            type="button"
            aria-label="Speak instead"
            tabIndex={-1}
            className="mb-1 shrink-0 rounded-full p-2 text-muted-foreground/60"
          >
            <Mic className="h-4 w-4" />
          </button>
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

        {notice && <p role="status" className="mt-2 text-xs text-leaf">{notice}</p>}
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
