import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHONE_V2 } from "@/lib/phone-v2";

/** The two controls at the end of every message box (Roam and the group chat), so they can never drift apart:
 *  40px circles sitting 6px from the pill's edge, the mic a quiet ghost, the send a filled ink circle. */

/** Phone redesign: one circle at the end of the box, not two. The mic while the box is empty, the send once there is text
 *  (the mic stays while it is listening, so dictation can always be stopped). Below `lg` only, and only with the flag on. */
export function MicButton({ listening, disabled, onToggle, hasText }: { listening: boolean; disabled?: boolean; onToggle: () => void; hasText?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={listening ? "Stop dictation" : "Dictate your message"}
      aria-pressed={listening}
      disabled={disabled}
      className={cn(
        "pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-200 ease-out max-lg:size-11 active:scale-90 disabled:opacity-40",
        listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground",
        PHONE_V2 && hasText && !listening && "max-lg:hidden",
        PHONE_V2 && !listening && "max-lg:bg-border/70 max-lg:text-ink-soft",
      )}
    >
      <Mic className={cn("size-[18px]", listening && "animate-pulse")} />
    </button>
  );
}

/** One button, two jobs. While the assistant is replying it becomes Stop: the same ink circle with a small
 *  square (the glyph everyone reads as "stop generating"), the arrow and square crossfading in place so
 *  nothing around it shifts. */
export function SendButton({ canSend, stopping, onStop, stopLabel = "Stop replying", micShown }: { canSend: boolean; stopping?: boolean; onStop?: () => void; stopLabel?: string; /** The mic is on screen beside this button: on a phone it then stands in for the send until there is text. */ micShown?: boolean }) {
  const filled = stopping || canSend;
  return (
    <button
      type={stopping ? "button" : "submit"}
      onClick={stopping ? onStop : undefined}
      aria-label={stopping ? stopLabel : "Send"}
      title={stopping ? stopLabel : undefined}
      disabled={!stopping && !canSend}
      className={cn(
        "group/send pointer-events-auto relative grid size-10 max-lg:size-11 shrink-0 place-items-center rounded-full transition-[background-color,color,transform,box-shadow] duration-200 ease-out active:scale-90",
        filled ? "bg-primary text-primary-foreground shadow-soft enabled:hover:bg-primary/85" : "bg-muted text-muted-foreground/60",
        PHONE_V2 && filled && !stopping && "max-lg:bg-coral-fill max-lg:text-white max-lg:enabled:hover:bg-coral-fill/90",
        PHONE_V2 && !filled && micShown && "max-lg:hidden",
      )}
    >
      <ArrowUp
        className={cn(
          "absolute size-[18px] transition-[opacity,transform] duration-200 ease-out",
          stopping ? "scale-50 opacity-0" : "opacity-100 group-enabled/send:group-hover/send:-translate-y-0.5",
        )}
      />
      <Square className={cn("absolute size-3.5 fill-current transition-[opacity,transform] duration-200 ease-out", stopping ? "opacity-100" : "scale-50 opacity-0")} />
    </button>
  );
}
