import { afterEach, describe, expect, it, vi } from "vitest";

const { createBulkGateway, createGatewayWithFallback } = vi.hoisted(() => ({
  createBulkGateway: vi.fn((o?: unknown) => ({ kind: "bulk", o })),
  createGatewayWithFallback: vi.fn((o?: unknown) => ({ kind: "chain", o })),
}));
vi.mock("@/packages/ai/gateway", () => ({ createBulkGateway, createGatewayWithFallback }));

import { gatewayFor } from "@/packages/ai/model-policy";

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RESOLVE_MODEL;
  delete process.env.SUMMARY_MODEL;
});

describe("gatewayFor", () => {
  it("resolve → the fallback chain, with RESOLVE_MODEL", () => {
    process.env.RESOLVE_MODEL = "planner-x";
    gatewayFor("resolve");
    expect(createGatewayWithFallback).toHaveBeenCalledWith({ model: "planner-x" });
  });

  it("resolve falls through a blank RESOLVE_MODEL to the provider default", () => {
    process.env.RESOLVE_MODEL = "";
    gatewayFor("resolve");
    expect(createGatewayWithFallback).toHaveBeenCalledWith({ model: undefined });
  });

  it("compose → the fallback chain with the provider default model", () => {
    gatewayFor("compose");
    expect(createGatewayWithFallback).toHaveBeenCalledWith();
  });

  it("bulk → the bulk gateway, reading SUMMARY_MODEL", () => {
    process.env.SUMMARY_MODEL = "flash-lite";
    gatewayFor("bulk");
    expect(createBulkGateway).toHaveBeenCalledWith({ model: "flash-lite" });
    expect(createGatewayWithFallback).not.toHaveBeenCalled();
  });
});
