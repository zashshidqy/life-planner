import { afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  extractRows,
  getDatabaseUrl,
  getDb,
  type RawQueryResult,
} from "@/server/database/client";

/**
 * Tests for the database client module.
 *
 * The client itself is a three-line adapter around `@neondatabase/serverless`,
 * and there is nothing interesting to assert about the neon-http wire format.
 * What is worth testing is the glue this module owns:
 *
 *   - `extractRows`, which is the single place the neon-http / PGlite result
 *     shape difference is normalised. Getting it wrong produces a bug that looks
 *     exactly like "the query returned no rows", so it gets a direct test.
 *   - `getDatabaseUrl`, which must fail loudly rather than hand `undefined` to a
 *     fetch.
 */

describe("extractRows", () => {
  it("passes through a bare array (neon-http)", () => {
    const rows = [{ n: 1 }];
    expect(extractRows<{ n: number }>(rows)).toBe(rows);
  });

  it("unwraps a result envelope (PGlite)", () => {
    const rows = [{ n: 1 }];
    expect(extractRows<{ n: number }>({ rows })).toBe(rows);
  });

  it("returns an empty list for an empty envelope", () => {
    expect(extractRows<{ n: number }>({ rows: [] })).toEqual([]);
  });

  it("throws on an unrecognised shape rather than returning nothing", () => {
    // The failure mode this guards: silently returning `[]` for a driver whose
    // result shape nobody checked. Every metric query in the product would then
    // report a confident zero.
    expect(() =>
      extractRows<{ n: number }>({ unexpected: true } as unknown as RawQueryResult<{ n: number }>),
    ).toThrow(/Unrecognised shape/);
    expect(() => extractRows<{ n: number }>(null as unknown as RawQueryResult<{ n: number }>)).toThrow(
      /Unrecognised shape/,
    );
  });
});

describe("getDatabaseUrl", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it("returns the configured value", () => {
    process.env.DATABASE_URL = "postgresql://u:p@example.invalid/db";
    expect(getDatabaseUrl()).toBe("postgresql://u:p@example.invalid/db");
  });

  it("throws with actionable guidance when unset", () => {
    delete process.env.DATABASE_URL;
    // Not `undefined`, not an empty connection: a named error naming the file to
    // copy, because "invalid URL" from a fetch three layers down tells nobody
    // what to do.
    expect(() => getDatabaseUrl()).toThrow(/DATABASE_URL is not set/);
    expect(() => getDatabaseUrl()).toThrow(/\.env\.example/);
  });
});

describe("createDatabase", () => {
  it("builds a queryable handle without connecting", () => {
    // Constructing must not open a connection. On the Workers tier every query
    // is a fetch, so eagerly connecting would spend CPU and cold-start time for
    // nothing.
    const db = createDatabase("postgresql://u:p@example.invalid/db?sslmode=require");
    expect(db.query).toBeDefined();
    expect(db.select).toBeDefined();
    expect(db.insert).toBeDefined();
  });
});

describe("getDb", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it("resolves the URL from the environment on each call", () => {
    // No module-level singleton. A cached client is a cached decision about
    // which environment this process is in, and that decision is wrong in
    // exactly the situations that are hardest to debug.
    process.env.DATABASE_URL = "postgresql://u:p@first.invalid/db";
    expect(getDb()).toBeDefined();

    process.env.DATABASE_URL = "postgresql://u:p@second.invalid/db";
    expect(getDb()).toBeDefined();

    delete process.env.DATABASE_URL;
    expect(() => getDb()).toThrow(/DATABASE_URL is not set/);
  });
});