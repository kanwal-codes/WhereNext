import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true }).filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
}

describe("module import boundaries", () => {
  it("keeps domain code independent of framework and infrastructure", () => {
    const files = sourceFiles(join(process.cwd(), "features")).filter((file) => file.includes(`${join("features", "domain")}`));
    for (const file of files) expect(readFileSync(file, "utf8")).not.toMatch(/from ["'](?:next\/|@supabase\/|.*providers\/|.*database\/)/);
  });

  it("keeps UI code independent of vendors and database clients", () => {
    const files = sourceFiles(join(process.cwd(), "features")).filter((file) => file.includes(`${join("features", "ui")}`));
    for (const file of files) expect(readFileSync(file, "utf8")).not.toMatch(/from ["'](?:@supabase\/|.*packages\/providers\/|.*database\/)/);
  });
});
