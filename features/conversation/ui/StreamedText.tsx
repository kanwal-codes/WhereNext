"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReducedMotion } from "motion/react";

/**
 * How Roam's reply appears while it is being written.
 *
 * Network chunks arrive in bursts; showing them as they land reads as stutter. Instead the pace
 * follows the stream itself: each chunk is spread over about as long as the next one is expected
 * to take, so the text keeps moving and lands just as more arrives (a burst is smoothed out, a
 * pause reads as a natural beat). It is released in whole words, and each new word settles in
 * from a soft blur (`.chat-word`), with each new block — paragraph, bullet, heading — lifting
 * into place (`.chat-live`).
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

const MIN_CPS = 30;
const MAX_CPS = 900;
/** Fallback for the gap between chunks until a few have been measured. */
const DEFAULT_GAP_MS = 140;
/** Each chunk is spread over its expected gap × this, so the reveal never quite runs dry. */
const GAP_STRETCH = 1.3;
/** Once the stream has ended, whatever is left is finished in about this long. */
const FINISH_S = 0.7;
/** Words released in the same burst enter this far apart, so a burst pours in instead of popping. */
const STAGGER_MS = 32;
const MAX_STAGGER_MS = 320;

/**
 * The prefix of `text` that may be shown. Whole words only: a word appears once it is complete,
 * so it fades in as a unit instead of growing letter by letter.
 */
function wordBoundary(text: string, pos: number, live: boolean): number {
  const end = wordEnd(text, pos, live);
  if (!live || end >= text.length) return end;
  // A line that is only "-" or "=" so far could still become a bullet — but for a moment it reads
  // as a setext underline that turns the line above into a heading. Hold it back until more of
  // the line has arrived, so a paragraph never flashes into a heading and back.
  const lineStart = text.lastIndexOf("\n", end - 1) + 1;
  return lineStart > 0 && /^\s{0,3}[-=]+\s*$/.test(text.slice(lineStart, end)) ? lineStart : end;
}

function wordEnd(text: string, pos: number, live: boolean): number {
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

/** `born` is 0 for words that were already there at mount (they never animate). `nextSlot` is a running schedule: when the next new word may start, so words always enter in
 *  reading order, each a beat after the last, even across bursts. */
type Births = { map: Map<number, number>; delays: Map<number, number>; nextSlot: number; first: boolean };

/** rehype plugin: wraps each word that is still fading in in a `.chat-word` span. */
function rehypeWordFade(options: { births: Births; now: number; animate: boolean }) {
  type Node = { type: string; tagName?: string; value?: string; children?: Node[]; properties?: Record<string, unknown> };
  return (tree: Node) => {
    if (!options.animate) return;
    let ordinal = 0;
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
              let delay = 0;
              if (!options.births.first) {
                const start = Math.max(options.now, options.births.nextSlot);
                options.births.nextSlot = Math.min(start + STAGGER_MS, options.now + MAX_STAGGER_MS);
                delay = start - options.now;
              }
              options.births.delays.set(n, delay);
            }
            const delay = options.births.delays.get(n) ?? 0;
            // Every word that arrives after mount stays a span until the stream ends. React keys
            // siblings as "span-<n>" (the n-th span in the paragraph), so a word turning back into
            // plain text once its fade finished would shift every later span's key and make React
            // recycle the wrong elements — restarting or dropping fades mid-stream.
            next.push(
              born > 0
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
  // Arrival timing: how long chunks are taking, so the reveal can be paced to match.
  const arrivalRef = useRef({ length: content.length, at: 0, gap: DEFAULT_GAP_MS });
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
      const arrival = arrivalRef.current;
      if (target.length > arrival.length) {
        if (arrival.at) arrival.gap = arrival.gap * 0.7 + Math.min(Math.max(now - arrival.at, 50), 700) * 0.3;
        arrival.at = now;
        arrival.length = target.length;
      }
      const remaining = target.length - posRef.current;
      if (remaining > 0) {
        const seconds = liveRef.current ? (arrival.gap * GAP_STRETCH) / 1000 : FINISH_S;
        const cps = reduceMotion ? Infinity : Math.min(MAX_CPS, Math.max(MIN_CPS, remaining / seconds));
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

  const births = useRef<Births>({ map: new Map(), delays: new Map(), nextSlot: 0, first: true });
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
    <div className="chat-prose chat-live">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} skipHtml allowedElements={LIVE_ELEMENTS} unwrapDisallowed components={components}>
        {text}
      </Markdown>
    </div>
  );
}
