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
