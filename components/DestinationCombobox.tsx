"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Command as Cmdk } from "cmdk";
import { BedDouble, Landmark, Loader2, MapPin, Plane, TrainFront, Trees, Utensils, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Suggestion = { placeId: string; text: string; secondaryText: string | null; fullText?: string; types?: string[] };

/** What kind of place a suggestion is, from Google's types, so a station does not look like a street. */
function iconFor(types: string[] = []): LucideIcon {
  const has = (...t: string[]) => t.some((x) => types.includes(x));
  if (has("airport")) return Plane;
  if (has("train_station", "subway_station", "transit_station", "bus_station", "light_rail_station")) return TrainFront;
  if (has("park", "national_park", "campground")) return Trees;
  if (has("lodging", "hotel")) return BedDouble;
  if (has("restaurant", "cafe", "bar", "food")) return Utensils;
  if (has("tourist_attraction", "museum", "church", "place_of_worship", "point_of_interest", "stadium")) return Landmark;
  return MapPin;
}

/**
 * City/region typeahead against the app's own Google Places integration — restricted to
 * locality-level results, so it resolves the ambiguity a plain text field can't ("Georgia" the
 * country vs. the state). Selecting a suggestion commits immediately via `onSelect`; typing
 * without picking one still works as free text via `onChange`, same as before this existed.
 */
export type { Suggestion };
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
  scope = "regions",
  full = false,
  onPick,
  enter = "select",
  onEnter,
  near,
  inputRef,
  maxLength,
  selectOnFocus,
  ariaLabel = "Destination",
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
  /** `regions` (default) is cities and regions only; `areas` adds neighbourhoods; `places` is anywhere: stations, airports, parks, addresses. */
  scope?: "regions" | "areas" | "places";
  /** Say the whole line ("Toronto, ON, Canada") when one is picked, instead of the short name. Always so for `areas` and `places`. */
  full?: boolean;
  /** Fired with the suggestion itself when one is picked, for a caller that needs its id (a place to attach, an airport code). */
  onPick?: (suggestion: Suggestion) => void;
  /** `select` (default): Enter takes the highlighted suggestion. `free`: Enter keeps what was typed (and calls `onEnter`) unless an arrow key chose a suggestion, for fields where free text is normal. */
  enter?: "select" | "free";
  onEnter?: () => void;
  /** `[lng, lat]` to rank `places` results toward (the trip's area). */
  near?: [number, number];
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  /** Focusing a field that already has a value selects it, so typing replaces it (a saved home city, a saved airport). */
  selectOnFocus?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const loading = status === "loading";
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const navigated = useRef(false);

  useEffect(() => {
    navigated.current = false;
    const query = value.trim();
    // Abort the moment new input arrives, not 220ms later inside the next debounce's timer —
    // otherwise a stale in-flight request for text the user has already moved past can still
    // resolve and briefly overwrite the suggestion list during that window.
    requestRef.current?.abort();
    if (query.length < 2) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const extra = scope !== "regions" ? `&scope=${scope}${near ? `&near=${near[1]},${near[0]}` : ""}` : "";
    const run = async (attempt: number) => {
      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const r = await fetch(`${endpoint ?? `/api/trips/${tripId}/places/google/autocomplete`}?query=${encodeURIComponent(query)}${extra}`, { signal: controller.signal });
        if (!r.ok) throw new Error(`suggestions ${r.status}`);
        const body = await r.json();
        if (cancelled) return;
        setSuggestions(body.suggestions ?? []);
        setStatus("ok");
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        // A failed lookup is not "no matches": try once more, then say suggestions are unavailable.
        if (attempt < 1) timer = setTimeout(() => void run(attempt + 1), 900);
        else {
          setSuggestions([]);
          setStatus("error");
        }
      }
    };
    timer = setTimeout(() => void run(0), 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tripId, endpoint, scope, near?.[0], near?.[1]]);

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
          onFocus={(e) => {
            if (selectOnFocus) e.currentTarget.select();
            setOpen(true);
            // A route field sits low in a scrolling panel: bring it up so its suggestions have room below.
            if (scope === "places") rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          ref={inputRef}
          maxLength={maxLength}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") navigated.current = true;
            // In a field where free text is normal, Enter must not quietly swap what was typed for the first guess.
            if (e.key === "Enter" && enter === "free" && !navigated.current) {
              e.preventDefault();
              setOpen(false);
              // Without a handler, do what Enter would have done in a plain field: submit its form.
              if (onEnter) onEnter();
              else (e.currentTarget as HTMLInputElement).form?.requestSubmit();
            }
          }}
          aria-label={ariaLabel}
          className={inputClassName ?? "w-full rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/25 disabled:opacity-60"}
        />
        {showPanel && (
          <Cmdk.List className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-1.5 shadow-lift">
            {loading && suggestions.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            )}
            {status === "ok" && suggestions.length === 0 && (
              <Cmdk.Empty className="px-3 py-2.5 text-xs text-muted-foreground">No matches — you can still enter it as typed.</Cmdk.Empty>
            )}
            {status === "error" && (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">Suggestions aren’t available just now — you can still enter it as typed.</div>
            )}
            {suggestions.map((s) => {
              const Icon = iconFor(s.types);
              return (
                <Cmdk.Item
                  key={s.placeId}
                  value={s.placeId}
                  onSelect={() => {
                    // A city field wants the short name; a route or area field must say which King's Cross, which Shoreditch.
                    onPick?.(s);
                    onSelect(full || scope !== "regions" ? s.fullText ?? s.text : s.text);
                    setOpen(false);
                  }}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors data-[selected=true]:bg-surface")}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-ink-soft">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium leading-tight">{s.text}</span>
                    {s.secondaryText && <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">{s.secondaryText}</span>}
                  </span>
                </Cmdk.Item>
              );
            })}
          </Cmdk.List>
        )}
      </Cmdk>
    </div>
  );
}
