/**
 * Applies every unapplied file in database/migrations in order, recording each in
 * a `public._schema_migrations` ledger. Idempotent: already-applied files are
 * skipped. Each migration + its ledger row commit together, so a failed migration
 * leaves nothing half-applied and is safe to retry.
 *
 *   bun run db:migrate
 *
 * Needs DATABASE_URL in .env.local (the Supabase session-pooler URL; the `@` in
 * the password must stay percent-encoded as %40).
 *
 * Each migration declares a SENTINEL query — a cheap check for whether its schema
 * is already in place. That lets the runner adopt a database whose earlier
 * migrations were applied by hand (before this ledger existed) without trying to
 * re-run their non-idempotent statements. A file with no sentinel is always run.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const SENTINEL: Record<string, string> = {
  "0001_core.sql": "select to_regclass('public.trips') is not null as ok",
  "0002_conversation_metadata.sql":
    "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='conversation_messages' and column_name='metadata') as ok",
  "0003_trip_delete_policy.sql":
    "select exists (select 1 from pg_policies where schemaname='public' and tablename='trips' and policyname='owners can delete trips') as ok",
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — add it to .env.local (used only by this script).");
  process.exit(1);
}

const dir = fileURLToPath(new URL("../database/migrations/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const sql = postgres(url, { max: 1, idle_timeout: 5, onnotice: () => {} });
try {
  await sql`create table if not exists public._schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`;
  await sql`alter table public._schema_migrations enable row level security`;

  const done = new Set((await sql`select filename from public._schema_migrations`).map((r) => r.filename as string));

  let ran = 0;
  let adopted = 0;
  for (const f of files) {
    if (done.has(f)) continue;

    const probe = SENTINEL[f];
    if (probe) {
      const [row] = await sql.unsafe(probe);
      if (row && row.ok === true) {
        await sql`insert into public._schema_migrations ${sql({ filename: f })} on conflict do nothing`;
        adopted += 1;
        continue;
      }
    }

    process.stdout.write(`applying ${f} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, f), "utf8"));
      await tx`insert into public._schema_migrations ${tx({ filename: f })}`;
    });
    console.log("ok");
    ran += 1;
  }

  if (adopted) console.log(`Adopted ${adopted} pre-existing migration(s) into the ledger.`);
  console.log(ran ? `Applied ${ran} new migration(s).` : "Already up to date.");
} catch (error) {
  console.error("\nMigration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
