import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "@/server/database/client";
import * as schema from "@/server/database/schema";

/**
 * Test database — PGlite, a real PostgreSQL engine compiled to WASM, running
 * in-process.
 *
 * ## Why not a mocked client
 *
 * The property this suite exists to prove is enforced by a Postgres unique
 * index and a `BEFORE UPDATE OR DELETE` trigger. A fake client can only prove
 * that the fake is idempotent. Two requests racing past a read-then-write check
 * is precisely the bug PRD §12 is about, and only the database can rule it out.
 *
 * ## Why not a Postgres server
 *
 * Both were evaluated. A server (a container, or a Neon branch) is the closest
 * analogue to production, and it is how the *migration* path is verified
 * separately — see README §Verifying the migration against a real server.
 *
 * For the unit suite it loses on two counts:
 *
 *   1. `pnpm test` would require Docker, a podman daemon, or a live Neon
 *      connection. Every contributor and every CI run would carry an
 *      environmental prerequisite for a suite that needs none.
 *   2. A suite that cannot run is a suite that gets skipped, and a skipped
 *      idempotency test is exactly the failure this phase exists to prevent.
 *
 * PGlite is the same engine with the same constraint, `ON CONFLICT`, `CHECK`,
 * trigger, and `plpgsql` semantics — verified, not assumed; see the probe
 * recorded in ADR 0007. The one thing it does not model is genuine parallel
 * connection interleaving, which is called out in the concurrency test.
 *
 * ## Schema comes from the migration files
 *
 * `migrate()` reads `drizzle/` — the same files `drizzle-kit migrate` applies in
 * production. So a test cannot pass against a schema that a fresh deploy would
 * not have. Had the schema been created with `drizzle-kit push` or by hand in a
 * fixture, the tests would be validating a private copy of the truth.
 */

/** In-memory. Each test file worker gets its own isolated database. */
const client = new PGlite();

const db = drizzle(client, { schema });

// Top-level await: the schema must exist before any test module body runs, since
// test files call `db` at module scope. Migrating per file costs ~200ms and buys
// full isolation — no shared state, no ordering dependency between files.
await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });

export const testDb: Database = db;

/**
 * Clears every table between tests.
 *
 * `TRUNCATE ... CASCADE` rather than `DELETE` for two reasons. It is one
 * statement instead of ten. And — the load-bearing reason — `xp_transactions`
 * has an append-only trigger that raises on `DELETE`; `TRUNCATE` fires
 * row-level `BEFORE DELETE` triggers not at all, so it is the only way to clear
 * the ledger. Fixtures may truncate; no application code ever does.
 */
export async function resetProgressionTables(): Promise<void> {
  await db.execute(`
    TRUNCATE TABLE
      xp_transactions, user_progression, streak_events, streaks,
      user_achievements, achievements, analytics_events, analytics_sessions,
      system_config, users
    RESTART IDENTITY CASCADE
  `);
}