import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/** The two controls at the end of every message box (Roam and the group chat), so they can never drift apart:
 *  40px circles sitting 6px from the pill's edge, the mic a quiet ghost, the send a filled ink circle. */

export function MicButton({ listening, disabled, onToggle }: { listening: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={listening ? "Stop dictation" : "Dictate your message"}
      aria-pressed={listening}
      disabled={disabled}
      className={cn(
        "pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-200 ease-out active:scale-90 disabled:opacity-40",
        listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground",
      )}
    >
      <Mic className={cn("size-[18px]", listening && "animate-pulse")} />
    </button>
  );
}

/** One button, two jobs. While the assistant is replying it becomes Stop: the same ink circle with a small
 *  square (the glyph everyone reads as "stop generating"), the arrow and square crossfading in place so
 *  nothing around it shifts. */
export function SendButton({ canSend, stopping, onStop, stopLabel = "Stop replying" }: { canSend: boolean; stopping?: boolean; onStop?: () => void; stopLabel?: string }) {
  const filled = stopping || canSend;
  return (
    <button
      type={stopping ? "button" : "submit"}
      onClick={stopping ? onStop : undefined}
      aria-label={stopping ? stopLabel : "Send"}
      title={stopping ? stopLabel : undefined}
      disabled={!stopping && !canSend}
      className={cn(
        "group/send pointer-events-auto relative grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,transform,box-shadow] duration-200 ease-out active:scale-90",
        filled ? "bg-primary text-primary-foreground shadow-soft enabled:hover:bg-primary/85" : "bg-muted text-muted-foreground/60",
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
