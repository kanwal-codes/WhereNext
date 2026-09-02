import { describe, expect, it } from "vitest";
import { withTripAiStream } from "../../lib/server/trip-ai-queue";

describe("trip AI queue", () => {
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
