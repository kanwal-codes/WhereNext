// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlurImage } from "@/components/motion/BlurImage";

describe("BlurImage placeholder", () => {
  it("keeps the card's cached photo under the sharp one, even after it has loaded", () => {
    const { container } = render(<BlurImage src="/p?w=960" placeholder="/p?w=480" alt="Hotel" className="absolute inset-0" />);
    const [under, sharp] = [...container.querySelectorAll("img")];
    expect(under?.getAttribute("src")).toBe("/p?w=480");
    expect(under?.className).not.toContain("opacity-0");
    expect(sharp?.className).toContain("opacity-0");

    fireEvent.load(sharp!);
    expect(sharp?.className).toContain("opacity-100");
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("draws nothing extra without one", () => {
    const { container } = render(<BlurImage src="/p?w=960" alt="Hotel" />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});
