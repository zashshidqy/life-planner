import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * `DIRECT_DATABASE_URL` is used in preference to `DATABASE_URL` because Neon
 * requires a *direct* connection for DDL. Statements such as `CREATE INDEX` and
 * `CREATE TYPE` cannot run through Neon's pooled (transaction-mode) endpoint.
 * Falls back to `DATABASE_URL` so local Postgres works with one variable.
 */
function resolveMigrationUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "drizzle-kit: set DIRECT_DATABASE_URL (or DATABASE_URL) before running a migration command.",
    );
  }
  return url;
}

export default defineConfig({
  schema: "./src/server/database/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: resolveMigrationUrl() },
  strict: true,
  verbose: true,
  // Fail loudly rather than generating a migration that silently drops a column.
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
});
