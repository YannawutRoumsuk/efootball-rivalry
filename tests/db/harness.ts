import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "db", "migrations");

export interface TestDb {
  db: PGlite;
  /** Runs `fn` exactly like the app does for a signed-in user: role `authenticated` + app.user_id. */
  asUser<T>(userId: string, fn: (db: PGlite) => Promise<T>): Promise<T>;
  createUser(email: string, displayName?: string): Promise<string>;
  close(): Promise<void>;
}

/** Applies the real production migrations to an in-process Postgres. */
export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }

  async function asUser<T>(userId: string, fn: (db: PGlite) => Promise<T>): Promise<T> {
    await db.exec(`set role authenticated`);
    await db.query(`select set_config('app.user_id', $1, false)`, [userId]);
    try {
      return await fn(db);
    } finally {
      await db.exec(`reset role`);
      await db.query(`select set_config('app.user_id', '', false)`);
    }
  }

  async function createUser(email: string, displayName?: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email, password_hash, raw_user_meta_data) values ($1, 'test-hash', $2) returning id`,
      [email, JSON.stringify(displayName ? { display_name: displayName } : {})],
    );
    return rows[0].id;
  }

  return { db, asUser, createUser, close: () => db.close() };
}
