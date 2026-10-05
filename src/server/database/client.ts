import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema/index.ts";

/**
 * Database client.
 *
 * ## Why `neon-http` and not `node-postgres`
 *
 * Cloudflare Workers has no TCP sockets. The pooled Neon connection string
 * therefore has to be spoken to over HTTP, which is what `neon-http` does. It
 * also means every query is a fetch: no connection pool to manage, nothing to
 * leak, no keep-alive state on a runtime that freezes between requests.
 *
 * `pg` is installed as a **dev** dependency only, for `drizzle-kit`. Migrations
 * run from a developer machine or CI, never from the Worker, so they can use TCP
 * — and DDL such as `CREATE INDEX` cannot run through Neon's transaction-mode
 * pooler anyway. The split is deliberate: TCP for schema changes, HTTP for
 * application traffic.
 *
 * ## Transactions
 *
 * The HTTP driver speaks the single-statement query protocol, so
 * `db.transaction()` is unavailable. This is a real limitation, not an oversight.
 * Nothing in Phase 0 needs a transaction — the append-only ledger makes each
 * `awardXp()` call a single self-contained statement. The first feature that
 * needs more (the `projectProgression()` rebuild) will take the WebSocket driver
 * or be written as an idempotent, retryable operation. Recorded in
 * docs/adr/0001-platform.md §Transactions rather than discovered halfway through
 * writing it.
 *
 * ## Caching
 *
 * None. Connection-level caching would need the Cloudflare Cache API integration
 * and would be a correctness hazard here, because the whole point of the
 * progression tables is that a stale read shows the wrong level. The caching that
 * matters is in the static-asset layer, not here.
 */

/** The concrete client the application uses. */
export type NeonDatabase = NeonHttpDatabase<typeof schema>;

/**
 * Result of a raw `db.execute()` call, normalised across drivers.
 *
 * `neon-http` resolves to a bare `rows` array; PGlite resolves to a full result
 * envelope with `.rows`. Anything doing raw SQL — catalog introspection,
 * migration bookkeeping — needs to handle both, and forgetting to is a bug that
 * looks exactly like "the query returned nothing".
 */
export type RawQueryResult<TRow> = TRow[] | { rows: TRow[] };

export function extractRows<TRow>(result: RawQueryResult<TRow>): TRow[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (result !== null && typeof result === "object" && Array.isArray(result.rows)) {
    return result.rows;
  }
  throw new TypeError(
    "Unrecognised shape from db.execute(): expected an array of rows, or an object with a `rows` array. " +
      "If a new database driver was added, normalise it here.",
  );
}

/**
 * The handle that domain services accept.
 *
 * Deliberately driver-agnostic. `awardXp()` and friends must not care whether
 * they are talking to Neon over HTTP from a Worker, or to PGlite in-process from
 * a test — the SQL they emit is identical, and the guarantee they provide is a
 * property of the schema rather than of the transport. Pinning the services to
 * `NeonHttpDatabase` would make every test either skip itself or require a live
 * Neon connection, which is how "the integration test suite" quietly becomes "the
 * test suite that runs when someone remembers to set a URL".
 *
 * The schema parameter is what carries type safety: rows, inserts, and enum
 * types are all still checked against `typeof schema`. Only the raw result
 * wrapper is loosened, and no service in this codebase consumes it.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDatabase(connectionString: string): NeonDatabase {
  return drizzle(neon(connectionString), { schema });
}

/**
 * Reads the connection string from the environment.
 *
 * Kept separate from `getDb()` so that anything constructing a client — scripts,
 * a future admin job — is explicit about which database it is talking to. There
 * is no module-level singleton, because a cached client is a cached decision
 * about which environment this process is in, and that decision is wrong in
 * exactly the situations that are hardest to debug.
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, or set it in .dev.vars for the Workers runtime.",
    );
  }
  return url;
}

/** Convenience for request handlers, which are the only place this is called. */
export function getDb(): NeonDatabase {
  return createDatabase(getDatabaseUrl());
}