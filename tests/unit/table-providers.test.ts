import { describe, expect, it } from "vitest";
import { countryCodeFor, POPULAR, PREFILLED_COUNTRIES, tableOptions, telHref } from "../../lib/table-providers";

const search = { name: "Ramiro", city: "Lisbon", date: "2026-10-13", time: "20:30", party: 4 };

describe("countryCodeFor", () => {
  it("reads the country off the end of a destination or a full address", () => {
    expect(countryCodeFor("Lisbon, Portugal")).toBe("PT");
    expect(countryCodeFor("Av. Almirante Reis 1, 1150-007 Lisboa, Portugal")).toBe("PT");
    expect(countryCodeFor("Seoul, South Korea")).toBe("KR");
    expect(countryCodeFor("Austin, Texas, USA")).toBe("US");
  });
  it("recognises a well-known city typed without its country, and is null otherwise", () => {
    expect(countryCodeFor("Tokyo")).toBe("JP");
    expect(countryCodeFor("Smallville")).toBeNull();
    expect(countryCodeFor(null)).toBeNull();
  });
});

describe("tableOptions", () => {
  it("prefills only where OpenTable serves, and says nothing is prefilled elsewhere", () => {
    const toronto = tableOptions(search, "Toronto, Canada");
    expect(toronto.prefilled?.name).toBe("OpenTable");
    expect(toronto.prefilled?.url).toContain("covers=4");
    expect(tableOptions(search, "Lisbon, Portugal").prefilled).toBeNull();
    expect(tableOptions(search, "Seoul, South Korea").prefilled).toBeNull();
  });
  it("lists the popular sites for the country, as plain front pages", () => {
    expect(tableOptions(search, "Seoul, South Korea").popular.map((s) => s.id)).toEqual(["catchtable", "naver", "tablecheck"]);
    expect(tableOptions(search, "Lisbon, Portugal").popular.map((s) => s.id)).toEqual(["thefork"]);
    expect(tableOptions(search, "Smallville").popular).toEqual([]);
    for (const site of POPULAR) expect(new URL(site.url).search).toBe("");
  });
  it("trusts the restaurant's own address over the trip's destination", () => {
    const o = tableOptions(search, "Lisbon, Portugal", { name: "Sukiyabashi", address: "Ginza, Tokyo, Japan" });
    expect(o.code).toBe("JP");
    expect(o.prefilled).not.toBeNull();
  });
  it("offers call, website and maps from what Google knows, and a search when it knows nothing", () => {
    const o = tableOptions(search, "Lisbon, Portugal", { name: "Ramiro", phone: "+351 21 888 1377", websiteUri: "https://example.com/", mapsUrl: "https://maps.google.com/?cid=1", reservable: true });
    expect(o.call).toEqual({ label: "+351 21 888 1377", href: "tel:+351218881377" });
    expect(o.website).toBe("https://example.com/");
    expect(o.maps).toBe("https://maps.google.com/?cid=1");
    expect(o.mapsReserve).toBe(true);
    const bare = tableOptions(search, "Lisbon, Portugal");
    expect(bare.call).toBeNull();
    expect(bare.website).toBeNull();
    expect(new URL(bare.maps).searchParams.get("query")).toBe("Ramiro, Lisbon");
    expect(bare.mapsReserve).toBe(false);
  });
  it("never turns a non-web string into a link", () => {
    const o = tableOptions(search, "Lisbon, Portugal", { name: "x", websiteUri: "javascript:alert(1)", mapsUrl: "data:text/html,hi", phone: "call me" });
    expect(o.website).toBeNull();
    expect(o.maps).toContain("google.com/maps");
    expect(o.call).toBeNull();
  });
  it("keeps the prefilled list to countries we have a country code for", () => {
    for (const code of PREFILLED_COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/);
    expect(telHref("12")).toBeNull();
  });
});
