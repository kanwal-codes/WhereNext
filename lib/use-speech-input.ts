"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal shape of the bits of the Web Speech API we touch. It ships as
// `SpeechRecognition` (Safari/spec) or `webkitSpeechRecognition` (Chrome/Edge).
type RecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Split a run of recognition results into the settled text and the still-changing tail. */
export function readResults(results: Array<{ transcript: string; isFinal: boolean }>): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (const r of results) {
    if (r.isFinal) final += (final ? " " : "") + r.transcript.trim();
    else interim += (interim ? " " : "") + r.transcript.trim();
  }
  return { final: final.trim(), interim: interim.trim() };
}

/**
 * Push-to-talk dictation via the browser's Speech Recognition. `onResult` fires
 * with the full transcript of the current session (settled + interim) every time
 * it changes; the caller decides where to put it. `supported` is false where the
 * API is missing (e.g. Firefox) — hide the mic in that case.
 */
export function useSpeechInput(opts: {
  onStart?: () => void;
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const { onStart, onResult, onError } = opts;
  // Must be false on the first client render so it matches the server (which has no
  // SpeechRecognition) — deciding it during useState's initializer instead produces a
  // hydration mismatch on the send/mic button. Resolve the real value after mount.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(recognitionCtor() != null), []);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const cb = useRef({ onStart, onResult, onError });
  cb.current = { onStart, onResult, onError };

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      const list = Array.from(event.results, (r) => ({ transcript: r[0].transcript, isFinal: r.isFinal }));
      const { final, interim } = readResults(list);
      cb.current.onResult([final, interim].filter(Boolean).join(" "));
    };
    rec.onerror = (event) => {
      cb.current.onError?.(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access is blocked. Allow it in your browser settings."
          : event.error === "no-speech"
            ? "Didn’t catch that — try again."
            : "Dictation stopped unexpectedly.",
      );
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      cb.current.onStart?.();
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
    }
  }, []);

  const toggle = useCallback(() => (recRef.current ? stop() : start()), [start, stop]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, toggle, start, stop };
}
