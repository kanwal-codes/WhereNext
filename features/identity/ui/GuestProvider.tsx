"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { GuestSavePrompt } from "@/features/identity/ui/GuestSavePrompt";
import { GUEST_LIVE_KEY } from "@/features/identity/application/guestSession";

type GuestValue = {
  /** True while the visitor is on an anonymous session: Roam only, everything else asks for an account. */
  guest: boolean;
  /** Opens the "create a free account" dialog. `what` finishes "to ...", e.g. "add places to a trip". */
  openGate: (what?: string) => void;
};

const GuestContext = createContext<GuestValue>({ guest: false, openGate: () => undefined });

/** Server-decided (from the session, not sniffed on the client), so the locked UI never flashes open. */
export const useGuest = () => useContext(GuestContext);

function GuestGateDialog({ open, tripId, what, onClose }: { open: boolean; tripId: string; what?: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} side="center" ariaLabel="Create a free account" className="max-w-md">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <GuestSavePrompt
        tripId={tripId}
        exhausted={false}
        heading={what ? `Create a free account to ${what}.` : "Create a free account to unlock this."}
        body="Roam is free to use without one. Saving places, building an itinerary, group chat and bookings need an account, and this trip comes with you."
      />
    </Sheet>
  );
}

/**
 * Wraps a trip's pages for a guest: provides the locked-features context and the sign-up dialog,
 * and makes the session disposable. A guest chat is not kept: opening it any way other than the
 * landing box's own hand-off (a reload, a new tab, a return visit) deletes the session and sends
 * the visitor back to the start.
 */
export function GuestProvider({ guest, tripId, children }: { guest: boolean; tripId: string; children: ReactNode }) {
  const [gate, setGate] = useState<{ what?: string } | null>(null);
  const [fresh, setFresh] = useState(!guest);
  const openGate = useCallback((what?: string) => setGate({ what }), []);
  const value = useMemo(() => ({ guest, openGate }), [guest, openGate]);

  // Before the first paint: with an effect, the handed-off visitor saw one blank frame between the landing page and the chat.
  useLayoutEffect(() => {
    if (!guest) return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    let handedOff = false;
    try {
      handedOff = window.sessionStorage.getItem(GUEST_LIVE_KEY) === tripId;
    } catch {
      /* storage blocked: treat as not handed off */
    }
    if (handedOff && navigation?.type !== "reload") {
      setFresh(true);
      return;
    }
    try {
      window.sessionStorage.removeItem(GUEST_LIVE_KEY);
      // The chat also keeps a per-tab copy of the thread; it goes with the session.
      window.sessionStorage.removeItem(`where-next:conversation:${tripId}`);
      window.sessionStorage.removeItem(`wn:first-message:${tripId}`);
    } catch {
      /* ignore */
    }
    void fetch("/api/guest/reset", { method: "POST", keepalive: true })
      .catch(() => undefined)
      .finally(() => window.location.replace("/"));
  }, [guest, tripId]);

  return (
    <GuestContext.Provider value={value}>
      {fresh ? children : <div className="min-h-screen bg-background" aria-busy="true" />}
      <GuestGateDialog open={Boolean(gate)} tripId={tripId} what={gate?.what} onClose={() => setGate(null)} />
    </GuestContext.Provider>
  );
}
