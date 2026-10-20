import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// Layering, enforced. Dependencies point one way:
//   contracts / domain  ->  nothing app-specific (pure)
//   packages            ->  lib (provider guard, cache) but never features, components or app
//   lib, application    ->  never components, app, or a feature's ui
//   client code         ->  never server-only modules (they would ship in the browser bundle)
// Each list is written once as `@/` alias and once as a relative path, so `../../lib/server/x` can't slip past.
const ts = (...dirs) => dirs.flatMap((d) => [`${d}/*.ts`, `${d}/*.tsx`]);
const both = (path) => [`@/${path}`, `**/${path}`];
const group = (paths, message) => ({ group: paths.flatMap(both), message });
const restrict = (...groups) => ({ "no-restricted-imports": ["error", { patterns: groups }] });
const restrictTypesOk = (...groups) => ({ "no-restricted-imports": ["error", { patterns: groups.map((g) => ({ ...g, allowTypeImports: true })) }] });

const noUi = group(["components/**", "app/**", "features/*/ui/**"], "Shared and server code must not depend on UI, pages or components.");
const noServer = group(["lib/server/**", "lib/supabase/server", "lib/supabase/admin"], "Server-only module: importing it from client code ships it to the browser.");
const noFeatures = group(["features/**"], "packages/ is below features/: it can't import from them.");
const pure = group(["react", "react-dom", "next", "next/**", "@supabase/**", "lib/server/**", "lib/supabase/**"], "domain/ and contracts/ stay pure: no framework, database or server code.");

const config = [
  { ignores: [".next/**", ".next-build-phone/**", ".next-dev*/**", ".next-local/**", ".next-e2e/**", "node_modules/**", "test-results/**", "coverage/**", "frontend/**"] },
  ...compat.extends("next/core-web-vitals"),
  // React hooks (use*.ts) in application/ read UI context providers on purpose; everything else there stays UI-free.
  { files: ts("lib/**", "features/*/application/**", "features/*/infrastructure/**"), ignores: ["features/*/application/use*.ts"], rules: restrict(noUi) },
  { files: ts("packages/**"), rules: restrict(noUi, noFeatures) },
  { files: ts("features/*/domain/**", "packages/contracts/**"), rules: restrict(noUi, noFeatures, pure) },
  { files: ts("components/**", "features/*/ui/**", "lib/client/**"), rules: restrictTypesOk(noServer) },
];
export default config;
