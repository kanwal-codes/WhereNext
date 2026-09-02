import { describe, expect, it } from "vitest";
import { withTripAiQueue, withTripAiStream } from "../../lib/server/trip-ai-queue";

describe("trip AI queue", () => {
  it("serializes requests for the same trip but not different trips", async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = withTripAiQueue("trip-a", async () => { order.push("first-start"); await new Promise<void>((resolve) => { release = resolve; }); order.push("first-end"); return 1; });
    const second = withTripAiQueue("trip-a", async () => { order.push("second"); return 2; });
    const other = withTripAiQueue("trip-b", async () => { order.push("other"); return 3; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["first-start", "other"]);
    release();
    await expect(Promise.all([first, second, other])).resolves.toEqual([1, 2, 3]);
    expect(order).toEqual(["first-start", "other", "first-end", "second"]);
  });

  it("holds the same-trip queue until a response stream ends", async () => {
    let release!: () => void;
    const first = withTripAiStream("trip-stream", async () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); release = () => controller.close(); } }));
    const second = withTripAiStream("trip-stream", async () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([2])); controller.close(); } }));
    const firstStream = await first;
    const firstReader = firstStream.getReader();
    await firstReader.read();
    let secondStarted = false;
    void second.then(() => { secondStarted = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondStarted).toBe(false);
    release();
    await firstReader.read();
    await expect(second).resolves.toBeInstanceOf(ReadableStream);
  });
});
