"use client";

import { useEffect, useRef, useState } from "react";
import { Command as Cmdk } from "cmdk";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Suggestion = { placeId: string; text: string; secondaryText: string | null };

/**
 * City/region typeahead against the app's own Google Places integration — restricted to
 * locality-level results, so it resolves the ambiguity a plain text field can't ("Georgia" the
 * country vs. the state). Selecting a suggestion commits immediately via `onSelect`; typing
 * without picking one still works as free text via `onChange`, same as before this existed.
 */
export function DestinationCombobox({
  tripId,
  endpoint,
  inputClassName,
  value,
  onChange,
  onSelect,
  placeholder,
  autoFocus,
  disabled,
}: {
  /** The trip whose autocomplete route to use; omit it (and pass `endpoint`) outside a trip, e.g. on the profile. */
  tripId?: string;
  /** An autocomplete route taking `?query=`, overriding the trip's. */
  endpoint?: string;
  /** Replaces the input's default compact styling. */
  inputClassName?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = value.trim();
    // Abort the moment new input arrives, not 220ms later inside the next debounce's timer —
    // otherwise a stale in-flight request for text the user has already moved past can still
    // resolve and briefly overwrite the suggestion list during that window.
    requestRef.current?.abort();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      const controller = new AbortController();
      requestRef.current = controller;
      fetch(`${endpoint ?? `/api/trips/${tripId}/places/google/autocomplete`}?query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((body) => setSuggestions(body.suggestions ?? []))
        .catch((e) => { if (!(e instanceof DOMException && e.name === "AbortError")) setSuggestions([]); })
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [value, tripId, endpoint]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const showPanel = open && value.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative">
      <Cmdk shouldFilter={false} loop>
        <Cmdk.Input
          value={value}
          onValueChange={onChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label="Destination"
          className={inputClassName ?? "w-full rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/25 disabled:opacity-60"}
        />
        {showPanel && (
          <Cmdk.List className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover py-1 shadow-lift">
            {loading && suggestions.length === 0 && (
              <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            )}
            {!loading && suggestions.length === 0 && (
              <Cmdk.Empty className="px-2.5 py-2 text-xs text-muted-foreground">No matches — you can still enter it as typed.</Cmdk.Empty>
            )}
            {suggestions.map((s) => (
              <Cmdk.Item
                key={s.placeId}
                value={s.placeId}
                onSelect={() => {
                  onSelect(s.text);
                  setOpen(false);
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-1.5 px-2.5 py-1.5 text-sm data-[selected=true]:bg-accent",
                )}
              >
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate">{s.text}</span>
                  {s.secondaryText && <span className="block truncate text-xs text-muted-foreground">{s.secondaryText}</span>}
                </span>
              </Cmdk.Item>
            ))}
          </Cmdk.List>
        )}
      </Cmdk>
    </div>
  );
}
