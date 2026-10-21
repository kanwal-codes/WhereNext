"use client";

import { useRef, useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import { useSpeechInput } from "@/lib/use-speech-input";

/** The prompt box on the home screen: typing or dictating a first message, and turning it into a blank trip whose chat opens with it. */
export function useStartTrip() {
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptBase = useRef("");
  const promptInputRef = useRef<HTMLInputElement>(null);
  // Stable for the life of this mount, so a retry after a dropped response re-uses the same
  // attempt instead of the server creating a second blank trip.
  const startIdempotencyKey = useRef(crypto.randomUUID());
  const canSend = !starting && prompt.trim().length > 0;
  const speech = useSpeechInput({
    onStart: () => { promptBase.current = prompt.trim() ? `${prompt.trim()} ` : ""; },
    onResult: (text) => setPrompt(promptBase.current + text),
    onError: (message) => notifyToast(message, "error"),
  });

  async function startTrip() {
    const text = prompt.trim();
    if (!text || starting) return;
    setStarting(true);
    setPromptError(null);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination: null, idempotencyKey: startIdempotencyKey.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.trip?.id) throw new Error();
      // `?ask=` is the same param a place's "ask the assistant" link uses — ConversationSurface
      // already pre-fills and focuses the composer with it, so the chat picks up exactly where
      // this left off instead of landing empty.
      window.location.assign(`/trips/${body.trip.id}/chat?ask=${encodeURIComponent(text)}`);
    } catch {
      setPromptError("We couldn’t start that trip. Try again in a moment.");
      setStarting(false);
    }
  }

  return { prompt, setPrompt, starting, promptError, promptInputRef, canSend, speech, startTrip };
}
