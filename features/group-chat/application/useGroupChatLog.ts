import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { GROUP_HISTORY_LIMIT, type GroupMessage } from "../domain/message";
import { clockSkewMs } from "../domain/outbox";

/** Messages laid out when the chat opens, and revealed per press of "Show earlier messages" — the page
 *  the server sends (GROUP_HISTORY_LIMIT) is larger, so the first press costs no request at all. */
const VISIBLE_MESSAGES = 20;
/** How often an open chat re-reads the log as a safety net, and how stale it may be before a tab switch re-reads it. */
const POLL_MS = 30_000;

/**
 * The group chat's message log: the newest page (read on open, on a realtime change, and every 30 s while the chat is on
 * screen), the older pages scrolled back into, and the bookkeeping that keeps the view steady while they land.
 * `logRef` is the scrollable element, used only to keep what you were reading in place when older messages arrive above it.
 */
export function useGroupChatLog({ tripId, active, cacheKey, logRef }: { tripId: string; active: boolean; cacheKey: string; logRef: RefObject<HTMLDivElement | null> }) {
  // `refresh()` reads the newest page on mount either way, so the history is not server-rendered into every trip page as well.
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The last read of the thread failed (offline, server down): say so, instead of showing an empty or stale chat as if it were current.
  const [loadFailed, setLoadFailed] = useState(false);
  // This device's clock against the server's: "Roam has not answered for two minutes" is judged on server time.
  const skewRef = useRef(0);
  // Pages of history older than the newest window, loaded on request and kept apart from it (a refresh replaces only the newest).
  const [older, setOlder] = useState<GroupMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  // How many of the newest page are laid out. The page itself is loaded whole; this is main-thread work:
  // forty messages of cards, polls and reaction rows took ~550 ms to lay out on a mid-range phone, which is
  // the chat sitting frozen as it opens. "Show earlier messages" reveals the rest before it asks the server.
  const [windowSize, setWindowSize] = useState(VISIBLE_MESSAGES);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const olderLoadedRef = useRef(false);
  // Only a message that arrives after this surface's own first read (a live reply, someone else's
  // send) plays the "new message" entrance animation; the history it opens with appears in place.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const firstReadRef = useRef(true);
  const refreshIdRef = useRef(0);
  /** When the log last came back from the server, so returning to this tab doesn't re-read it for nothing. */
  const refreshedAtRef = useRef(0);

  // Open on the last thing you saw instead of an empty log: the chat from the previous visit is on screen at once (marked seen, so
  // nothing animates in) and the fetch below swaps in anything newer. Per tab, per person.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as GroupMessage[];
      if (!Array.isArray(cached) || cached.length === 0) return;
      for (const m of cached) seenIdsRef.current.add(m.id);
      setMessages((prev) => (prev.length === 0 ? cached : prev));
      setLoaded(true);
    } catch { /* storage blocked or malformed: the normal first load */ }
  }, [cacheKey]);

  // Returns the freshly-fetched list (or undefined on failure/supersession) so a caller can
  // check whether something it was waiting on actually landed — see `askRoam`'s catch handler.
  const refresh = useCallback(async (): Promise<GroupMessage[] | undefined> => {
    // Same request-id guard as DiscoverySurface/StaySurface: refresh() fires from three
    // independent triggers (mount, every realtime "groupChat" event, right after sending) with
    // no ordering guarantee between them — without this, an earlier call's response landing
    // after a newer one's would overwrite the fresh list with stale data.
    const mine = ++refreshIdRef.current;
    try {
      const response = await fetch(`/api/trips/${tripId}/group-chat`);
      if (!response.ok) throw new Error("load");
      skewRef.current = clockSkewMs(response.headers.get("date"), Date.now());
      const body = await response.json();
      if (mine !== refreshIdRef.current) return undefined;
      setLoadFailed(false);
      const fresh = (body.messages ?? []) as GroupMessage[];
      // The page the chat opens with is history, not news: marked seen before it is ever rendered, so
      // forty bubbles don't cascade their entrance animation the moment the log appears.
      if (firstReadRef.current) {
        firstReadRef.current = false;
        for (const m of fresh) seenIdsRef.current.add(m.id);
      }
      // Keep the same array when nothing changed, so the poll below doesn't re-render the whole log.
      setMessages((prev) => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh));
      try { sessionStorage.setItem(cacheKey, JSON.stringify(fresh.slice(-40))); } catch { /* full or blocked */ }
      if (!olderLoadedRef.current) setHasOlder(fresh.length >= GROUP_HISTORY_LIMIT);
      return fresh;
    } catch {
      // The last successfully loaded state stays on screen, with a note that it may be out of date.
      if (mine === refreshIdRef.current) setLoadFailed(true);
      return undefined;
    } finally {
      if (mine === refreshIdRef.current) { refreshedAtRef.current = Date.now(); setLoaded(true); }
    }
  }, [tripId, cacheKey]);

  useEffect(() => {
    if (!active) return;
    // Switching back to a tab that was read moments ago costs nothing: a message that arrived meanwhile
    // came in over realtime, and the poll below covers a socket that died. Only a stale log is re-read.
    if (Date.now() - refreshedAtRef.current < POLL_MS) return;
    void refresh();
  }, [active, tripId, refresh]);

  // Only a real group-chat change (a message, a reaction) should pay for this refetch — the
  // bus carries the change type specifically so an itinerary edit or a saved place elsewhere
  // on the trip doesn't retrigger a full history reload here.
  useEffect(() => subscribeWorkspaceChanges((changes) => {
    if (changes.includes("groupChat")) void refresh();
  }), [refresh]);

  // Safety net for when the realtime socket is down or silently dropped (a bad table on the channel, a
  // suspended tab): while the chat is on screen, re-read it every 30s so a collaborator's message still
  // lands without a manual reload. Realtime stays the fast path; this only covers its gaps.
  // ponytail: plain interval poll, swap for an `after=<last id>` delta fetch if history gets large.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, refresh]);

  // Keep what you were reading in place when older messages land above it.
  useLayoutEffect(() => {
    const anchor = olderAnchorRef.current;
    const log = logRef.current;
    if (!anchor || !log) return;
    log.scrollTop = anchor.top + (log.scrollHeight - anchor.height);
    olderAnchorRef.current = null;
  }, [older, windowSize, logRef]);

  async function loadOlder() {
    const oldest = older[0] ?? messages[0];
    const log = logRef.current;
    if (!oldest || loadingOlder || !log) return;
    // The page already in hand comes first — the server is only asked once all of it is on screen.
    if (messages.length > windowSize) {
      olderAnchorRef.current = { height: log.scrollHeight, top: log.scrollTop };
      setWindowSize((n) => n + VISIBLE_MESSAGES);
      return;
    }
    setLoadingOlder(true);
    try {
      const body = await fetch(`/api/trips/${tripId}/group-chat?before=${encodeURIComponent(oldest.created_at)}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))));
      const page = (body.messages ?? []) as GroupMessage[];
      olderLoadedRef.current = true;
      olderAnchorRef.current = { height: log.scrollHeight, top: log.scrollTop };
      for (const m of page) seenIdsRef.current.add(m.id);
      setOlder((current) => [...page, ...current]);
      setHasOlder(page.length >= GROUP_HISTORY_LIMIT);
    } catch {
      notifyToast("Couldn’t load earlier messages.", "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  // Scrolling up into history pages it in by itself; the button stays for keyboards and a short log.
  const olderSentinelRef = useRef<HTMLDivElement>(null);
  const loadOlderRef = useRef(loadOlder);
  useEffect(() => {
    loadOlderRef.current = loadOlder;
  });
  useEffect(() => {
    const el = olderSentinelRef.current;
    const log = logRef.current;
    if (!el || !log || !loaded || (!hasOlder && messages.length <= windowSize) || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        // Before the log has settled on the newest message the top is in view too: only paging someone scrolled up toward.
        if (log.scrollHeight - log.scrollTop - log.clientHeight < 80) return;
        void loadOlderRef.current();
      },
      { root: log, rootMargin: "600px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loaded, hasOlder, messages.length, windowSize, logRef]);

  return { messages, setMessages, older, hasOlder, windowSize, loadingOlder, loaded, loadFailed, refresh, loadOlder, olderSentinelRef, seenIdsRef, skewRef };
}
