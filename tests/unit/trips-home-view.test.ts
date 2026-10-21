import { describe, expect, it } from "vitest";
import { homeView } from "../../components/trips/homeView";

const NOW = new Date("2026-10-20T12:00:00").getTime();
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const t = (id: string, start: number | null, end: number | null = start === null ? null : start + 3) => ({ id, start_date: start === null ? null : day(start), end_date: end === null ? null : day(end) });

describe("homeView", () => {
  const trips = [t("past", -40, -36), t("later", 30), t("soon", 5), t("now", -1, 3), t("idea", null)];

  it("sorts for the home screen and leads with what is under way", () => {
    const v = homeView(trips, NOW, "all");
    expect(v.visible.map((x) => x.id)).toEqual(["now", "soon", "later", "idea", "past"]);
    expect(v.featured?.id).toBe("now");
    expect(v.rest.map((x) => x.id)).toEqual(["soon", "later", "idea", "past"]);
  });

  it("counts every kind, folding what is under way into Upcoming", () => {
    expect(homeView(trips, NOW, "all").counts).toMatchObject({ all: 5, upcoming: 3, underway: 1, undated: 1, past: 1 });
  });

  it("filters to the chosen kind and features within it", () => {
    const v = homeView(trips, NOW, "past");
    expect(v.visible.map((x) => x.id)).toEqual(["past"]);
    expect(v.featured?.id).toBe("past");
    expect(v.rest).toEqual([]);
    expect(homeView(trips, NOW, "upcoming").visible.map((x) => x.id)).toEqual(["now", "soon", "later"]);
  });

  it("falls back to All when the asked-for kind has no trips", () => {
    const v = homeView([t("a", 5), t("b", 9)], NOW, "past");
    expect(v.activeFilter).toBe("all");
    expect(v.visible).toHaveLength(2);
  });

  it("lists only the kinds that have trips, All first", () => {
    expect(homeView(trips, NOW, "all").tabs.map((x) => x.key)).toEqual(["all", "upcoming", "undated", "past"]);
    expect(homeView([t("a", 5), t("b", 9)], NOW, "all").tabs.map((x) => x.key)).toEqual(["all", "upcoming"]);
  });

  it("shows tabs only past three trips and with more than one kind", () => {
    expect(homeView(trips, NOW, "all").showTabs).toBe(true);
    expect(homeView(trips.slice(0, 3), NOW, "all").showTabs).toBe(false); // three trips
    expect(homeView([t("a", 5), t("b", 6), t("c", 7), t("d", 8)], NOW, "all").showTabs).toBe(false); // one kind
  });

  it("has nothing to feature with no trips", () => {
    const v = homeView([], NOW, "all");
    expect(v.featured).toBeNull();
    expect(v.visible).toEqual([]);
  });
});
