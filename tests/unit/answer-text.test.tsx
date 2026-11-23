// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerText } from "@/components/AnswerText";

describe("AnswerText", () => {
  it("is the paragraph, in a labelled section, and nothing else", () => {
    render(<AnswerText body="Vegan Indian in Toronto. Call ahead about gluten." />);
    const section = screen.getByRole("region", { name: "Roam’s answer" });
    expect(section.textContent).toBe("Vegan Indian in Toronto. Call ahead about gluten.");
    expect(section.querySelectorAll("h1,h2,h3,button,a")).toHaveLength(0);
  });

  it("sets a short answer larger than a long one", () => {
    const { rerender, container } = render(<AnswerText body="Halal places in Toronto. Call ahead to confirm." />);
    const small = () => container.querySelector("p")!.className;
    expect(small()).toContain("1.5rem");
    rerender(<AnswerText body={"I looked for something quiet and vegetarian friendly near the old town. ".repeat(5)} />);
    expect(small()).toContain("1.1875rem");
  });
});
