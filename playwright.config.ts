import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "/private/tmp/next-place-to-be-rebuild-test-results",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // E2E_PREVIEW=1 enables the credential-free `rebuild-preview` trip the routed-shell spec drives.
  // The live specs need reliable tool-calling: force a capable RESOLVE model via the Gateway
  // (the built-in default chain optimizes for speed/cost and can under-call the retrieval tools).
  webServer: {
    command: "NEXT_DIST_DIR=.next-e2e E2E_PREVIEW=1 RESOLVE_MODEL=openai/gpt-4o bun run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
