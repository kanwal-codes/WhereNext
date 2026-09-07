import { describe, expect, it } from "vitest";
import { withTripAiStream } from "../../lib/server/trip-ai-queue";

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
  it("holds the same-trip queue until the first response stream ends", async () => {
    const a = heldStream();
    const first = withTripAiStream("hold-1", async () => a.stream);
    const second = withTripAiStream("hold-1", async () => drained());

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
    const first = withTripAiStream("par-A", async () => a.stream);
    await first;
    let bStarted = false;
    const second = withTripAiStream("par-B", async () => drained()).then((s) => { bStarted = true; return s; });
    await new Promise((r) => setTimeout(r, 0));
    expect(bStarted).toBe(true); // B did not wait for A
    a.close();
    await second;
  });

  it("releases the slot and rethrows when task() throws, so the next queued turn proceeds", async () => {
    const failing = withTripAiStream("err-1", async () => { throw new Error("provider 500"); });
    await expect(failing).rejects.toThrow("provider 500");
    // the queue for this trip is now clear — a following turn runs
    await expect(withTripAiStream("err-1", async () => drained())).resolves.toBeInstanceOf(ReadableStream);
  });

  it("releases the slot when the wrapped stream is cancelled mid-flight", async () => {
    const held = heldStream();
    const wrapped = await withTripAiStream("cancel-1", async () => held.stream);
    const reader = wrapped.getReader();
    await reader.read();
    await reader.cancel("user navigated away");
    // slot freed even though the underlying stream never reached `done`
    await expect(withTripAiStream("cancel-1", async () => drained())).resolves.toBeInstanceOf(ReadableStream);
  });

  it("throttles a second same-trip start by roughly the min interval", async () => {
    const t0 = Date.now();
    const first = await withTripAiStream("throttle-1", async () => drained());
    await first.getReader().read(); // let it drain -> lastStarted is set, slot freed
    const t1 = Date.now();
    await withTripAiStream("throttle-1", async () => drained());
    const gap = Date.now() - t1;
    expect(gap).toBeGreaterThan(600); // ~750ms min-start interval, with slop
    expect(t1 - t0).toBeLessThan(400); // the first one wasn't throttled
  });
});
