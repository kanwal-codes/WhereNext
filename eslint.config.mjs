import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
const config = [{ ignores: [".next/**", ".next-dev*/**", ".next-local/**", ".next-e2e/**", "node_modules/**", "test-results/**", "coverage/**", "frontend/**"] }, ...compat.extends("next/core-web-vitals")];
export default config;
