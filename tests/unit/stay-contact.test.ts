import { describe, expect, it } from "vitest";
import { pickHotelContact } from "../../lib/application/stay-contact";

const near = [
  { name: "Premier Inn London Holborn", phone: "0333 000 0000", websiteUri: "https://premierinn.example" },
  { name: "The Hoxton, Holborn", phone: "020 7550 1000", websiteUri: "https://thehoxton.example" },
  { name: "Hotel Without Contact", phone: null, websiteUri: null },
];

describe("pickHotelContact", () => {
  it("takes the lodging whose name matches, not just the nearest", () => {
    expect(pickHotelContact("The Hoxton, Holborn", near)).toEqual({ phone: "020 7550 1000", website: "https://thehoxton.example" });
  });
  it("ignores accents and filler words", () => {
    expect(pickHotelContact("Hoxton Hôtel", near)?.phone).toBe("020 7550 1000");
  });
  it("gives nothing when no neighbour shares the name, or the match has no contact", () => {
    expect(pickHotelContact("Casa Malca", near)).toBeNull();
    expect(pickHotelContact("Hotel Without Contact", near)).toBeNull();
    expect(pickHotelContact("", near)).toBeNull();
  });
});
