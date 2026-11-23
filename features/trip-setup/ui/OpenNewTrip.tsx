"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * "New trip" is one step: a blank trip is made and Roam opens on it, so there is no page to fill in first. The page is only what shows for that moment
 * (and the way to try again if it fails). The trip is opened with `replace`, so Back goes to where you were and does not make another one.
 */
export function OpenNewTrip() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  // Stable for the life of this mount, so a retry after a lost response is recognised as the same attempt and the server does not make a second blank trip.
  const idempotencyKey = useRef(crypto.randomUUID());

  async function open() {
    setFailed(false);
    try {
      const response = await fetch("/api/trips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destination: null, idempotencyKey: idempotencyKey.current }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.trip?.id) throw new Error();
      router.replace(`/trips/${body.trip.id}/chat`);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return failed ? (
    <div role="alert" className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
      <p className="text-sm font-medium">We couldn’t open a new trip. Try again in a moment.</p>
      <button type="button" onClick={() => void open()} className="btn-primary mt-4">Try again</button>
    </div>
  ) : (
    <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-ink-soft">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Opening a new trip…
    </div>
  );
}
