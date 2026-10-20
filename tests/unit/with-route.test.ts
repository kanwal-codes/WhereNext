import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { withRoute } from "../../lib/server/with-route";

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const req = (url = "http://app.test/api/x") => new Request(url);

describe("withRoute", () => {
  it("passes the request and params through, and tags the response with a request id", async () => {
    const handler = vi.fn(async (_: Request, c: { params: Promise<{ tripId: string }> }) => NextResponse.json({ trip: (await c.params).tripId }));
    const response = await withRoute(handler)(req(), ctx({ tripId: "t1" }));
    expect(await response.json()).toEqual({ trip: "t1" });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("turns an unhandled throw into a 500 with a plain message and a request id", async () => {
    const response = await withRoute(async () => { throw new Error("boom"); })(req(), ctx());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/Something went wrong/);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("still tags a response whose headers are immutable (a redirect, a relayed fetch)", async () => {
    const response = await withRoute(async () => Response.redirect("http://app.test/elsewhere", 302))(req(), ctx());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://app.test/elsewhere");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("writes typographic apostrophes in error text", async () => {
    const response = await withRoute(async () => NextResponse.json({ error: "couldn't do that" }, { status: 400 }))(req(), ctx());
    expect((await response.json()).error).toBe("couldn’t do that");
  });

  it("works when the framework gives no params at all", async () => {
    const response = await withRoute(async () => NextResponse.json({ ok: true }))(req(), undefined as never);
    expect(response.status).toBe(200);
  });
});
