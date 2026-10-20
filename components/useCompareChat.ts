import { useEffect, useState } from "react";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { chatItems } from "@/components/tripPanelLogic";
import type { CompareEntry, PanelState } from "@/components/TripPanelProvider";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** The question auto-asked the moment a fresh comparison opens — never shown as a "user" bubble
 *  since the traveller didn't type it; only Roam's answer to it is worth displaying. */
export const COMPARE_VERDICT_PROMPT = "Which of these should I pick, and why? One short paragraph.";
const FAILED = "Roam couldn’t answer just now. Try again in a moment.";

/** The panel's scratch chat: scoped to what the panel shows, with Roam's take auto-asked on a fresh comparison. */
export function useCompareChat({ panel, shown, compareList, tripId, subjectKey }: {
  panel: PanelState | null;
  shown: PanelState | null;
  compareList: CompareEntry[];
  tripId: string;
  subjectKey: string;
}) {
  const { guest, openGate } = useGuest();
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // A scratch chat, scoped to whatever the panel currently shows. Cleared when the subject changes.
  useEffect(() => {
    setChat([]);
  }, [subjectKey]);
  // A raw side-by-side table doesn't tell anyone which option to actually pick — kick off
  // Roam's take the moment a fresh comparison (2+ items) opens, so there's always a plain-
  // language verdict above the numbers, not just the numbers themselves. Aborted on cleanup
  // so Strict Mode's dev-only double-invoke (mount → cleanup → mount) cancels the first,
  // stale call instead of leaving two concurrent requests racing to write the same state.
  //
  // Depends on panel?.kind too, not just sk: compareList reaches its final 2+ items (and sk
  // its final value) while the user is still picking cards, before the panel ever opens —
  // clicking "Open" afterward flips panel.kind to "compare" without sk changing at all, so
  // sk alone misses that transition and a second comparison in the same session never asks.
  useEffect(() => {
    if (panel?.kind !== "compare" || compareList.length < 2) return;
    const controller = new AbortController();
    void ask(COMPARE_VERDICT_PROMPT, [], controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, panel?.kind]);

  async function ask(raw: string, historyOverride?: ChatMessage[], externalSignal?: AbortSignal) {
    if (!panel) return;
    // The side-chat is a second, uncounted door to the model; a guest's free messages are in the main chat.
    if (guest) return openGate("ask Roam to compare options");
    const q = raw.trim();
    if (!q || sending) return;
    setInput("");
    const history = historyOverride ?? chat.filter((m) => m.content.trim());
    setChat((c) => [...c, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setSending(true);
    // The upstream call has its own connect-time deadline, but nothing bounds how long an
    // already-open stream can go quiet mid-response — without this, a stall leaves the
    // spinner running forever with no way out.
    const timeout = AbortSignal.timeout(30_000);
    const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
    try {
      const res = await fetch(`/api/trips/${tripId}/compare-chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: chatItems(panel, compareList), messages: [...history, { role: "user", content: q }] }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error("compare-chat");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setChat((c) => c.map((m, i) => (i === c.length - 1 ? { role: "assistant", content: acc } : m)));
      }
      if (!acc.trim()) throw new Error("empty");
    } catch {
      // Superseded by a newer call (React Strict Mode's double-invoke, or the comparison set
      // changed again mid-flight) — that call owns the chat now; don't stomp its state.
      if (externalSignal?.aborted) return;
      setChat((c) => c.map((m, i) => (i === c.length - 1 ? { role: "assistant", content: FAILED } : m)));
    } finally {
      setSending(false);
    }
  }


  // The auto-asked comparison verdict belongs above the numbers, not buried in the chat below them.
  const verdictMsg = shown?.kind === "compare" && chat[0]?.content === COMPARE_VERDICT_PROMPT ? chat[1] : undefined;
  const verdictFailed = verdictMsg?.content === FAILED;
  const retryVerdict = () => { setChat([]); void ask(COMPARE_VERDICT_PROMPT, []); };

  return { chat, input, setInput, sending, ask, clear: () => setChat([]), verdictMsg, verdictFailed, retryVerdict };
}
