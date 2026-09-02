import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "") } },
  test: { include: ["tests/unit/**/*.test.{ts,tsx}"], exclude: ["tests/e2e/**"] },
});
