import type { SupabaseClient } from "@supabase/supabase-js";
import { usesMiles } from "@/lib/application/geo";
import { readStayDecision, type StayDecision } from "@/packages/contracts/stay";
import { cached } from "@/lib/server/ttl-cache";
import { lodgingGaps, outsideTripDates } from "@/lib/trip-reservations";
import { describeStops, effectiveStops } from "@/lib/trip-stops";
import { committedTotals, type CommittedTotals } from "@/lib/server/committed";
import { localDebts } from "@/lib/expense-split";
import { formatMoney, resolveCurrency } from "@/lib/currency";

export type TripContext = {
  trip: { name: string; destination: string | null; origin: string | null; duration_days: number | null; start_date: string | null; end_date: string | null; travelers: number | null; updated_at?: string | null; stops?: unknown } | null;
  preferences: Record<string, unknown>;
  /** `time` ("HH:MM") is the traveller's own explicit target time for the item, set via the
   *  itinerary view's time picker — optional, and usually unset. Only ever use it as a real
   *  fact (e.g. "you'll be at X around dinner"); never guess a time from `position` order —
   *  see `inferMealAnchor` in itinerary-anchor.ts. */
  itinerary: Array<{ title: string; day_index: number; position?: number; locked: boolean; latitude?: number; longitude?: number; time?: string }>;
  lockedTitles: string[];
  /** The locked stay first (when it has coordinates), then locked itinerary items — the anchors for "distance from" on cards. */
  lockedPlaces: Array<{ title: string; latitude: number; longitude: number }>;
  lockedStay: StayDecision | null;
  /** The locked stay's own coordinates, when it has them — the single preferred "distance from
   *  your accommodation" anchor, distinct from `lockedPlaces`' nearest-of-several-locked-things.
   *  A cafe's distance to a stay is meaningful in a way its distance to, say, a locked breakfast
   *  reservation isn't; this is null until a stay is actually locked, so a caller that wants that
   *  specific meaning (rather than "nearest anything locked") can tell the two apart. */
  accommodationAnchor: { title: string; latitude: number; longitude: number } | null;
  places: Array<{ status: string; place: { name: string; category: string | null; address: string | null } | null }>;
  decisions: Array<{ kind: string; value: unknown; source: string; created_at: string }>;
  /** What the group has already booked and entered by hand (hotels, flights, trains, tickets). Booking
   *  references, PINs and notes are deliberately NOT here: the model needs what and when, never the secrets. */
  reservations?: ContextReservation[];
  /** The bookings above added up, in the trip's currency at today's reference rate: the one set of totals the assistant may quote. */
  committed?: CommittedTotals | null;
  /** Shared expenses kept in this app — never the handful of legacy rows still bridged to a real
   *  Splitwise account, which live outside this app and can't be safely summarised here. Raw,
   *  unnamed: `paidBy`/`fromUserId`/`toUserId` are user ids, resolved to real names by
   *  `formatExpenses`, alongside `describeMembers`, using the same identities map — never in
   *  this file, which has no admin client of its own to look names up with. */
  localExpenses?: LocalExpenseContext[];
  localBalances?: LocalBalanceContext[];
};

export type LocalExpenseContext = { description: string; amount: number; currency: string; paidBy: string | null; splitAmong: string[] | null };
export type LocalBalanceContext = { fromUserId: string; toUserId: string; amount: number; currency: string };

export type ContextReservation = {
  kind: string;
  title: string;
  startsOn: string | null;
  endsOn: string | null;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  toPlace: string | null;
  amount: number | null;
  currency: string | null;
  amountBasis: "total" | "per_person";
  travellers?: number | null;
  cancelled: boolean;
};

type ReservationRow = Record<string, unknown>;

const toContextReservation = (r: ReservationRow): ContextReservation => ({
  kind: r.kind as string,
  title: r.title as string,
  startsOn: (r.starts_on as string | null) ?? null,
  endsOn: (r.ends_on as string | null) ?? null,
  startTime: (r.start_time as string | null) ?? null,
  endTime: (r.end_time as string | null) ?? null,
  place: (r.place as string | null) ?? null,
  toPlace: (r.to_place as string | null) ?? null,
  amount: r.amount == null ? null : Number(r.amount),
  currency: (r.currency as string | null) ?? null,
  amountBasis: r.amount_basis === "per_person" ? "per_person" : "total",
  travellers: (r.travellers as number | null) ?? null,
  cancelled: r.status === "cancelled",
});

const coord = (metadata: Record<string, unknown> | null, key: "latitude" | "longitude"): number | undefined => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const MAX_CONTEXT_CHARS = 20_000;

/** Durable trip state the assistant is allowed to see. One query set, reused by every AI route.
 *  Cached briefly per trip (not per user/client — every table read here is a membership-gated
 *  trip-wide read, identical regardless of which member's client or the admin client runs it),
 *  busted by the same `invalidateWorkspace(tripId)` every mutation route already calls. Without
 *  this, every single turn re-ran all 5 queries even for back-to-back messages seconds apart, or
 *  two members triggering the personal/group/compare-chat routes for the same trip at once. */
export function loadTripContext(supabase: SupabaseClient, tripId: string): Promise<TripContext> {
  return cached(`trip-context:${tripId}`, 15_000, () => loadTripContextUncached(supabase, tripId));
}

async function loadTripContextUncached(supabase: SupabaseClient, tripId: string): Promise<TripContext> {
  const [trip, preferences, itinerary, places, decisions, reservations, expenseRows, memberRows] = await Promise.all([
    supabase.from("trips").select("name,destination,origin,duration_days,start_date,end_date,travelers,updated_at,stops").eq("id", tripId).maybeSingle(),
    supabase.from("trip_preferences").select("data").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_itinerary_items").select("title,day_index,position,metadata").eq("trip_id", tripId).is("removed_at", null).order("day_index").order("position").limit(50),
    supabase.from("trip_places").select("status,places(name,category,address)").eq("trip_id", tripId).limit(50),
    supabase.from("trip_decisions").select("kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(30),
    supabase.from("trip_reservations").select("kind,title,starts_on,ends_on,start_time,end_time,place,to_place,amount,currency,amount_basis,travellers,status").eq("trip_id", tripId).order("starts_on", { ascending: true, nullsFirst: false }).order("start_time", { ascending: true, nullsFirst: false }).limit(60),
    supabase.from("trip_expenses").select("description,amount,currency,paid_by,split,splitwise_expense_id,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(30),
    supabase.from("trip_members").select("user_id").eq("trip_id", tripId),
  ]);
  const error = trip.error ?? preferences.error ?? itinerary.error ?? places.error ?? decisions.error ?? reservations.error ?? expenseRows.error ?? memberRows.error;
  if (error) throw error;
  const items = (itinerary.data ?? []).map((item) => {
    const metadata = item.metadata as Record<string, unknown> | null;
    return {
      title: item.title,
      day_index: item.day_index,
      position: typeof item.position === "number" ? item.position : 0,
      locked: metadata?.locked === true,
      latitude: coord(metadata, "latitude"),
      longitude: coord(metadata, "longitude"),
      time: typeof metadata?.time === "string" ? metadata.time : undefined,
    };
  });
  // "suggestion" rows are the assistant's own pending guesses — they must not read back as confirmed facts.
  const decisionRows = ((decisions.data ?? []) as TripContext["decisions"]).filter((d) => d.kind !== "suggestion");
  const lockedStay = readStayDecision(decisionRows);
  const stayAnchor = lockedStay && lockedStay.latitude != null && lockedStay.longitude != null
    ? [{ title: lockedStay.hotelName, latitude: lockedStay.latitude, longitude: lockedStay.longitude }]
    : [];
  const bookings = (reservations.data ?? []).map((r) => toContextReservation(r as ReservationRow));
  const committed = bookings.some((r) => r.amount != null)
    ? await committedTotals(bookings.map((r) => ({ kind: r.kind as "stay", startsOn: r.startsOn, endsOn: r.endsOn, status: r.cancelled ? "cancelled" as const : "confirmed" as const, amount: r.amount, currency: r.currency, amountBasis: r.amountBasis, travellers: r.travellers ?? null })), lockedStay, trip.data?.travelers ?? null, resolveCurrency((preferences.data?.data ?? null) as Record<string, unknown> | null)).catch(() => null)
    : null;

  const amongOf = (split: unknown): string[] | null => {
    const among = (split as { among?: unknown } | null)?.among;
    return Array.isArray(among) && among.every((id) => typeof id === "string") && among.length > 0 ? (among as string[]) : null;
  };
  // Legacy rows still bridged to a real Splitwise account (a splitwise_expense_id) live outside
  // this app's own ledger and are left out — their debt is real but this app can't vouch for it.
  const localExpenseRows = (expenseRows.data ?? []).filter((e) => !e.splitwise_expense_id);
  const localExpenses: LocalExpenseContext[] = localExpenseRows.map((e) => ({
    description: e.description as string, amount: Number(e.amount), currency: e.currency as string, paidBy: e.paid_by as string | null, splitAmong: amongOf(e.split),
  }));
  const memberIds = (memberRows.data ?? []).map((m) => m.user_id as string);
  const localBalances: LocalBalanceContext[] = localDebts(
    localExpenses.map((e) => ({ amount: e.amount, currency: e.currency, paidBy: e.paidBy, among: e.splitAmong })),
    memberIds,
  );

  return {
    trip: trip.data ?? null,
    preferences: (preferences.data?.data ?? {}) as Record<string, unknown>,
    itinerary: items,
    lockedTitles: items.filter((item) => item.locked).map((item) => item.title),
    lockedPlaces: [
      ...stayAnchor,
      ...items
        .filter((item) => item.locked && item.latitude !== undefined && item.longitude !== undefined)
        .map((item) => ({ title: item.title, latitude: item.latitude as number, longitude: item.longitude as number })),
    ],
    lockedStay,
    accommodationAnchor: stayAnchor[0] ?? null,
    places: (places.data ?? []).map((item) => {
      const place = Array.isArray(item.places) ? item.places[0] : item.places;
      return { status: item.status, place: place ? { name: place.name, category: place.category, address: place.address } : null };
    }),
    decisions: decisionRows,
    reservations: bookings,
    committed,
    localExpenses,
    localBalances,
  };
}

/** JSON for the system prompt, trimmed progressively so a large trip cannot blow the context budget. */
export function serializeTripContext(context: TripContext): string {
  const full = JSON.stringify(context);
  if (full.length <= MAX_CONTEXT_CHARS) return full;
  const reduced = JSON.stringify({
    ...context,
    itinerary: context.itinerary.slice(0, 20),
    places: context.places.slice(0, 20),
    decisions: context.decisions.slice(0, 15),
    reservations: context.reservations?.slice(0, 30),
    localExpenses: context.localExpenses?.slice(0, 15),
  });
  if (reduced.length <= MAX_CONTEXT_CHARS) return reduced;
  const compactPreferences = Object.fromEntries(
    Object.entries(context.preferences).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 40),
  );
  return JSON.stringify({
    trip: context.trip
      ? { name: context.trip.name, destination: context.trip.destination, start_date: context.trip.start_date, end_date: context.trip.end_date }
      : null,
    preferences: compactPreferences,
    itinerary: [],
    lockedTitles: context.lockedTitles,
    places: [],
    decisions: context.decisions.slice(0, 10),
    reservations: context.reservations?.slice(0, 15),
  });
}

/** A preferences field, coerced to a clean string list — array or comma-separated string,
 *  trimmed, blanks dropped. Shared (Phase 1.4, docs/overhaul/roadmap/phase-1-structural-refactor.md)
 *  with compare-chat, which had drifted to its own array-only, untrimmed local copy. */
export const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map((entry) => String(entry).trim())
    .filter(Boolean);

/** Human-readable one-liner of what the trip contains so far, for the system prompt and the resolver. */
/** "Members on this trip": the people with access, by display name, so Roam can answer who is travelling.
 *  Names are member-written (profile names), so each is flattened and clamped before it reaches a prompt. */
export function describeMembers(identities: Iterable<[string, { name: string }]>, askerId?: string): string {
  const names = [...identities].slice(0, 12).map(([id, who]) => {
    const name = who.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Someone";
    return id === askerId ? `${name} (you)` : name;
  });
  return names.length ? `members on this trip (the people with access, from their profiles): ${names.join(", ")}.` : "";
}

/** Shared local expenses and who-owes-whom, resolved to names via the same identities map
 *  `describeMembers` uses — kept out of `formatTripMemory` because, unlike everything else
 *  there, it needs names, and this file has no admin client of its own to resolve them with.
 *  The split math is already done server-side (lib/expense-split.ts); the model must quote
 *  these figures exactly — the same discipline `committedLine` already holds bookings to, now
 *  extended to money owed between real people, where an LLM re-summing or converting a balance
 *  itself is a real correctness risk, not just an untidy answer. */
export function formatExpenses(expenses: LocalExpenseContext[] | undefined, balances: LocalBalanceContext[] | undefined, identities: Iterable<[string, { name: string }]>, askerId?: string): string {
  if (!expenses?.length) return "";
  const nameOf = new Map([...identities].map(([id, who]) => [id, id === askerId ? "you" : who.name]));
  const who = (id: string | null) => (id ? (nameOf.get(id) ?? "someone") : "someone");
  // {exact: true} here, unlike committedLine's rounded ballpark totals: a balance is a specific
  // amount one person is about to pay another, so the cents stay — rounding "owes $20.33" down
  // to "$20" would make the quoted figure wrong, not just imprecise.
  const items = expenses.slice(0, 30).map((e) => `${e.description}: ${formatMoney(e.amount, e.currency, { exact: true })} (paid by ${who(e.paidBy)}${e.splitAmong ? `, split ${e.splitAmong.length} ways` : ""})`);
  const owed = (balances ?? []).map((b) => `${who(b.fromUserId)} owes ${who(b.toUserId)} ${formatMoney(b.amount, b.currency, { exact: true })}`);
  return `Shared expenses logged in this app (these are all of them — never invent or guess one): ${items.join("; ")}.${owed.length ? ` Open balances — quote these exactly, never add, subtract or convert them yourself: ${owed.join("; ")}.` : " Everyone is settled up."}`;
}

const reservationDates = (r: ContextReservation): string => (r.startsOn ? (r.endsOn && r.endsOn !== r.startsOn ? `${r.startsOn} to ${r.endsOn}` : r.startsOn) : "date not set");
const reservationPrice = (r: ContextReservation): string => (r.amount != null && r.currency ? `${r.amount} ${r.currency}${r.amountBasis === "per_person" ? " per person" : " total"}` : "");

/** One line per booking: "flight: JFK to FCO (JFK → FCO), 2027-06-08 19:40, 2980 USD total". */
/** The bookings' money, worked out here so the assistant quotes it and never adds up currencies itself. */
export function committedLine(c: CommittedTotals): string {
  const priced = c.lines.map((l) => `${formatMoney(l.total, l.currency)} (${l.count} ${l.count === 1 ? "booking" : "bookings"})`).join(", ");
  const unconverted = c.unconverted.length ? ` No rate is listed for ${c.unconverted.map((u) => formatMoney(u.total, u.currency)).join(", ")}, so that is not in the total.` : "";
  return `Money already committed in bookings (flights included, cancelled ones left out, per-person prices multiplied by the people they cover): ${formatMoney(c.convertedTotal, c.currency)} for the whole group${c.perPerson != null ? `, ${formatMoney(c.perPerson, c.currency)} per person` : ""}, converted to ${c.currency} at today's bank reference rate. As priced: ${priced}.${unconverted} Quote these totals as they are; do not add up or convert amounts yourself.`;
}

function describeReservation(r: ContextReservation): string {
  const route = r.place && r.toPlace ? `${r.place} → ${r.toPlace}` : r.place ?? "";
  const time = r.startTime ? ` ${r.startTime}${r.endTime ? `–${r.endTime}` : ""}` : "";
  return `${r.kind}: ${r.title}${route ? ` (${route})` : ""}, ${reservationDates(r)}${time}${reservationPrice(r) ? `, ${reservationPrice(r)}` : ""}`;
}

/** What is already booked, as prompt lines. Empty when nothing was entered. */
function formatBookings(reservations: ContextReservation[] | undefined, startDate?: string | null, endDate?: string | null, committed?: CommittedTotals | null): string[] {
  const live = (reservations ?? []).filter((r) => !r.cancelled);
  const cancelled = (reservations ?? []).filter((r) => r.cancelled);
  const lines: string[] = [];
  if (live.length) lines.push(`Already booked and paid by the group (entered by hand; these are fixed — never suggest booking them again, never plan another visit to the same attraction or a second way to make a booked journey, and plan around the times): ${live.map(describeReservation).join("; ")}.`);
  if (committed && committed.lines.length) lines.push(committedLine(committed));
  if (cancelled.length) lines.push(`Cancelled bookings (no longer happening): ${cancelled.map((r) => `${r.title} (${reservationDates(r)})`).join("; ")}.`);
  if (reservations?.length) {
    const asRows = (reservations ?? []).map((r) => ({ kind: r.kind as "stay", startsOn: r.startsOn, endsOn: r.endsOn, status: r.cancelled ? ("cancelled" as const) : ("confirmed" as const) }));
    const gaps = lodgingGaps(asRows, startDate, endDate);
    if (gaps.length) lines.push(`Nights with no stay booked yet: ${gaps.map((g) => `${g.from} to ${g.to} (${g.nights} ${g.nights === 1 ? "night" : "nights"})`).join("; ")}.`);
    const stray = outsideTripDates(asRows, startDate, endDate);
    if (stray.length) lines.push(`${stray.length} booking${stray.length === 1 ? " is" : "s are"} dated outside the trip's current dates (${startDate} to ${endDate}); mention it if relevant.`);
  }
  return lines;
}

export function formatTripMemory(
  context: Pick<TripContext, "preferences" | "itinerary" | "places" | "decisions" | "lockedTitles"> & { trip?: TripContext["trip"]; reservations?: ContextReservation[]; committed?: TripContext["committed"] },
): string {
  const preferences = context.preferences ?? {};
  const likes = Array.from(new Set([...asList(preferences.interests), ...asList(preferences.likes)]));
  const dislikes = asList(preferences.dislikes);
  const dietary = asList(preferences.dietaryNeeds);
  const route = context.trip ? effectiveStops(context.trip) : null;
  const profile = [
    context.trip ? `trip: ${context.trip.name}; destination: ${context.trip.destination || "undecided"}; origin: ${context.trip.origin || "undecided"}` : null,
    route ? describeStops(route.stops, route.estimated) || null : null,
    context.trip?.duration_days != null ? `duration: ${context.trip.duration_days} days` : null,
    context.trip?.travelers != null ? `travellers: ${context.trip.travelers}` : null,
    context.trip ? `dates: ${context.trip.start_date || "undecided"}${context.trip.end_date ? ` to ${context.trip.end_date}` : ""}` : null,
    typeof preferences.currency === "string" ? `currency: ${preferences.currency}` : null,
    typeof preferences.language === "string" && preferences.language ? `preferred language: ${preferences.language}` : null,
    typeof preferences.country === "string" && preferences.country ? `home country: ${preferences.country}` : null,
    usesMiles(preferences.country) ? "distances in miles" : null,
    typeof preferences.groupType === "string" && preferences.groupType ? `group: ${preferences.groupType}` : null,
    preferences.budget !== undefined && preferences.budget !== "" ? `budget: ${preferences.budget}${typeof preferences.budget === "number" ? ` ${resolveCurrency(preferences)} per person per day` : ""}` : null,
    typeof preferences.pace === "string" && preferences.pace ? `pace: ${preferences.pace}` : null,
    likes.length ? `likes: ${likes.join(", ")}` : null,
    dislikes.length ? `dislikes: ${dislikes.join(", ")}` : null,
    dietary.length ? `dietary: ${dietary.join(", ")}` : null,
  ].filter(Boolean);

  const itinerary = context.itinerary
    // day_index is 1-based everywhere it's written (add_itinerary_item, placement, the itinerary route).
    .map((item) => (item.title ? `${item.title}${typeof item.day_index === "number" ? ` (day ${item.day_index})` : ""}${item.locked ? " [locked]" : ""}` : ""))
    .filter(Boolean);
  const savedPlaces = context.places
    .map((item) => (item.place?.name ? `${item.place.name} [${item.status ?? "saved"}]` : ""))
    .filter(Boolean);
  const stay = readStayDecision(context.decisions);
  const decisions = context.decisions
    .filter((item) => !["stay", "review_notified", "review_dismissed"].includes(item.kind))
    .map((item) => (item.kind ? `${item.kind}: ${(typeof item.value === "string" ? item.value : JSON.stringify(item.value)).slice(0, 300)}` : ""))
    .filter(Boolean);

  const bookedStays = (context.reservations ?? []).filter((r) => r.kind === "stay" && !r.cancelled);
  return [
    profile.length ? `Profile — ${profile.join("; ")}.` : "Profile: not filled in yet.",
    stay
      ? `Stay: ${stay.hotelName}, ${stay.roomName}, ${stay.checkin}→${stay.checkout}, ${stay.totalAmount} ${stay.currency}.`
      : bookedStays.length
        ? `Stays: already booked — ${bookedStays.map((r) => `${r.title} (${reservationDates(r)})`).join("; ")}.`
        : "Stay: not locked yet.",
    ...formatBookings(context.reservations, context.trip?.start_date, context.trip?.end_date, context.committed),
    itinerary.length ? `Itinerary: ${itinerary.join(", ")}.` : "Itinerary: nothing added yet.",
    savedPlaces.length ? `Saved places: ${savedPlaces.join(", ")}.` : "Saved places: none yet.",
    decisions.length ? `Decisions: ${decisions.join("; ")}.` : "Decisions: none recorded yet.",
    // Every field above is member-writable and is interpolated into every model call of every member's turn:
    // bound the whole block so one oversized row can degrade a turn but never inflate it.
  ].join(" ").slice(0, 9_000);
}
