"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { notifyToast } from "@/lib/application/toast";

/**
 * "New trip" in one step, without leaving the page it was pressed on: a blank trip is made, then Roam opens on it as an ordinary navigation (no page in between, no
 * reload). `opening` stays true from the press until the page changes, so the button can show it is working and cannot be pressed twice.
 */
export function useOpenNewTrip() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  // Reused when a try fails (so a lost response is not a second blank trip); a fresh one after a success.
  const key = useRef(crypto.randomUUID());

  async function open() {
    if (opening) return;
    setOpening(true);
    try {
      const response = await fetch("/api/trips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destination: null, idempotencyKey: key.current }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.trip?.id) throw new Error();
      key.current = crypto.randomUUID();
      router.push(`/trips/${body.trip.id}/chat`);
    } catch {
      setOpening(false);
      notifyToast("We couldn’t open a new trip. Try again in a moment.", "error");
    }
  }

  return { open, opening };
}
