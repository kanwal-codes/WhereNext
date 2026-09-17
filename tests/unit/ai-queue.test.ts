import { describe, expect, it } from "vitest";
import { withTripAiStream, withTripAiTask } from "../../lib/server/trip-ai-queue";

/** A stream that stays open until you call the returned `close`. */
function heldStream(): { stream: ReadableStream<Uint8Array>; close: () => void } {
  let close!: () => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      close = () => controller.close();
    },
  });
  return { stream, close };
}
const drained = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([2])); c.close(); } });

describe("withTripAiStream", () => {
  it("holds the same (trip, user) queue until the first response stream ends", async () => {
    const a = heldStream();
    const first = withTripAiStream("hold-1", "u1", async () => a.stream);
    const second = withTripAiStream("hold-1", "u1", async () => drained());

    const reader = (await first).getReader();
    await reader.read();
    let secondStarted = false;
    void second.then(() => { secondStarted = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(secondStarted).toBe(false); // still queued behind the first

    a.close();
    await reader.read(); // drain the first so its slot releases
    await expect(second).resolves.toBeInstanceOf(ReadableStream);
  });

  it("runs different trips concurrently — no cross-trip serialization", async () => {
    const a = heldStream();
    const first = withTripAiStream("par-A", "u1", async () => a.stream);
    await first;
    let bStarted = false;
    const second = withTripAiStream("par-B", "u1", async () => drained()).then((s) => { bStarted = true; return s; });
    await new Promise((r) => setTimeout(r, 0));
    expect(bStarted).toBe(true); // B did not wait for A
    a.close();
    await second;
  });

  it("runs two different members of the SAME trip concurrently — no cross-user serialization", async () => {
    // The fix this test guards: the queue used to be keyed by tripId alone, so one member's
    // whole COMPOSE call blocked a completely unrelated member's reply on the same trip even
    // though nothing about their turns actually races (each writes its own row, own key).
    const a = heldStream();
    const first = withTripAiStream("same-trip", "member-1", async () => a.stream);
    await first;
    let secondStarted = false;
    const second = withTripAiStream("same-trip", "member-2", async () => drained()).then((s) => { secondStarted = true; return s; });
    await new Promise((r) => setTimeout(r, 0));
    expect(secondStarted).toBe(true); // member-2 did not wait for member-1
    a.close();
    await second;
  });

  it("releases the slot and rethrows when task() throws, so the next queued turn proceeds", async () => {
    const failing = withTripAiStream("err-1", "u1", async () => { throw new Error("provider 500"); });
    await expect(failing).rejects.toThrow("provider 500");
    // the queue for this (trip, user) is now clear — a following turn runs
    await expect(withTripAiStream("err-1", "u1", async () => drained())).resolves.toBeInstanceOf(ReadableStream);
  });

  it("releases the slot when the wrapped stream is cancelled mid-flight", async () => {
    const held = heldStream();
    const wrapped = await withTripAiStream("cancel-1", "u1", async () => held.stream);
    const reader = wrapped.getReader();
    await reader.read();
    await reader.cancel("user navigated away");
    // slot freed even though the underlying stream never reached `done`
    await expect(withTripAiStream("cancel-1", "u1", async () => drained())).resolves.toBeInstanceOf(ReadableStream);
  });

  it("throttles a second same-(trip, user) start by roughly the min interval", async () => {
    const t0 = Date.now();
    const first = await withTripAiStream("throttle-1", "u1", async () => drained());
    await first.getReader().read(); // let it drain -> lastStarted is set, slot freed
    const t1 = Date.now();
    await withTripAiStream("throttle-1", "u1", async () => drained());
    const gap = Date.now() - t1;
    expect(gap).toBeGreaterThan(600); // ~750ms min-start interval, with slop
    expect(t1 - t0).toBeLessThan(400); // the first one wasn't throttled
  });
});

/** A task that stays pending until you call the returned `resolve`. */
function heldTask<T>(value: T): { promise: () => Promise<T>; resolve: () => void } {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => { resolve = r; });
  return { promise: async () => { await gate; return value; }, resolve };
}

describe("withTripAiTask", () => {
  it("holds the same (trip, user) queue until the first task settles", async () => {
    const held = heldTask("first");
    const first = withTripAiTask("task-hold-1", "u1", held.promise);
    let secondStarted = false;
    const second = withTripAiTask("task-hold-1", "u1", async () => { secondStarted = true; return "second"; });
    await new Promise((r) => setTimeout(r, 0));
    expect(secondStarted).toBe(false); // still queued behind the first

    held.resolve();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
  });

  it("runs different trips concurrently — no cross-trip serialization", async () => {
    const held = heldTask("A");
    const first = withTripAiTask("task-par-A", "u1", held.promise);
    let bStarted = false;
    const second = withTripAiTask("task-par-B", "u1", async () => { bStarted = true; return "B"; });
    await new Promise((r) => setTimeout(r, 0));
    expect(bStarted).toBe(true); // B did not wait for A
    held.resolve();
    await first;
    await second;
  });

  it("runs two different members of the SAME trip concurrently — no cross-user serialization", async () => {
    const held = heldTask("A");
    const first = withTripAiTask("task-same-trip", "member-1", held.promise);
    let secondStarted = false;
    const second = withTripAiTask("task-same-trip", "member-2", async () => { secondStarted = true; return "B"; });
    await new Promise((r) => setTimeout(r, 0));
    expect(secondStarted).toBe(true); // member-2 did not wait for member-1
    held.resolve();
    await first;
    await second;
  });

  it("releases the slot and rethrows when task() throws, so the next queued turn proceeds", async () => {
    const failing = withTripAiTask("task-err-1", "u1", async () => { throw new Error("compose failed"); });
    await expect(failing).rejects.toThrow("compose failed");
    await expect(withTripAiTask("task-err-1", "u1", async () => "ok")).resolves.toBe("ok");
  });

  it("throttles a second same-(trip, user) start by roughly the min interval", async () => {
    const t0 = Date.now();
    await withTripAiTask("task-throttle-1", "u1", async () => "ok");
    const t1 = Date.now();
    await withTripAiTask("task-throttle-1", "u1", async () => "ok");
    const gap = Date.now() - t1;
    expect(gap).toBeGreaterThan(600); // ~750ms min-start interval, with slop
    expect(t1 - t0).toBeLessThan(400); // the first one wasn't throttled
  });
});
