// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Any = Record<string, any>;
let store: Map<number, Any>;
let nextId: number;
let online = true;
const toast = vi.fn();
const announce = vi.fn();
const fetchMock = vi.fn();
const added: Array<[string, EventListener]> = [];

vi.mock("idb", () => ({
  openDB: async () => ({
    add: async (_s: string, row: Any) => { const id = nextId++; store.set(id, { ...row, id }); return id; },
    getAll: async () => [...store.values()],
    delete: async (_s: string, id: number) => { store.delete(id); },
  }),
}));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/lib/application/workspace-events", () => ({ announceWorkspaceChange: (...a: unknown[]) => announce(...a) }));

const load = async () => (await import("../../lib/client/mutation-queue"));

beforeEach(() => {
  vi.resetModules();
  store = new Map(); nextId = 1; online = true;
  toast.mockClear(); announce.mockClear(); fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  vi.stubGlobal("indexedDB", {});
  const real = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(((type: string, fn: EventListener, o?: unknown) => { added.push([type, fn]); real(type, fn, o as never); }) as never);
});
afterEach(() => {
  for (const [type, fn] of added.splice(0)) window.removeEventListener(type, fn);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const res = (status: number) => ({ ok: status >= 200 && status < 300, status });
const rows = () => [...store.values()];

describe("mutate", () => {
  it("sends the request as JSON and announces the change", async () => {
    fetchMock.mockResolvedValue(res(200));
    const { mutate } = await load();
    expect(await mutate("/api/x", { method: "PATCH", body: { a: 1 }, announce: ["places", "itinerary"] as never })).toEqual({ ok: true, queued: false, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"a":1}' });
    expect(announce.mock.calls.map((c) => c[0])).toEqual(["places", "itinerary"]);
    expect(rows()).toHaveLength(0);
  });

  it("reports a refusal without queueing or announcing", async () => {
    fetchMock.mockResolvedValue(res(403));
    const { mutate } = await load();
    expect(await mutate("/api/x", { method: "POST", body: {}, announce: ["places"] as never })).toEqual({ ok: false, queued: false, status: 403 });
    expect(announce).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it("queues the change when the network fails, and says it went through", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { mutate } = await load();
    vi.spyOn(Date, "now").mockReturnValue(1234);
    expect(await mutate("/api/x", { method: "PUT", body: { b: 2 }, announce: ["places"] as never })).toEqual({ ok: true, queued: true, status: 0 });
    expect(rows()).toEqual([{ id: 1, url: "/api/x", method: "PUT", body: '{"b":2}', announce: ["places"], enqueuedAt: 1234 }]);
    expect(announce).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("queues when the browser says it is offline, whatever the error", async () => {
    online = false;
    fetchMock.mockRejectedValue(new Error("weird"));
    const { mutate } = await load();
    expect((await mutate("/api/x", { method: "POST", body: {} })).queued).toBe(true);
    expect(rows()[0].announce).toEqual([]);
  });

  it("does not queue an error that is not about the network", async () => {
    fetchMock.mockRejectedValue(new Error("bug"));
    const { mutate } = await load();
    expect(await mutate("/api/x", { method: "POST", body: {} })).toEqual({ ok: false, queued: false, status: 0 });
    expect(rows()).toHaveLength(0);
  });
});

describe("replaying the queue", () => {
  const enqueue = (n: number, announceWhat: string[] = []) => { for (let i = 1; i <= n; i += 1) store.set(nextId, { id: nextId++, url: `/api/${i}`, method: "POST", body: `{"n":${i}}`, announce: announceWhat, enqueuedAt: i }); };
  const settle = () => new Promise((r) => setTimeout(r, 10));

  it("replays in order on reconnect, clears what went through, announces, and says how many", async () => {
    fetchMock.mockResolvedValue(res(200));
    enqueue(3, ["places"]);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/1", "/api/2", "/api/3"]);
    expect(rows()).toHaveLength(0);
    expect(announce).toHaveBeenCalledTimes(3);
    expect(toast).toHaveBeenCalledWith("Synced 3 changes made offline.", "success");
  });

  it("says 'change' for one", async () => {
    fetchMock.mockResolvedValue(res(200));
    enqueue(1);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(toast).toHaveBeenCalledWith("Synced 1 change made offline.", "success");
  });

  it("drops a change the server now refuses, and tells the person", async () => {
    fetchMock.mockResolvedValueOnce(res(409)).mockResolvedValueOnce(res(200));
    enqueue(2);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(rows()).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith("1 offline change no longer applied.", "info");
    expect(toast).toHaveBeenCalledWith("Synced 1 change made offline.", "success");
  });

  it("pluralises the dropped count", async () => {
    fetchMock.mockResolvedValue(res(404));
    enqueue(2);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(toast).toHaveBeenCalledWith("2 offline changes no longer applied.", "info");
  });

  it("stops at a server error and keeps the rest for later", async () => {
    fetchMock.mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(503));
    enqueue(3);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows().map((r) => r.url)).toEqual(["/api/2", "/api/3"]);
    expect(toast).toHaveBeenCalledWith("Synced 1 change made offline.", "success");
  });

  it("stops when the network is gone again, and says nothing if nothing went through", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    enqueue(2);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(rows()).toHaveLength(2);
    expect(toast).not.toHaveBeenCalled();
  });

  it("does nothing while still offline, and waits for the browser to come back", async () => {
    online = false;
    fetchMock.mockResolvedValue(res(200));
    enqueue(1);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    online = true;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("wires itself only once", async () => {
    fetchMock.mockResolvedValue(res(200));
    const { initMutationQueue } = await load();
    initMutationQueue();
    initMutationQueue();
    await settle();
    expect(added.filter(([type]) => type === "online")).toHaveLength(1);
    enqueue(1);
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not run two replays at once", async () => {
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise((r) => { release = () => r(res(200)); }));
    enqueue(1);
    const { initMutationQueue } = await load();
    initMutationQueue();
    await settle();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await settle();
  });
});
