// Applies db/migrations/*.sql in name order, each exactly once, inside one
// transaction guarded by an advisory lock. Runs as Railway's pre-deploy step.
// Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const dir = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 20 });

try {
  // Thai names and on-screen labels need UTF-8 end to end.
  const [{ encoding }] = await sql`select pg_encoding_to_char(encoding) as encoding from pg_database where datname = current_database()`;
  if (encoding !== "UTF8") {
    throw new Error(`database encoding is ${encoding}; recreate it with ENCODING 'UTF8'`);
  }
  await sql`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4207011)`;
    const done = new Set((await tx`select name from public.schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      console.log(`[migrate] applying ${file}`);
      await tx.unsafe(await readFile(`${dir}${file}`, "utf8")).simple();
      await tx`insert into public.schema_migrations (name) values (${file})`;
    }
  });
  await sql`revoke all on public.schema_migrations from anon, authenticated`;
  console.log(`[migrate] up to date (${files.length} migrations)`);
} catch (err) {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
