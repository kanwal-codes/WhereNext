import { describe, expect, it } from "vitest";
import { Bus, BedDouble, Castle, Church, Coffee, Compass, Landmark, MapPin, PersonStanding, ShoppingBasket, TrainFront, TreeDeciduous, Utensils } from "lucide-react";
import { placeGlyph, stepGlyph, stopGlyph } from "../../features/conversation/ui/blocks/glyphs";

describe("stop icons say what the stop is", () => {
  it.each([
    ["St James's Park", "activity", TreeDeciduous],
    ["Dinner in Soho", "food", Utensils],
    ["Coffee at Prufrock", "food", Coffee],
    ["Westminster Abbey", "sight", Church],
    ["Tower of London Castle", "sight", Castle],
    ["Jean-Talon Market", "food", ShoppingBasket],
    ["Drop bags at the hostel", "rest", BedDouble],
    ["Tate Modern museum", "sight", Landmark],
    ["Something unnamed", "activity", Compass],
  ] as const)("%s", (title, kind, icon) => {
    expect(stopGlyph(kind, title).icon).toBe(icon);
  });
});

describe("photo-less cards and route steps", () => {
  it("picks the stand-in from category or name, and falls back to a pin", () => {
    expect(placeGlyph("park", "Mount Royal").icon).toBe(TreeDeciduous);
    expect(placeGlyph("restaurant", "LOV").icon).toBe(Utensils);
    expect(placeGlyph(null, "Zzz").icon).toBe(MapPin);
  });
  it("reads a transit step's mode from its words", () => {
    expect(stepGlyph("WALK to hotel (8 min)").icon).toBe(PersonStanding);
    expect(stepGlyph("TRANSIT bus 208 → Cais Sodré (35 min)").icon).toBe(Bus);
    expect(stepGlyph("TRANSIT subway 2 → Jean-Talon (14 min)").icon).toBe(TrainFront);
  });
});

import { factGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { Coins, HandCoins, Plug, Siren } from "lucide-react";

describe("factGlyph", () => {
  it("picks the icon for a practical fact", () => {
    expect(factGlyph("Plug type Type G, 230V")?.icon).toBe(Plug);
    expect(factGlyph("Tipping 10–15% in restaurants")?.icon).toBe(HandCoins);
    expect(factGlyph("Emergency number 911")?.icon).toBe(Siren);
    expect(factGlyph("Currency Canadian dollar")?.icon).toBe(Coins);
  });
  it("returns null when nothing fits", () => {
    expect(factGlyph("Single ride £2.80")).toBeNull();
  });
});
