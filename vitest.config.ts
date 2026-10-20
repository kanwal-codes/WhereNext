import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same automatic JSX runtime as `next build`, so a component file needs no `import React`.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "") } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/eval/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
    silent: process.env.CI ? false : "passed-only",
    env: { LOG_LEVEL: "silent" },
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      // Scope to the logic layers unit tests actually exercise; UI/routes/pages are e2e territory.
      include: ["lib/**", "packages/**", "features/**/domain/**", "features/**/application/**", "features/**/infrastructure/**"],
      exclude: ["tests/**", "**/*.config.*", "**/*.d.ts"],
      // Soft floor — start where we are, ratchet up as the eval suite grows.
      thresholds: { lines: 55, functions: 55, statements: 55, branches: 55 },
    },
  },
});
