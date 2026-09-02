"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AssistantTurnMeta, PlaceCard, ProposedCommand } from "@/packages/contracts/assistant";
import type { Message } from "../domain/message";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantRequestError } from "../application/streamAssistantResponse";
import { sendConversationMessage } from "../application/sendConversationMessage";

export function ConversationSurface({ tripId, initialMessages, onSurfaceSelect }: { tripId: string; initialMessages?: Array<Record<string, unknown>>; onSurfaceSelect?: (surface: string) => void }) {
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
  useEffect(() => { const controller = new AbortController(); fetch(`/api/trips/${tripId}/conversation`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("load"); return response.json(); }).then((body) => { if (!controller.signal.aborted) { setMessages(body.messages ?? []); setLoaded(true); } }).catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setError("Conversation could not load."); setLoaded(true); }); return () => { controller.abort(); requestRef.current?.abort(); }; }, [tripId]);
  useEffect(() => { const log = logRef.current; if (log && log.scrollHeight - log.scrollTop - log.clientHeight > 160) return; endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function confirmProposal() {
    if (!proposal || confirming) return;
    setConfirming(true);
    try {
      const command = proposal.type === "record_decision" ? { ...proposal, idempotencyKey: proposal.idempotencyKey ?? crypto.randomUUID() } : proposal;
      const response = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      if (!response.ok) throw new Error("command");
      const body = await response.json().catch(() => ({}));
      setProposal(null); setError(""); setNotice(typeof body.changeImpact === "string" ? body.changeImpact : "");
      announceWorkspaceChange(command.type === "update_preferences" ? "preferences" : command.type === "record_decision" ? "decision" : command.type === "save_place" ? "places" : "itinerary");
    } catch { setError("That change could not be saved."); } finally { setConfirming(false); }
  }

  async function savePlace(card: PlaceCard) {
    const { photoUrl: _photoUrl, trust: _trust, ...place } = card;
    const response = await fetch(`/api/trips/${tripId}/places`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(place) });
    if (response.ok) { announceWorkspaceChange("places"); setError(""); } else setError(`${card.name} could not be saved.`);
  }

  async function addItineraryFromCard(card: PlaceCard) {
    const response = await fetch("/api/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "add_itinerary_item", tripId, title: card.name, dayIndex: 1 }) });
    if (response.ok) { announceWorkspaceChange("itinerary"); setError(""); } else setError(`${card.name} could not be added.`);
  }

  async function submit(rawContent: string) {
    const content = rawContent.trim();
    if (!content || sending || !loaded) return;
    setError(""); setSending(true); setInput(""); setRetryContent("");
    const previous = messages;
    const userMessage: Message = { id: `local-${Date.now()}`, role: "user", content, created_at: new Date().toISOString() };
    const next = [...previous, userMessage];
    setMessages(next);
    let userSaved = false;
    try {
      const controller = new AbortController(); requestRef.current = controller; let assistantId = "";
      await sendConversationMessage({
        tripId, content, onSurfaceSelect, onProposal: setProposal,
        onUserSaved: () => { userSaved = true; },
        onAssistantStart: (responseId) => { assistantId = responseId; setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() }]); },
        onAssistantDelta: (assistant) => setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: assistant } : message)),
        signal: controller.signal,
      });
      const refreshed = await fetch(`/api/trips/${tripId}/conversation`);
      if (refreshed.ok) {
        const body = await refreshed.json() as { messages?: Message[] };
        setMessages(body.messages ?? []);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessages(userSaved ? next : previous);
      const aiError = error instanceof AssistantRequestError;
      if (userSaved) setRetryContent(content);
      setError(userSaved
        ? (aiError && error.status === 429 ? "Your message was saved, but Muse is rate-limited. Try again shortly." : "Your message was saved, but Muse is unavailable. Try again shortly.")
        : "Message could not be saved. Nothing was added.");
    } finally { requestRef.current = null; setSending(false); }
  }

  function stop() {
    requestRef.current?.abort();
    setSending(false);
    setMessages((current) => current.filter((message) => !(message.role === "assistant" && !message.content.trim())));
  }

  const handlers = { onFollowup: (prompt: string) => { void submit(prompt); }, onSave: (card: PlaceCard) => { void savePlace(card); }, onAddItinerary: (card: PlaceCard) => { void addItineraryFromCard(card); } };
  const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd"]);
  const proposalText = proposal?.type === "update_preferences" && typeof proposal.preferences.budget === "number" ? `Set the daily budget assumption to $${proposal.preferences.budget}?` : proposal?.type === "update_preferences" ? "Save these preferences?" : proposal?.type === "record_decision" ? `Record this ${proposal.kind} decision?` : proposal?.type === "add_itinerary_item" ? `Add ${proposal.title} to the itinerary?` : "Apply this proposed trip change?";
  return <section className="card"><h2>Conversation</h2><div ref={logRef} className="chat-log" aria-live="polite">{loaded && messages.length === 0 && <p className="chat-empty">Tell Muse where you&rsquo;re thinking of going — or ask what&rsquo;s popular somewhere.</p>}{messages.map((message, index) => {
    const meta = message.metadata as AssistantTurnMeta | undefined;
    const dir = message.role === "assistant" && meta?.language && RTL.has(meta.language.slice(0, 2)) ? "rtl" : undefined;
    return <div key={message.id} className={`chat-msg chat-msg-${message.role}${message.role === "assistant" && sending && index === messages.length - 1 ? " is-streaming" : ""}`}>
      <span className="chat-msg-author">{message.role === "user" ? "You" : "Muse"}</span>
      {message.role === "user"
        ? <p className="chat-msg-body">{message.content}</p>
        : <div className="chat-msg-body" dir={dir}><AssistantMessage content={message.content} blocks={meta?.blocks} handlers={handlers} />{message.content.trim() && <button type="button" className="chat-copy" onClick={() => void navigator.clipboard?.writeText(message.content)}>Copy</button>}</div>}
    </div>;
  })}<div ref={endRef} /></div>{proposal && <div role="alert" className="chat-proposal"><p>{proposalText}</p><button type="button" onClick={() => void confirmProposal()} disabled={confirming}>{confirming ? "Saving…" : "Confirm change"}</button><button type="button" onClick={() => setProposal(null)} disabled={confirming}>Cancel</button></div>}<form onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(input); }}><input aria-label="Message" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tell Muse what you want from this trip…" disabled={sending || !loaded} /><button type="submit" disabled={sending || !loaded}>{!loaded ? "Loading…" : sending ? "Sending…" : "Send"}</button>{sending && <button type="button" className="chat-stop" onClick={stop}>Stop</button>}</form>{notice && <p role="status" className="chat-notice">{notice}</p>}{error && <p role="alert">{error} {retryContent && <button type="button" onClick={() => { setRetryContent(""); void submit(retryContent); }}>Retry</button>}</p>}</section>;
}
