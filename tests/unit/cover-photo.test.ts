import { describe, expect, it } from "vitest";
import { decodeCover, encodeCover, pickCoverPhoto } from "@/lib/cover-photo";

const wide = (name: string) => ({ name, widthPx: 4032, heightPx: 2268 });
const portrait = (name: string) => ({ name, widthPx: 3024, heightPx: 4032 });

describe("pickCoverPhoto", () => {
  it("prefers a well-rated scenic spot over a bigger park", () => {
    expect(
      pickCoverPhoto([
        { primaryType: "park", userRatingCount: 26_000, photos: [wide("park")] },
        { primaryType: "scenic_spot", userRatingCount: 13_000, photos: [wide("view")] },
      ]),
    ).toBe("view");
  });

  it("skips portrait and small frames inside a place", () => {
    expect(pickCoverPhoto([{ primaryType: "tourist_attraction", userRatingCount: 900, photos: [portrait("tall"), { name: "tiny", widthPx: 612, heightPx: 437 }, wide("ok")] }])).toBe("ok");
  });

  it("ignores shops and lodging, then falls back to any landscape photo, then to nothing", () => {
    expect(pickCoverPhoto([{ primaryType: "lodging", userRatingCount: 9_000, photos: [wide("hotel")] }, { primaryType: "park", userRatingCount: 10, photos: [wide("park")] }])).toBe("park");
    expect(pickCoverPhoto([{ primaryType: "lodging", userRatingCount: 9, photos: [wide("hotel")] }])).toBe("hotel");
    expect(pickCoverPhoto([{ primaryType: "park", photos: [portrait("p")] }])).toBeNull();
  });
});

describe("stored cover", () => {
  it("round-trips a pick and a none-found, and reads anything older as never looked", () => {
    expect(decodeCover(encodeCover("places/x/photos/y"))).toEqual({ known: true, name: "places/x/photos/y" });
    expect(decodeCover(encodeCover(undefined))).toEqual({ known: false }); // an empty "found nothing" is retried, never trusted
    expect(decodeCover("places/x/photos/y")).toEqual({ known: false });
    expect(decodeCover("")).toEqual({ known: false });
    expect(decodeCover(null)).toEqual({ known: false });
  });
});
