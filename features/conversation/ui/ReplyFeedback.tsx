"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";
import { sendReplyFeedback } from "../application/sendReplyFeedback";
import { REPLY_NOTE_MAX, type ReplyRating } from "../domain/replyFeedback";
import { controlGhost } from "./blocks/ui";

const thumb = cn(controlGhost, "max-lg:size-9 aria-pressed:bg-muted aria-pressed:text-foreground");

/**
 * Thumbs under one of Roam's replies. Tapping the lit thumb again clears it. A thumbs-down offers a one-line note
 * (optional: the rating is already saved). The rating lives on the message, so `onRate` is the only state it owns outside.
 */
export function ReplyFeedback({ tripId, messageId, rating, onRate, quiet, children }: {
  tripId: string;
  messageId: string;
  rating: ReplyRating | null;
  onRate: (messageId: string, rating: ReplyRating | null) => void;
  /** Rest out of sight until the reply is under a mouse or has keyboard focus (touch always shows it). */
  quiet?: boolean;
  /** Sits right after the thumbs in the same row (the reply's Copy button). */
  children?: ReactNode;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [thanks, setThanks] = useState(false);
  const [saving, setSaving] = useState(false);
  const latest = useRef(0);

  function choose(next: ReplyRating) {
    const target = rating === next ? null : next;
    const previous = rating;
    const turn = ++latest.current;
    setThanks(false);
    setNoteOpen(target === "down");
    if (target !== "down") setNote("");
    onRate(messageId, target);
    sendReplyFeedback(tripId, messageId, target).catch(() => {
      if (turn !== latest.current) return; // a later tap has already replaced this one
      onRate(messageId, previous);
      setNoteOpen(false);
      notifyToast("Couldn’t save your feedback. Try again.", "error");
    });
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await sendReplyFeedback(tripId, messageId, "down", text);
      setNoteOpen(false);
      setThanks(true);
    } catch {
      notifyToast("Couldn’t save your note. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  // Two children of the reply's wrapping footer row: the thumbs (with Copy), and below them, full width, the note field.
  return (
    <>
      <div className="ml-auto flex items-center justify-end gap-0.5">
        <div role="group" aria-label="Rate this reply" className="flex items-center gap-0.5">
          {thanks && (
            <span role="status" className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3.5 text-positive" aria-hidden /> Thanks
            </span>
          )}
          <span className={cn("flex items-center gap-0.5", quiet && "turn-action")}>
            <button type="button" aria-label="Helpful reply" title="Helpful reply" aria-pressed={rating === "up"} onClick={() => choose("up")} className={thumb}>
              <ThumbsUp className="size-4" aria-hidden />
            </button>
            <button type="button" aria-label="Not helpful" title="Not helpful" aria-pressed={rating === "down"} onClick={() => choose("down")} className={thumb}>
              <ThumbsDown className="size-4" aria-hidden />
            </button>
          </span>
        </div>
        {children}
      </div>
      {noteOpen && (
        <form onSubmit={saveNote} className="flex basis-full items-center justify-end gap-2">
          <input
            // Opens on a tap on the thumb: the person who tapped it expects to be able to type at once.
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setNoteOpen(false); }}
            maxLength={REPLY_NOTE_MAX}
            aria-label="What was wrong with this reply? (optional)"
            placeholder="What was off? (optional)"
            className="input-field mt-0 h-9 min-w-0 flex-1 py-0 text-xs max-lg:h-11 max-lg:text-sm lg:max-w-sm"
          />
          <button type="submit" aria-label="Send note" disabled={!note.trim() || saving} className="btn-chip h-9 px-3 text-xs max-lg:h-11 max-lg:px-4 max-lg:text-sm">Send</button>
        </form>
      )}
    </>
  );
}
