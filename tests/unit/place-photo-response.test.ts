import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { placePhotoResponse } from "@/lib/server/place-photo";

const q = (name = "places/ChIJabc/photos/AaXyz") => new URLSearchParams({ name });
const google = (status: number, body = "", type = "application/json") =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": type } })));

beforeEach(() => vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("placePhotoResponse", () => {
  it("passes the image through, cached for a week", async () => {
    google(200, "bytes", "image/jpeg");
    const res = await placePhotoResponse(q());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=604800");
  });

  it("answers 404, not a server error, for a photo name Google no longer knows", async () => {
    for (const status of [400, 404]) {
      google(status, '{"error":{"status":"NOT_FOUND"}}');
      expect((await placePhotoResponse(q())).status).toBe(404);
    }
  });

  it("still throws for a refused key, a quota hit and an outage, and says what Google said", async () => {
    for (const status of [403, 429, 503]) {
      google(status, '{"error":{"status":"PERMISSION_DENIED"}}');
      await expect(placePhotoResponse(q())).rejects.toThrow(new RegExp(`Place photo is unavailable \\(Google ${status}: .*PERMISSION_DENIED`));
    }
  });

  it("rejects a malformed name before calling Google", async () => {
    google(200, "bytes", "image/jpeg");
    expect((await placePhotoResponse(q("../etc/passwd"))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("placePhotoResponse: a retired photo name", () => {
  const NAME = "places/ChIJabc/photos/AaRetired";
  // Google answers by URL: the old photo is gone, the place lists a current one, and that one serves.
  const googleWith = (photos: unknown) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url.includes("/media") ? (url.includes("AaRetired") ? "media:old" : "media:new") : "details");
      if (url.includes("AaRetired")) return new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404, headers: { "content-type": "application/json" } });
      if (url.includes("/media")) return new Response("fresh-bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
      return Response.json({ photos });
    }));
    return calls;
  };

  it("serves one of the place's current photographs instead, and only caches it for a day", async () => {
    const calls = googleWith([{ name: "places/ChIJabc/photos/AaPortrait", widthPx: 900, heightPx: 1600 }, { name: "places/ChIJabc/photos/AaWide", widthPx: 4000, heightPx: 2400 }]);
    const res = await placePhotoResponse(q(NAME));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("fresh-bytes");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(calls).toEqual(["media:old", "details", "media:new"]);
    // The wide frame, not the portrait that happened to be listed first.
    expect(vi.mocked(fetch).mock.calls.at(-1)![0]).toContain("AaWide");
  });

  it("leaves the picture to the caller when heal=0 (the trip cover re-picks it itself)", async () => {
    const calls = googleWith([{ name: "places/ChIJabc/photos/AaWide", widthPx: 4000, heightPx: 2400 }]);
    const res = await placePhotoResponse(new URLSearchParams({ name: NAME, heal: "0" }));
    expect(res.status).toBe(404);
    expect(calls).toEqual(["media:old"]);
  });

  it("stays a 404 when the place has no photographs left, or its lookup fails", async () => {
    googleWith([]);
    expect((await placePhotoResponse(q(NAME))).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).includes("AaRetired") ? new Response("{}", { status: 404 }) : new Response("boom", { status: 500 }))));
    expect((await placePhotoResponse(q(NAME))).status).toBe(404);
  });
});
