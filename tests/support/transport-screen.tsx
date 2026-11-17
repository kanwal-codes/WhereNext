import React from "react";
import { useTransportSearch } from "../../features/transport/application/useTransportSearch";
import { TransportSurface } from "../../features/transport/ui/TransportSurface";
import { stubs } from "./transport-harness";

/**
 * The search as the screen wires it: two fields that search by themselves once both ends are settled (a suggestion picked, Enter, the swap), the
 * search hook, and the results under them. It stands in for the pill and its editor so the results can be tested through a real search.
 */
export function TransportScreen({ tripId, preset, onRoute }: { tripId: string; preset?: import("../../features/transport/application/useTransportSearch").TransportPreset; onRoute?: (legs: never, overlay?: never) => void }) {
  const t = useTransportSearch({ tripId, preset, onRoute: onRoute as never });
  const { from, to, setFrom, setTo, search, clear, searched, loading } = t;
  const empty = (v: string) => { if (!v.trim() && (searched || loading)) clear(); };
  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()} onKeyDownCapture={(e) => { if (e.key === "Enter" && from.trim() && to.trim()) void search({ modes: [] }); }}>
        <stubs.DestinationCombobox ariaLabel="From" value={from} onChange={(v) => { setFrom(v); empty(v); }} onSelect={(text) => { setFrom(text); if (to.trim()) void search({ from: text, modes: [] }); }} />
        <stubs.DestinationCombobox ariaLabel="To" value={to} onChange={(v) => { setTo(v); empty(v); }} onSelect={(text) => { setTo(text); if (from.trim()) void search({ to: text, modes: [] }); }} />
        <button type="button" aria-label="Swap start and end" onClick={() => { const a = to; const b = from; setFrom(a); setTo(b); if (a.trim() && b.trim()) void search({ from: a, to: b, modes: [] }); }}>swap</button>
      </form>
      <TransportSurface tripId={tripId} t={t} onEdit={() => {}} />
    </div>
  );
}
