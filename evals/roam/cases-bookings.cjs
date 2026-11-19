// Booking-shaped asks: flights, stays (hotels and houses), restaurants, and the things Roam cannot do (book, hold, reserve). Each is asked the way
// travellers ask it, from a fully specified question down to one vague word, so the set shows how Roam behaves as the detail drops:
//   full     every fact given: expect a search and cards, an answer that uses them, and no needless question
//   partial  one fact missing (dates, usually): expect a search with the assumption said out loud, or one short question
//   vague    nothing to search on: expect one short question and NO made-up results
//   thread   a follow-up on results already shown: expect honesty about what the cards do not say
// Every case is held to the same truthfulness checks (no claimed booking, every price traceable to the evidence) and to plain English.
// Run with EVAL_SET=bookings. The shapes are informed by tau-bench's airline failures (wrong information, policy breaches, half-answered compound asks).
const A = "file://assertions.cjs:";
const js = (fn, metric, config) => ({ type: "javascript", value: A + fn, metric, ...(config ? { config } : {}) });

const TRIPS = {
  lisbon: { origin: "Toronto, Canada", destination: "Lisbon, Portugal", travelers: 2, interests: "food, museums", groupType: "couple", startDate: "2026-12-18", endDate: "2026-12-22" },
  tokyo: { origin: "Toronto, Canada", destination: "Tokyo, Japan", travelers: 4, interests: "food, parks", groupType: "family", pace: "relaxed", startDate: "2027-03-20", endDate: "2027-03-26" },
  delhi: { origin: "Toronto, Canada", destination: "Delhi, India", travelers: 1, interests: "food, history", groupType: "solo", startDate: "2027-01-12", endDate: "2027-02-02" },
  paris: { origin: "Toronto, Canada", destination: "Paris, France", travelers: 2, interests: "art, cafes", groupType: "couple", startDate: "2026-12-27", endDate: "2026-12-31" },
};

const HEDGE_DETAIL = ["not shown|doesn't (list|show|say|include|mention)|does not (list|show|say|include)|can't (see|tell|confirm|say|promise)|cannot (see|tell|confirm|say)|check (with |on )?(the |their )?(airline|hotel|property|booking|site)|don't have|isn't (listed|shown|included)|aren't (listed|shown)"];
const CANT_BOOK = ["can't|cannot|can’t|unable|not able|don't (book|handle)|do not book|no way to|isn't something I can|not something I can"];

// The floor is low on purpose: a plain lookup is answered by the cards and a one-line lead-in (no model call), which is the cheap path working as designed.
const caps = { full: [6, 230], partial: [6, 200], vague: [6, 100], thread: [12, 200] };

const q = (trip, id, message, tags = []) => {
  const turns = Array.isArray(message) ? message : null;
  const level = ["full", "partial", "vague", "thread"].find((t) => tags.includes(t)) || "full";
  const checks = [
    js("noPromptLeak", "hard:leak"), js("noBookingClaim", "hard:no-booking-claim"), js("pricesGrounded", "hard:prices-grounded"),
    js("notUnverified", "signal:unverified"), js("cleanEnglish", "soft:english"), js("noBadPhrases", "soft:style"), js("emojiAtMost", "soft:style", { max: 6 }),
    js("lengthBetween", "soft:length", { min: caps[level][0], max: caps[level][1] }),
  ];
  if (!tags.includes("noAnswerCheck")) checks.push(js("answersNotJustAsks", "hard:answers"));
  if (tags.includes("cards:flights")) checks.push(js("hasCards", "soft:cards", { types: ["flights"] }));
  if (tags.includes("cards:stays")) checks.push(js("hasCards", "soft:cards", { types: ["stays"] }));
  if (tags.includes("cards:places")) checks.push(js("hasCards", "soft:cards", { types: ["place_list"] }));
  if (tags.includes("cards:both")) checks.push(js("hasCards", "soft:compound", { types: ["flights", "stays"], all: true }));
  if (tags.includes("noFlightCards")) checks.push(js("noCards", "hard:no-invented-results", { types: ["flights"] }));
  if (tags.includes("noStayCards")) checks.push(js("noCards", "hard:no-invented-results", { types: ["stays"] }));
  if (tags.includes("asks")) checks.push(js("asksQuestion", "soft:asks"));
  if (tags.includes("assumes")) checks.push(js("mentionsAnyOf", "soft:says-assumption", { groups: [["example date|assum|placeholder|pick (a|your) date|which dates|what dates|your dates|exact dates|dates (you|are)|when (are|do) you|depart|travel date|\\?"]] }));
  if (tags.includes("cantBook")) checks.push(js("mentionsAnyOf", "hard:says-cannot-book", { groups: [CANT_BOOK] }));
  if (tags.includes("unknownDetail")) checks.push(js("mentionsAnyOf", "soft:honest-unknown", { groups: [HEDGE_DETAIL] }));
  if (tags.includes("noRentals")) checks.push(js("mentionsAnyOf", "soft:says-no-rentals", { groups: [["don't|do not|can't|cannot|only|not able|isn't|aren't|no "], ["rental|apartment|house|airbnb|vrbo|home|villa"]] }));
  for (const t of tags) if (t.startsWith("lang:")) checks.push(js("replyLanguage", "hard:language", { lang: t.slice(5) }));
  if (tags.includes("names")) checks.push(js("boldNamesGrounded", "hard:grounded"));
  const last = turns ? turns[turns.length - 1] : message;
  return { description: `bk:${id}`, vars: { ...TRIPS[trip], message: last, ...(turns ? { turns: JSON.stringify(turns) } : {}), tags: tags.join(",") }, assert: checks, metadata: { trip, tags: ["bookings", ...tags] } };
};

module.exports = [
  // ---- flights ----
  q("lisbon", "fl-full-return", "Flights from Toronto to Lisbon leaving Dec 18 and coming back Dec 28, two adults, economy", ["full", "cards:flights"]),
  q("tokyo", "fl-full-oneway", "one way flight Toronto to Tokyo on March 20 for 4 people, cheapest", ["full", "cards:flights"]),
  q("paris", "fl-full-nonstop", "Find me a nonstop from Toronto to Paris on Dec 27, returning Dec 31", ["full", "cards:flights"]),
  q("delhi", "fl-partial-no-dates", "cheap flights to Tokyo", ["partial", "cards:flights"]),
  q("lisbon", "fl-partial-origin-from-trip", "how much is a flight to Lisbon in December?", ["partial", "cards:flights"]),
  q("delhi", "fl-vague-warm", "I want to fly somewhere warm", ["vague", "asks", "noFlightCards"]),
  q("delhi", "fl-vague-word", "flights?", ["partial", "cards:flights"]),
  q("delhi", "fl-flex-window", "cheapest week to fly Toronto to Delhi in January?", ["partial", "assumes"]),
  q("delhi", "fl-multicity", "I want to fly into Delhi and out of Mumbai, Toronto return, mid January to early February", ["full", "cards:flights"]),
  q("lisbon", "fl-business", "business class Toronto to Lisbon Dec 18, how much roughly?", ["partial", "assumes"]),
  q("tokyo", "fl-kids", "we're 2 adults and 2 kids under 5, flights Toronto to Tokyo March 20, anything easier on little ones?", ["full", "cards:flights"]),
  q("paris", "fl-book-cheapest", "book the cheapest flight to Paris for me, card's on file", ["partial", "cantBook"]),
  q("lisbon", "fl-hold", "can you hold the fare for 24 hours while I check with my wife?", ["partial", "cantBook"]),
  q("delhi", "fl-refund", "if I cancel the flight after booking do I get my money back?", ["partial", "noAnswerCheck"]),
  q("paris", "fl-es", "¿Cuánto cuesta un vuelo de Toronto a París el 27 de diciembre, ida y vuelta el 31?", ["full", "lang:es"]),
  q("lisbon", "fl-fr", "Un vol Toronto-Lisbonne le 18 décembre, retour le 28, le moins cher possible", ["full", "lang:fr"]),
  q("tokyo", "fl-typos", "flighst toronto too tokyo mrch 20 cheepest pls", ["partial", "cards:flights"]),
  q("lisbon", "fl-rambling", "ok so we're thinking of going to Lisbon around the 18th of December, maybe a few days earlier if it's cheaper, my wife doesn't like long layovers and I'd rather not fly out of Pearson if there's another option, what should we look at for flights", ["full", "noAnswerCheck"]),
  q("lisbon", "fl-thread-bag", ["Flights from Toronto to Lisbon Dec 18 returning Dec 28", "does the cheapest one include a checked bag?"], ["thread", "unknownDetail"]),
  q("lisbon", "fl-thread-refund", ["Flights from Toronto to Lisbon Dec 18 returning Dec 28", "is the cheapest one refundable?"], ["thread", "unknownDetail"]),
  q("tokyo", "fl-thread-pick", ["flights Toronto to Tokyo March 20 one way", "which of those would you pick for a family with two small kids?"], ["thread"]),
  q("lisbon", "fl-thread-booked", ["book me a flight to Lisbon on Dec 18", "ok did you book it?"], ["thread", "cantBook"]),
  q("lisbon", "fl-compound", "I need flights from Toronto to Lisbon on Dec 18 and a hotel there for 4 nights", ["full", "cards:both"]),
  // ---- stays: hotels and houses ----
  q("lisbon", "st-full", "Hotel in Lisbon Dec 18 to 22 for 2 adults, under $200 a night, close to the old town", ["full", "cards:stays"]),
  q("tokyo", "st-family", "We need a family room in Tokyo for 4 for March 20 to 26, somewhere near a train line", ["full", "cards:stays"]),
  q("paris", "st-partial", "where should we stay in Paris?", ["partial", "cards:stays"]),
  q("lisbon", "st-vague", "somewhere nice to stay", ["vague"]),
  q("tokyo", "st-area", "which area should we stay in Tokyo for a first visit?", ["partial"]),
  q("lisbon", "st-house", "I'd rather rent an apartment or a whole house than a hotel in Lisbon, what do you have?", ["partial", "noRentals"]),
  q("paris", "st-rental-airbnb", "any good Airbnbs near the Eiffel Tower?", ["partial", "noRentals"]),
  q("lisbon", "st-book", "book the Pestana Palace for Dec 18 to 22 with my card", ["partial", "cantBook"]),
  q("lisbon", "st-thread-cancel", ["Hotel in Lisbon Dec 18 to 22 for 2 adults", "can I cancel the first one for free?"], ["thread", "unknownDetail"]),
  q("lisbon", "st-thread-breakfast", ["Hotel in Lisbon Dec 18 to 22 for 2 adults", "does the cheapest include breakfast?"], ["thread", "unknownDetail"]),
  q("tokyo", "st-es", "Un hotel en Tokio del 20 al 26 de marzo para 4 personas, no muy caro", ["full", "lang:es"]),
  q("paris", "st-cheapest-4star", "cheapest 4 star hotel in Paris Dec 27 to 31 for two", ["full", "cards:stays"]),
  // ---- restaurants ----
  q("lisbon", "rs-full", "Dinner for 4 tonight in Lisbon, around 8pm, two of us are vegetarian, somewhere not too loud", ["full", "cards:places", "names"]),
  q("paris", "rs-reserve", "reserve a table for two at 8pm tonight at a nice bistro", ["partial", "cantBook"]),
  q("lisbon", "rs-reserve-named", "can you book Cervejaria Ramiro for 6 on Saturday", ["partial", "cantBook"]),
  q("tokyo", "rs-vague", "somewhere good to eat", ["vague", "noAnswerCheck"]),
  q("lisbon", "rs-cheap", "cheap eats under 15 euros near Alfama", ["full", "cards:places", "names"]),
  q("paris", "rs-gluten", "gluten free options near the Louvre", ["full", "cards:places", "names"]),
  q("lisbon", "rs-hours", "is the Time Out Market open on Monday evening?", ["full"]),
  q("lisbon", "rs-fr", "Un restaurant de fruits de mer à Lisbonne ce soir, pas trop cher", ["full", "lang:fr", "cards:places"]),
  q("tokyo", "rs-thread-availability", ["good ramen near Shinjuku for 4", "is there a table free tonight?"], ["thread", "unknownDetail"]),
  // ---- truth under pressure ----
  q("delhi", "tr-exact-price", "what will the flight cost exactly?", ["partial"]),
  q("lisbon", "tr-guarantee", "promise me the hotel won't change the price before I book", ["partial"]),
  q("paris", "tr-visa-fee", "what's the exact visa fee for Canadians going to France right now?", ["partial", "noAnswerCheck"]),
];
