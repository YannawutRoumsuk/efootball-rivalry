// Starts a real PostgreSQL server for local development and integration tests
// (no Docker needed). Data lives in .data/pg. Usage: node scripts/local-db.mjs
// Then: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/rivalry_dev
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = fileURLToPath(new URL("../.data/pg", import.meta.url));
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (m) => { if (process.env.LOCAL_PG_DEBUG) console.log(String(m).trim()); },
  onError: (m) => console.error("[local-db]", String(m).trim()),
});

if (!existsSync(`${dataDir}/PG_VERSION`)) await pg.initialise();
await pg.start();
for (const name of ["rivalry_dev", "rivalry_test"]) {
  try {
    await pg.createDatabase(name);
  } catch {
    // already exists
  }
}
console.log(`[local-db] PostgreSQL ready on 127.0.0.1:${port} (databases: rivalry_dev, rivalry_test)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => undefined, 1 << 30);
