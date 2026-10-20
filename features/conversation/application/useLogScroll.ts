import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject, type UIEvent } from "react";

/** Turns rendered when the chat opens, and added each time "Show earlier messages" is pressed. The
 *  thread itself is loaded whole (it is small); this is only how much of it is laid out at once. */
const VISIBLE_TURNS = 30;

/** How much of the remaining distance the follow-scroll covers each frame (lower = softer). */
const FOLLOW_EASE = 0.09;

/**
 * How the Roam chat's log moves: it lands on the latest message, reveals each new exchange, glides down with a reply as it
 * is written (and lets go the moment the reader scrolls), pages in earlier turns without shoving the reader's place, and
 * reports whether the log is scrolled off the top or far above the latest message.
 */
export function useLogScroll({ logRef, sending, loaded, messageCount, onLogScroll }: {
  logRef: RefObject<HTMLDivElement | null>;
  sending: boolean;
  loaded: boolean;
  messageCount: number;
  onLogScroll?: (e: UIEvent<HTMLDivElement>) => void;
}) {
  // How many of the newest turns the log renders; "Show earlier messages" adds another page of them.
  const [windowSize, setWindowSize] = useState(VISIBLE_TURNS);
  // Where the reading position was when that button was pressed, so revealing earlier turns above
  // doesn't shove the one you were reading off the screen.
  const olderAnchorRef = useRef<{ height: number; top: number } | null>(null);

  // Every message in THIS log is the direct result of the viewer's own action — typing and
  // pressing send, or tapping a follow-up/suggestion chip on an older message further up the
  // log (unlike group chat, personal chat has no other party whose message could land here
  // passively) — so a new one is always worth revealing, regardless of where the viewer is
  // currently scrolled. Live-caught: tapping "Tell me more →" on a card from earlier in the
  // conversation silently sent a new question with zero visual feedback, because this used to
  // only scroll when already within 160px of the bottom — correct for not yanking someone away
  // from content they're passively reading, wrong for an action they just deliberately took and
  // are waiting to see the result of. This scrolls unconditionally on that one event and then
  // stops — it does NOT keep chasing the reply as it streams in afterwards (see
  // `onAssistantDelta` below): reveal that a new exchange has started, then let the viewer read
  // at their own pace, exactly the balance asked for.
  const scrollToLatestMessage = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    // Scroll the log itself to its true max, not `endRef.scrollIntoView({block:"end"})` — that
    // aligned `endRef`'s position (right after the last message/followup chips, BEFORE the
    // `pb-28` clearance below it) with the container's bottom edge, so the reserved 112px gap
    // sat scrolled past, off-screen, doing nothing — the last message/card/suggestion landed
    // flush with the container's bottom edge instead, exactly where the floating composer
    // overlay sits on top of it. Live-caught: a fresh reply's follow-up chips ended up hidden
    // behind the composer both on initial load and right after sending. Scrolling the container
    // to `scrollHeight` instead lands on the true bottom, which correctly includes the `pb-28`
    // padding as visible trailing space above the composer.
    log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [logRef]);

  // First landing: jump straight to the latest message, instantly. `scrollbar-slim` (the log's
  // own class) deliberately carries no `scroll-behavior: smooth` — see its definition in
  // app/globals.css for why — so a plain `scrollTop` assignment is already an instant jump,
  // no save/restore dance needed. Re-run once after layout in case card images reflow the height.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const jump = () => { log.scrollTop = log.scrollHeight; };
    jump();
    // Card images / blocks reflow the log taller just after mount — keep it pinned
    // to the bottom for a beat (no smoothing) so we don't land mid-conversation.
    const ids = [60, 200, 500].map((ms) => window.setTimeout(jump, ms));
    ids.push(requestAnimationFrame(jump));
    return () => ids.forEach((id) => { clearTimeout(id); cancelAnimationFrame(id); });
  }, [loaded, logRef]);

  useEffect(() => {
    scrollToLatestMessage();
    // A new message can carry place/event card images that finish loading a moment after this
    // fires, growing the log taller than what `scrollToLatestMessage` just measured — one call
    // can still fall short (live-caught: the last card partly behind the composer). Retry
    // shortly after to catch that late reflow. Scoped to this per-new-message effect (fires once
    // per real message, not per streamed token) rather than baked into `scrollToLatestMessage`
    // itself — see that function's own comment for why doing it there caused the page to
    // visibly bounce while a reply was actively streaming in.
    const t1 = setTimeout(scrollToLatestMessage, 200);
    const t2 = setTimeout(scrollToLatestMessage, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [messageCount, scrollToLatestMessage]);

  // Follow the reply as it is written. The log eases down with the growing text — a damped
  // glide, never a jump — so the edge being written stays in view instead of running off under
  // the composer. It only starts once words are actually appearing, and the moment the viewer
  // scrolls or touches the log themselves it lets go for the rest of that turn, so it can never
  // fight someone who is reading back up.
  // `tail` keeps the glide going for a moment after the stream ends: the last words are still
  // being revealed then.
  const [tail, setTail] = useState(false);
  const wasSending = useRef(false);
  useEffect(() => {
    if (sending) {
      wasSending.current = true;
      setTail(false);
      return;
    }
    if (!wasSending.current) return;
    wasSending.current = false;
    setTail(true);
    const timer = setTimeout(() => setTail(false), 1600);
    return () => clearTimeout(timer);
  }, [sending]);
  const follow = sending || tail;
  useEffect(() => {
    const log = logRef.current;
    if (!follow || !log) return;
    let released = false;
    const release = () => { released = true; };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach((name) => log.addEventListener(name, release, { passive: true }));
    let frame = 0;
    const tick = () => {
      const reply = log.querySelector<HTMLElement>("[data-latest-reply]");
      if (!released && reply?.textContent?.trim()) {
        const gap = log.scrollHeight - log.clientHeight - log.scrollTop;
        if (gap > 0.5) log.scrollTop += Math.max(gap * FOLLOW_EASE, 0.6);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((name) => log.removeEventListener(name, release));
    };
  }, [follow, logRef]);

  // Scrolled off the top (fade the edge) / far above the latest message (offer a way back).
  const [scroll, setScroll] = useState({ scrolled: false, away: false });
  const handleLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const n = e.currentTarget;
    const scrolled = n.scrollTop > 4;
    const away = n.scrollHeight - n.clientHeight - n.scrollTop > n.clientHeight * 1.2;
    setScroll((s) => (s.scrolled === scrolled && s.away === away ? s : { scrolled, away }));
    onLogScroll?.(e);
  };

  // Earlier turns appear above what you were reading, so hold that line in place rather than letting the
  // log grow upward under the viewport (the same anchor the group chat uses when it pages in history).
  useLayoutEffect(() => {
    const anchor = olderAnchorRef.current;
    const log = logRef.current;
    if (!anchor || !log) return;
    log.scrollTop = anchor.top + (log.scrollHeight - anchor.height);
    olderAnchorRef.current = null;
  }, [windowSize, logRef]);

  const showEarlier = () => {
    const log = logRef.current;
    if (log) olderAnchorRef.current = { height: log.scrollHeight, top: log.scrollTop };
    setWindowSize((n) => n + VISIBLE_TURNS);
  };

  return { scroll, handleLogScroll, scrollToLatestMessage, windowSize, showEarlier };
}
