"use client";

import { useEffect, useState } from "react";

/**
 * A placeholder that types out each example, holds it, deletes it and moves to the next — the
 * empty box shows what to write instead of asking a visitor to invent a trip cold. Frozen (and
 * a single static example) under prefers-reduced-motion; `active` pauses it while the visitor
 * is typing or has the box focused.
 */
export function useTypingPlaceholder(examples: readonly string[], active: boolean, startDelay = 900) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(examples[0]);
      return;
    }
    let cancelled = false;
    let timer = 0;
    let index = 0;
    let length = 0;
    let deleting = false;
    const tick = () => {
      if (cancelled) return;
      const full = examples[index];
      if (!deleting) {
        length += 1;
        setText(full.slice(0, length));
        if (length >= full.length) {
          deleting = true;
          timer = window.setTimeout(tick, 2200);
        } else timer = window.setTimeout(tick, 34);
      } else {
        length = Math.max(0, length - 2);
        setText(full.slice(0, length));
        if (length === 0) {
          deleting = false;
          index = (index + 1) % examples.length;
          timer = window.setTimeout(tick, 450);
        } else timer = window.setTimeout(tick, 16);
      }
    };
    timer = window.setTimeout(tick, startDelay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, examples, startDelay]);

  return text;
}
