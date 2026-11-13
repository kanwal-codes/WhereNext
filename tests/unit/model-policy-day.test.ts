import { afterEach, describe, expect, it } from "vitest";
import { modelChainFor } from "../../packages/ai/model-policy";

const KEYS = ["GOOGLE_GEMINI_API", "DAY_MODEL"] as const;
afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe("modelChainFor('day')", () => {
  it("is the Claude bulk chain without a Gemini key", () => {
    expect(modelChainFor("day")).toEqual(modelChainFor("bulk"));
  });
  it("leads with Gemini Flash Lite when the key is set, Claude behind it", () => {
    process.env.GOOGLE_GEMINI_API = "k";
    expect(modelChainFor("day")).toEqual(["google/gemini-3.5-flash-lite", "claude-haiku-5-5", "claude-sonnet-5-5"]);
  });
  it("DAY_MODEL=off keeps Claude even with the key; another id leads instead", () => {
    process.env.GOOGLE_GEMINI_API = "k";
    process.env.DAY_MODEL = "off";
    expect(modelChainFor("day")).toEqual(modelChainFor("bulk"));
    process.env.DAY_MODEL = "claude-sonnet-5-5";
    expect(modelChainFor("day")).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
  });
});

describe("modelChainFor('menu')", () => {
  it("leads with Sonnet, Haiku behind it, and MENU_MODEL overrides the lead", () => {
    expect(modelChainFor("menu")).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    process.env.MENU_MODEL = "claude-opus-5-5";
    expect(modelChainFor("menu")).toEqual(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
    delete process.env.MENU_MODEL;
  });
});
