// Decision questions: not "does it sound right" but "did it say the thing that decides the answer". Built from what travellers
// keep asking on r/flights, r/travel and r/solotravel and from airline / hotel guidance (sources in docs/design/roam-knowledge-research.md).
// Each question lists the points a good reply must touch (any one phrase per group). Roam cannot book yet, so booking asks must
// say so plainly. Run with EVAL_SET=decisions. All checks are soft: the phrases are a first pass, check failures by reading the reply.
const A = "file://assertions.cjs:";
const js = (fn, metric, config) => ({ type: "javascript", value: A + fn, metric, ...(config ? { config } : {}) });
const TRIP = { destination: "Delhi, India", travelers: 1, interests: "food, history", groupType: "solo", startDate: "2027-01-12", endDate: "2027-02-02" };

const q = (id, message, groups, tags = []) => ({
  description: `dec:${id}`,
  vars: { ...TRIP, message, tags: ["answer", ...tags].join(",") },
  assert: [
    js("noPromptLeak", "hard:leak"), js("notUnverified", "signal:unverified"),
    js("lengthBetween", "soft:length", { min: 25, max: 260 }),
    js("answersNotJustAsks", "hard:answers"),
    js("mentionsAnyOf", "soft:reasoning", { groups }),
  ],
  metadata: { trip: "delhi", tags: ["decision", ...tags] },
});

module.exports = [
  // Flights
  q("layover-worth", "there's a flight with a 9 hour layover that's $240 cheaper, is it worth it?", [["layover|stopover|connection"], ["hours|time|tired|overnight|airport"], ["\\$240|save|saving|cheaper|difference"]]),
  q("self-transfer", "kiwi shows a cheaper itinerary with two separate tickets and a 2 hour connection in Frankfurt, should I take it?", [["separate tickets?|self[- ]transfer|self[- ]connect"], ["miss|missed|no[- ]show|not protected|won't (rebook|protect)|not responsible"], ["buffer|longer layover|3|4 hours|overnight|one ticket|single ticket"]]),
  q("checked-bag", "if I book two separate tickets do I have to pick up my bags in between?", [["bag|luggage"], ["re-?check|collect|pick up|claim|separate"]]),
  q("dec-vs-jan", "is it cheaper to fly to Delhi in December or January?", [["december"], ["january"], ["peak|holiday|christmas|new year|diwali|expensive|higher"]], ["fact"]),
  q("flex-dates", "I can leave any time in the next 3 months, how do I find the cheapest week to fly Toronto to Delhi?", [["flexible|flex|date grid|calendar|price graph|explore"], ["tuesday|wednesday|midweek|weekday|off-?peak|shoulder"]]),
  q("book-when", "when should I book flights to India, 2 months out or 6 months?", [["weeks|months"], ["no (single|magic|guarantee)|varies|depends|can't (promise|guarantee)|rough"]]),
  q("open-jaw", "can I fly into Delhi and home from Mumbai without paying double?", [["open[- ]jaw|multi[- ]city"], ["one[- ]way|train|internal|domestic"]]),
  q("nonstop-vs-stop", "air canada nonstop is $1,900, a one-stop on emirates is $1,300. which one?", [["nonstop|direct|non-stop"], ["hours|time|duration"], ["\\$600|difference|save|saving|cheaper"]]),
  q("price-drop", "should I wait for the price to drop before booking?", [["can't (predict|promise|guarantee)|no guarantee|nobody can|hard to predict|not certain"], ["alert|track|watch|refund|cancel|24[- ]hour|flexible"]]),
  q("cheapest-risk", "is the absolute cheapest fare always the best deal?", [["bag|baggage|seat|change|refund|fee"], ["layover|connection|time|total cost"]]),
  q("visa-transit", "my layover is in Doha for 7 hours, do I need a visa to leave the airport?", [["depends|passport|nationality|check"], ["official|embassy|airline|government|before you (fly|book|go)|verify"]]),
  // Hotels and stays
  q("refundable", "refundable room is $40 more per night, take it or no?", [["refund|cancel|flexib"], ["plans|certain|sure|dates|firm|deadline|insurance"]]),
  q("cancel-deadline", "what time does free cancellation actually end?", [["local time|time zone|hotel's"], ["policy|confirmation|deadline|check"]], ["fact"]),
  q("resort-fee", "the hotel shows $120 a night, will that be the total price?", [["tax|taxes|fee|fees|resort|city"], ["total|final|checkout|before you (pay|book)|at checkout"]]),
  q("area-choice", "should I stay near the airport or in the city for a 1 night layover in Delhi?", [["airport"], ["city|traffic|travel time|hour|metro|taxi"]]),
  q("first-night", "I land in Delhi at 2am, should I pre-book the hotel?", [["2 ?am|late|night|arrive|arrival"], ["book|reserve|first night|pickup|transfer|taxi|prepaid"]]),
  // Booking behaviour (Roam cannot book yet)
  q("book-now", "ok book the cheapest one for me, my card is on file", [["can't|cannot|not able|unable|don't (book|have)|link|on the airline|provider|booking site"]], ["booking"]),
  q("hold-price", "can you hold this fare for 24 hours?", [["can't|cannot|not able|airline|provider|24[- ]hour|rules|policy"]], ["booking"]),
  q("no-invent", "how much will the flight cost exactly?", [["can't (say|promise|guarantee)|estimate|varies|changes|depends|live|check|about|around"]], ["booking"]),
  // Trip judgement
  q("solo-safety", "is Delhi safe for a solo traveller at night?", [["night|after dark|late"], ["taxi|ride|uber|ola|prepaid|licensed|avoid|well[- ]lit|stay (in|near)|share"], ["advisory|check|official|local"]]),
  q("budget-day", "how much should I budget per day in Delhi excluding flights and hotel?", [["per day|a day|daily"], ["varies|depends|rough|about|around|estimate"]]),
  q("tipping", "do I tip in Delhi restaurants?", [["service charge|included"], ["10|%|round up|small"]], ["fact"]),
  q("water", "can I drink the tap water in Delhi?", [["no|not|avoid|don't"], ["bottled|sealed|filtered|boiled|ice"]], ["fact"]),
  q("jetlag", "I'm flying Toronto to Delhi, how do I handle the jet lag?", [["hours|time zone|10|9\\.5|difference"], ["sleep|light|hydrate|adjust|schedule|nap"]]),
  q("best-months", "best month to visit Delhi?", [["october|november|february|march"], ["summer|hot|monsoon|winter|smog|pollution|cold"]], ["fact"]),
  q("insurance", "do I really need travel insurance for a 3 week trip?", [["medical|cancel|delay|baggage|cover"], ["depends|check|card|policy|existing"]]),
  q("sim", "what's the easiest way to get data in India as a tourist?", [["esim|sim"], ["airport|airtel|jio|passport|id|verification|roaming"]], ["fact"]),
  q("scam", "what are the common tourist scams in Delhi?", [["taxi|rickshaw|meter|tout|closed|gem|shop|commission|station"], ["avoid|politely|prepaid|app|official|ignore|decline"]]),
  q("compare-cities", "Delhi or Jaipur for a first week in India?", [["delhi"], ["jaipur"], ["pace|crowds|time|train|distance|days"]]),
  q("train-vs-fly", "Delhi to Agra, train or taxi?", [["train|taxi|car"], ["hours|time|gatimaan|early|book|price|cost"]]),
  q("itinerary-pace", "I have 3 weeks in India, is Delhi, Agra, Jaipur, Varanasi, Kerala too much?", [["too much|a lot|ambitious|tight|rushed|slow|pace"], ["train|fly|flight|travel days|distance|cut|drop|skip"]]),
  q("honest-limit", "what's the exact visa fee for a Canadian going to India right now?", [["check|official|government|embassy|e-?visa|can't confirm|verify|changes"]], ["booking"]),
  q("group-split", "four of us, two want beach and two want mountains, how do we plan this?", [["split|both|compromise|middle|vote|options|days|base"]]),
];
