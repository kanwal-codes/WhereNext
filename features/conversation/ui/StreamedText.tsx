"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReducedMotion } from "motion/react";

/**
 * How Roam's reply appears while it is being written.
 *
 * Network chunks arrive in bursts; showing them as they land reads as stutter. Instead the text
 * is released at a steady, adaptive pace (a burst is smoothed out, a slow stream never stalls),
 * always in whole words, and each new word settles in with a short fade-rise (`.chat-word`).
 * Formatting — bullets, bold, headings — appears live as it is written, so the finished message
 * doesn't jump when it is swapped for its final render.
 *
 * Streamed text is still the raw provider output, before the link/image allow-list runs, so this
 * render is inert: no links, no images (see the matching test in assistant-message.test.tsx).
 */

const LIVE_ELEMENTS = [
  "p", "br", "strong", "em", "del", "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4",
  "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
  "span",
];

const components: Components = {
  // Raw links/images are dropped while streaming; their text stays.
  a: ({ children }) => <>{children}</>,
  img: () => null,
};

/** How long a word keeps its entrance class — a little longer than the CSS animation. */
const FADE_MS = 700;
const MIN_CPS = 45;
const MAX_CPS = 520;
/** Words released in the same burst enter this far apart, so a burst pours in instead of popping. */
const STAGGER_MS = 38;
const MAX_STAGGER_MS = 300;
/** Catch-up gain: at this many chars behind, the reveal runs at (chars × gain) per second. */
const CATCH_UP = 4;

/**
 * The prefix of `text` that may be shown. Whole words only: a word appears once it is complete,
 * so it fades in as a unit instead of growing letter by letter.
 */
function wordBoundary(text: string, pos: number, live: boolean): number {
  let end = Math.min(Math.floor(pos), text.length);
  if (end >= text.length) {
    if (!live) return text.length;
    // The last word may still be growing — hold it back until whitespace follows it.
    const lastSpace = text.search(/\s\S*$/);
    return lastSpace === -1 ? 0 : lastSpace + 1;
  }
  // Mid-word: finish the word if it is complete, otherwise stop before it.
  if (/\S/.test(text[end]!) && end > 0 && /\S/.test(text[end - 1]!)) {
    const nextSpace = text.slice(end).search(/\s/);
    if (nextSpace === -1) return live ? Math.max(0, text.slice(0, end).search(/\S*$/)) : text.length;
    end += nextSpace;
  }
  return end;
}

type Births = { map: Map<number, number>; delays: Map<number, number>; first: boolean };

/** rehype plugin: wraps each word that is still fading in in a `.chat-word` span. */
function rehypeWordFade(options: { births: Births; now: number; animate: boolean }) {
  type Node = { type: string; tagName?: string; value?: string; children?: Node[]; properties?: Record<string, unknown> };
  return (tree: Node) => {
    if (!options.animate) return;
    let ordinal = 0;
    let newThisPass = 0;
    const walk = (node: Node, skip: boolean) => {
      if (!node.children) return;
      const next: Node[] = [];
      for (const child of node.children) {
        if (child.type === "text" && !skip) {
          for (const part of (child.value ?? "").split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
              next.push({ type: "text", value: part });
              continue;
            }
            const n = ordinal++;
            let born = options.births.map.get(n);
            if (born === undefined) {
              // Words already present when the message first rendered are simply there.
              born = options.births.first ? 0 : options.now;
              options.births.map.set(n, born);
              options.births.delays.set(n, options.births.first ? 0 : Math.min(newThisPass++ * STAGGER_MS, MAX_STAGGER_MS));
            }
            const delay = options.births.delays.get(n) ?? 0;
            next.push(
              options.now - born < FADE_MS + delay
                ? {
                    type: "element",
                    tagName: "span",
                    properties: { className: ["chat-word"], style: delay ? `animation-delay:${delay}ms` : undefined },
                    children: [{ type: "text", value: part }],
                  }
                : { type: "text", value: part },
            );
          }
        } else {
          if (child.type === "element") walk(child, skip || child.tagName === "pre" || child.tagName === "code");
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree, false);
  };
}

export function StreamedText({
  content,
  live,
  onDone,
}: {
  content: string;
  /** More text may still arrive. When false, the reveal runs to the end and calls `onDone`. */
  live: boolean;
  onDone: () => void;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const [shown, setShown] = useState(content.length);
  const targetRef = useRef(content);
  const liveRef = useRef(live);
  const doneRef = useRef(onDone);
  const posRef = useRef(content.length);
  targetRef.current = content;
  liveRef.current = live;
  doneRef.current = onDone;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let finished = false;
    const tick = (now: number) => {
      const target = targetRef.current;
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      const remaining = target.length - posRef.current;
      if (remaining > 0) {
        const cps = reduceMotion ? Infinity : Math.min(MAX_CPS, Math.max(MIN_CPS, remaining * CATCH_UP));
        posRef.current = Math.min(target.length, posRef.current + cps * dt);
      } else {
        posRef.current = target.length;
      }
      const visible = wordBoundary(target, posRef.current, liveRef.current && !reduceMotion);
      setShown((prev) => (prev === visible ? prev : visible));
      if (!liveRef.current && visible >= target.length && !finished) {
        finished = true;
        doneRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  const births = useRef<Births>({ map: new Map(), delays: new Map(), first: true });
  const now = Date.now();
  const text = content.slice(0, Math.min(shown, content.length));
  const rehypePlugins = useMemo(
    () => [[rehypeWordFade, { births: births.current, now, animate: !reduceMotion }]] as never,
    // A fresh `now` per render is the point: it decides which words are still fading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, reduceMotion],
  );
  useEffect(() => {
    births.current.first = false;
  }, []);

  return (
    <div className="chat-prose">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} skipHtml allowedElements={LIVE_ELEMENTS} unwrapDisallowed components={components}>
        {text}
      </Markdown>
    </div>
  );
}
