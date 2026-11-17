import { useRef, useState } from "react";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { notifyToast } from "@/lib/application/toast";
import { planRoute, readRouteAsk, routeAskIsEmpty, searchModes, type RouteAsk, type RouteMode } from "@/lib/application/route-ask";
import { todayLocal } from "@/lib/application/travel-time";
import { popularAreasFor } from "@/lib/popular-areas";
import { isBroadPlace } from "@/lib/trip-stops";
import type { useTransportSearch } from "./useTransportSearch";

export const shortPlace = (place: string) => place.split(",")[0]!.trim();

/** What the editor is still waiting on before the search can run: the missing end, or a city inside a country. */
export type Waiting = { need: "from" | "to" | "city"; side: "from" | "to"; place?: string; options: string[]; ask: RouteAsk };

/**
 * The sentence behind "Where to?": reads what was typed in the browser (see `readRouteAsk`), fills the two ends, the way of travelling, the days
 * and the party, and starts the search. What cannot be read is a question the editor shows with one-tap answers: where from, where to, or which
 * city in a country. A model is asked only when the words hold no place at all, and never for longer than a few seconds.
 */
export function useRouteAsk({ tripId, t, home, stay, onGo }: { tripId: string; t: ReturnType<typeof useTransportSearch>; home: string; stay: string; onGo: () => void }) {
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);

  function run(from: string, to: string, ask: RouteAsk) {
    setWaiting(null);
    setNote("");
    const day = ask.date ?? (ask.time ? todayLocal() : undefined);
    void t.search({
      from, to, force: true,
      modes: searchModes(ask.modes),
      ...(day ? { when: { kind: ask.time?.kind ?? "depart", date: day, time: ask.time?.time ?? t.when?.time ?? "09:00" } } : {}),
      ...(ask.date ? { returnDate: ask.returnDate ?? "" } : {}),
      ...(ask.travellers ? { travellers: Math.min(9, Math.max(1, ask.travellers)) } : {}),
    });
    // A day with no time named is a day: the flights of the whole day are shown, not only those after a time nobody asked for.
    if (ask.date && !ask.time) t.setAnyTime(true);
    if (ask.more) notifyToast(`Showing ${shortPlace(from)} to ${shortPlace(to)}. Ask for ${shortPlace(to)} to ${shortPlace(ask.more)} next.`, "info");
    onGo();
  }

  function proceed(ask: RouteAsk) {
    const plan = planRoute(ask, { from: t.from, to: t.to, home, stay }, isBroadPlace, popularAreasFor);
    if (plan.kind === "go") return run(plan.from, plan.to, ask);
    if (plan.kind === "same") return setNote(`That’s ${shortPlace(plan.place)} twice. Pick a different place.`);
    setNote("");
    if (plan.kind === "ask") {
      // The end that is known goes into its field now, so the editor shows what is still missing.
      if (plan.keep) (plan.need === "from" ? t.setTo : t.setFrom)(plan.keep);
      return setWaiting({ need: plan.need, side: plan.need, options: [], ask });
    }
    // A whole country: its field is emptied for a city, the other end stays.
    (plan.side === "from" ? t.setFrom : t.setTo)("");
    if (plan.keep) (plan.side === "from" ? t.setTo : t.setFrom)(plan.keep);
    setWaiting({ need: "city", side: plan.side, place: plan.place, options: plan.options, ask });
  }

  /** The model's reading of a sentence the code found no place in. */
  async function askModel(query: string) {
    abort.current?.abort();
    const request = new AbortController();
    abort.current = request;
    const timer = window.setTimeout(() => request.abort(), 8_000);
    setReading(true);
    setNote("");
    try {
      const res = await fetch(`/api/trips/${tripId}/ai-search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "getting-around", query }), signal: request.signal });
      const body = res.ok ? await res.json() : {};
      const d = (body.directive ?? {}) as AiSearchDirective;
      if (d.from || d.to) proceed({ ...(d.from ? { from: d.from } : {}), ...(d.to ? { to: d.to } : {}), modes: ((d.modes ?? []) as string[]).map((m) => (m === "flight" || m === "drive" ? m : "transit") as RouteMode) });
      else setNote("I couldn’t find a place in that. Try a place name, or “Toronto to Montreal”.");
    } catch {
      if (abort.current === request) setNote("I couldn’t read that just now. Try a place name instead.");
    } finally {
      window.clearTimeout(timer);
      if (abort.current === request) { abort.current = null; setReading(false); }
    }
  }

  /** Text entered in a row: the To row may hold a whole sentence; the From row is a place (or a whole route, if that is what was said). */
  function submit(text: string, row: "from" | "to") {
    const query = text.trim();
    if (!query) return;
    const said = readRouteAsk(query, todayLocal());
    if (routeAskIsEmpty(said)) return void askModel(query);
    if (row === "from" && !(said.from && said.to)) {
      const place = said.to ?? said.from;
      const special = said.toSpecial ?? said.fromSpecial;
      return proceed({ ...said, from: place, fromSpecial: place ? undefined : special, to: undefined, toSpecial: undefined });
    }
    proceed(said);
  }

  /** A tapped chip or picked suggestion for the end the editor is waiting on, or for the row it was picked in. */
  function pick(place: string, row: "from" | "to") {
    const side = waiting?.side ?? row;
    if (isBroadPlace(place) && !popularAreasFor(place).length) return setNote(`${place} is a big place. Name a city in it.`);
    proceed({ ...(waiting?.ask ?? {}), from: undefined, to: undefined, fromSpecial: undefined, toSpecial: undefined, [side]: place });
  }

  function reset() {
    abort.current?.abort();
    setWaiting(null);
    setReading(false);
    setNote("");
  }

  return { waiting, reading, note, submit, pick, reset, setNote };
}
