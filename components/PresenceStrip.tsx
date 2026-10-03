"use client";

import { useTripPresence } from "@/components/TripDataProvider";

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();
const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** "N here" + coloured initials for everyone currently viewing the trip. Hidden when you're alone. */
export function PresenceStrip({ className = "" }: { className?: string }) {
  const peers = useTripPresence();
  if (peers.length < 2) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex -space-x-1.5">
        {peers.slice(0, 4).map((p) => (
          <span
            key={p.userId}
            title={p.name}
            className="grid h-6 w-6 place-items-center rounded-full border border-background text-2xs font-semibold text-white"
            style={{ backgroundColor: `hsl(${hue(p.userId)} 55% 45%)` }}
          >
            {initials(p.name)}
          </span>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{peers.length} here</span>
    </div>
  );
}
