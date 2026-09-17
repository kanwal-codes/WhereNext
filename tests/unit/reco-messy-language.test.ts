import { describe, expect, it } from "vitest";
import { classifyEventVibe, classifyPlaceVibe, lanesFor, type Vibe } from "@/packages/reco/vibes";

const VIBES = new Set<Vibe>([
  "green_space", "live_music", "nightlife", "sacred", "expo",
  "performing_arts", "museum_culture", "beach_water", "sports", "food_scene", "default",
]);

const vibeOf = (name: string, primaryType = "point_of_interest") => {
  const r = classifyPlaceVibe({ primaryType, name });
  expect(VIBES.has(r.vibe), `"${name}" gave a bad vibe: ${r.vibe}`).toBe(true);
  return r.vibe;
};

/**
 * Names that are messy but still carry a keyword the scanner can lock onto — the sync path
 * MUST classify these correctly (this is how dirty Google data actually looks).
 */
const MUST_HIT: Array<[string, Vibe]> = [
  // case chaos
  ["GOLDEN GATE PARK", "green_space"],
  ["sYdNeY oPeRa HoUsE", "performing_arts"],
  ["tHe LoUvRe MuSeUm", "museum_culture"],
  ["bOtAnIcAl GaRdEnS", "green_space"],
  // punctuation / separator soup
  ["museum,art,gallery,exhibition", "museum_culture"],
  ["MUSEUM!!!", "museum_culture"],
  ["...botanical garden...", "green_space"],
  ["museum/gallery/art-space", "museum_culture"],
  ["(the) beach [resort] {north}", "beach_water"],
  ["temple---of---heaven", "sacred"],
  ["night   club   downtown", "nightlife"],
  ["b.e.a.c.h is not a match but beach-front is", "beach_water"],
  // fragments / one word
  ["Museum", "museum_culture"],
  ["Garden", "green_space"],
  ["beach", "beach_water"],
  ["temple", "sacred"],
  ["concert", "live_music"],
  ["stadium", "sports"],
  ["nightclub", "nightlife"],
  // mild typos where the keyword survives intact
  ["botanical gardn", "green_space"],
  ["NYC Botanicl Grdn", "green_space"],
  ["histori site & musuem — the museum part still hits", "museum_culture"],
  // run-on, no punctuation, lower-case, how people actually type
  ["so basically its a garden but also kinda a park with a cafe and sometimes concerts happen there", "green_space"],
  ["that big church downtown that everyone keeps talking about idk the name", "sacred"],
  ["its the stadium where the team plays i think", "sports"],
  ["some art gallery my friend said was cool", "museum_culture"],
  // emoji wrapping a real keyword
  ["⛪ St Marks Basilica ⛪", "sacred"],
  ["the 🏟️ big stadium on the hill", "sports"],
  ["🎭 old theatre 🎭", "performing_arts"],
  ["🍺 the corner pub 🍺", "nightlife"],
  // gibberish padding around a keyword
  ["asdf museum jkl qwerty", "museum_culture"],
  ["zzz temple zzz", "sacred"],
  ["xkcd botanical garden lorem ipsum", "green_space"],
  // contradiction inside the mess → deterministic first match, still a valid answer
  ["NIGHT GARDEN museum BEACH club", "green_space"],
  ["the museum nightclub bar and grill", "nightlife"],
  ["whitespace\ttab\tmuseum\tgallery", "museum_culture"],
  ["  leading and trailing spaces around a garden   ", "green_space"],
];

/**
 * Names too mangled / foreign / abbreviated for the keyword scanner — it MUST NOT throw,
 * MUST NOT guess wrong, and MUST return "default" so the embedding classifier takes over.
 */
const GRACEFUL_DEFAULT: string[] = [
  // heavy typos that destroy the keyword
  "musuem of modrn art", "cathederal", "resturant", "nite club", "the tem ple", "St Pauls Cathdrl", "libary",
  // abbreviations / codes / numbers-as-names
  "MoMA", "Club 33", "Stage 48", "Studio 54", "Gate C7", "Hall 3B",
  // foreign / transliterated (no English keyword present)
  "Templo Mayor", "Jardín des Plantes", "Kirche St Peter", "Museo del Prado", "Playa del Carmen",
  "Stade de France", "Wat Arun", "Ryōan-ji", "Друзья кафе",
  // emoji-only or keyword hidden behind emoji-only meaning
  "🏖️🏖️🏖️", "🕌", "🎪🎪🎪", "Bar 🍸", "🏛️ The Louvre 🖼️",
  // characters spread out / zero-width / invisible
  "g a r d e n", "m​u​s​e​u​m", "M​U​S​E​U​M",
  // pure symbols / numbers / empty-ish
  "!@#$%^&*()", "1234567890", "———", "   ", "", "\n\n\t",
  // vague natural language with no concrete keyword
  "a quiet place to pray and reflect", "somewhere fun for the evening", "a nice spot to relax outdoors",
  "the place we went last time", "you know the one",
  // grammar-free word salad, no keyword
  "big place много people loud music dark",
];

describe("classifyPlaceVibe — messy real-world names that MUST still classify", () => {
  for (const [name, want] of MUST_HIT) {
    it(`${JSON.stringify(name).slice(0, 56)} → ${want}`, () => {
      expect(vibeOf(name)).toBe(want);
    });
  }
});

describe("classifyPlaceVibe — mangled names degrade to 'default' (never throw, never wrong)", () => {
  for (const name of GRACEFUL_DEFAULT) {
    it(`${JSON.stringify(name).slice(0, 56)} → default`, () => {
      expect(vibeOf(name)).toBe("default");
    });
  }
});

describe("classifyPlaceVibe — the authoritative Google type rescues a mangled name", () => {
  // Even if the name is unreadable, a real primaryType still classifies it.
  const CASES: Array<[string, string, Vibe]> = [
    ["Museo del Prado", "museum", "museum_culture"],
    ["Templo Mayor", "hindu_temple", "sacred"],
    ["Jardín des Plantes", "botanical_garden", "green_space"],
    ["Playa del Carmen", "beach", "beach_water"],
    ["Stade de France", "stadium", "sports"],
    ["🏖️🏖️🏖️", "beach", "beach_water"],
    ["", "night_club", "nightlife"],
    ["   ", "art_gallery", "museum_culture"],
    ["!@#$%", "restaurant", "food_scene"],
  ];
  for (const [name, type, want] of CASES) {
    it(`type "${type}" beats name ${JSON.stringify(name).slice(0, 24)} → ${want}`, () => {
      expect(vibeOf(name, type)).toBe(want);
    });
  }
});

describe("classifyEventVibe — messy / natural-language event titles", () => {
  const CASES: Array<[Parameters<typeof classifyEventVibe>[0], Vibe]> = [
    [{ title: "biggg concert this weekend dont miss it!!!" }, "live_music"],
    [{ title: "stand up comedy nite" }, "performing_arts"],   // "comedy" survives the "nite" typo
    [{ title: "COMEDY NIGHT @ THE club" }, "performing_arts"], // "comedy" survives
    [{ title: "some kinda art exhibit thing" }, "museum_culture"],
    [{ title: "footy match, kickoff 3pm" }, "default"],         // "footy" not a keyword
    [{ title: "⚽ the big game ⚽" }, "default"],
    [{ title: "temple fair / festival" }, "sacred"],            // "temple" hits before nothing
    [{ tmSegment: "Music", title: "asdfghjkl" }, "live_music"], // segment saves it
    [{ title: "   " }, "default"],
    [{ title: "🎵🎵🎵" }, "default"],
  ];
  for (const [ev, want] of CASES) {
    it(`${JSON.stringify(ev).slice(0, 56)} → ${want}`, () => {
      expect(classifyEventVibe(ev)).toBe(want);
    });
  }
});

describe("lanesFor still produces a usable section list for every messy-derived vibe", () => {
  const derived = [...MUST_HIT.map(([n]) => n), ...GRACEFUL_DEFAULT].map((n) => classifyPlaceVibe({ primaryType: "point_of_interest", name: n }));
  it("no derived vibe ever crashes lanesFor and every result has ≥3 lanes", () => {
    for (const { vibe, secondary } of derived) {
      const lanes = lanesFor(vibe, secondary);
      expect(lanes.length).toBeGreaterThanOrEqual(3);
      expect(new Set(lanes.map((l) => l.id)).size).toBe(lanes.length);
    }
  });
});
