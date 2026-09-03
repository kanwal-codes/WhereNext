// Node-runtime bootstrap. Split out of instrumentation.ts so pino/zod never enter
// the edge middleware bundle.
import { logger } from "@/lib/server/logger";
import { reportEnv } from "@/lib/server/env-check";

export function registerNode(): void {
  reportEnv(logger);
}
