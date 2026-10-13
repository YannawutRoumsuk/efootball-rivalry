import "server-only";

import postgres, { type Sql, type TransactionSql } from "postgres";

declare global {
  // Survives Next.js hot reloads in development.
  var __rivalrySql: Sql | undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Shared connection pool (owner role). Never query user data on it directly — use withUser(). */
export function sql(): Sql {
  if (globalThis.__rivalrySql) return globalThis.__rivalrySql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => undefined,
    connection: { statement_timeout: 15_000, application_name: "rivalry-web" },
  });
  globalThis.__rivalrySql = client;
  return client;
}

export type Tx = TransactionSql;

/**
 * Binds a value as json/jsonb. postgres.js serialises it itself, so never pass
 * a pre-stringified string (it would be stored as a JSON string scalar).
 */
export function jsonb(tx: Sql | Tx, value: unknown) {
  return tx.json(value as Parameters<Sql["json"]>[0]);
}

/**
 * Runs `fn` in a transaction as the given user: `SET LOCAL ROLE authenticated`
 * plus `app.user_id`, so Row Level Security, column grants and auth.uid()
 * behave exactly as for a signed-in client. Everything inside is atomic.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}
