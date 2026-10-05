import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let signedIn = true;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: "u" } } : null }) } }),
}));
vi.mock("@/lib/server/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("node:dns/promises", () => ({ lookup: async (host: string) => (host === "internal.example" ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]) }));

import { GET } from "@/app/api/hotel-photo/route";
import { hotelPhotoSrc, googlePhotoSrc } from "@/lib/hotel-photo";

const call = (u: string) => GET(new Request(`https://app.test/api/hotel-photo?u=${encodeURIComponent(u)}`));
const image = (bytes = 100) => new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "image/jpeg" } });

describe("hotel photo proxy", () => {
  beforeEach(() => { signedIn = true; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("serves a Google photograph", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => image()));
    const res = await call("https://lh3.googleusercontent.com/p/abc=s10000");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("serves another host's photograph to a signed-in visitor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => image()));
    const res = await call("https://media.vrbo.com/lodging/1.jpg");
    expect(res.status).toBe(200);
  });

  it("turns away another host's photograph when nobody is signed in", async () => {
    signedIn = false;
    vi.stubGlobal("fetch", vi.fn(async () => image()));
    expect((await call("https://media.vrbo.com/lodging/1.jpg")).status).toBe(401);
  });

  it("never reaches a private address", async () => {
    const fetchMock = vi.fn(async () => image());
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("https://10.0.0.1/x.jpg")).status).toBe(400);
    expect((await call("https://internal.example/x.jpg")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses plain http and non-images", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })));
    expect((await call("http://media.vrbo.com/1.jpg")).status).toBe(400);
    expect((await call("https://media.vrbo.com/page")).status).toBe(502);
  });

  it("refuses a photo over the size cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => image(7 * 1024 * 1024)));
    expect((await call("https://media.vrbo.com/huge.jpg")).status).toBe(502);
  });
});

describe("photo addresses", () => {
  it("sends every https hotel photo through the proxy, and leaves our own and inline ones alone", () => {
    expect(hotelPhotoSrc("https://media.vrbo.com/a.jpg")).toBe("/api/hotel-photo?u=https%3A%2F%2Fmedia.vrbo.com%2Fa.jpg");
    expect(hotelPhotoSrc("/design/place-hotel.jpg")).toBe("/design/place-hotel.jpg");
    expect(hotelPhotoSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(hotelPhotoSrc(null)).toBeNull();
  });

  it("proxies only Google's hosts for generic images", () => {
    expect(googlePhotoSrc("https://lh3.googleusercontent.com/p/x")).toContain("/api/hotel-photo");
    expect(googlePhotoSrc("https://s1.ticketm.net/a.jpg")).toBe("https://s1.ticketm.net/a.jpg");
  });
});
