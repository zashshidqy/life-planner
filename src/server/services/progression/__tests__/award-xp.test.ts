import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { extractRows, type RawQueryResult } from "@/server/database/client";
import {
  awardXp,
  InvalidXpConfigError,
  UnknownXpSourceError,
} from "@/server/services/progression/award-xp";
import { systemConfig, users, xpTransactions, type XpSourceType } from "@/server/database/schema";
import { resetProgressionTables, testDb } from "@/test/database";

/**
 * The Phase 0 gate: XP cannot be credited twice for the same event.
 *
 * The task for this phase is deliberately narrow. The progression *engine* is
 * Phase 2; what is being locked down now is the schema constraint underneath it.
 * Adding `xp_transactions_user_source_uidx` to a table that already holds
 * duplicated rows is a data-cleanup project with an ambiguous "which duplicate do
 * we keep" question. Designing it into the first migration costs one index.
 * So this suite exists to make that constraint unbudgeted for later.
 *
 * Each test below is a distinct way the guarantee could plausibly be broken.
 * Runs against PGlite — real Postgres semantics, no external service. See
 * `src/test/database.ts` for why, and README §Testing for the alternative.
 */

const db = testDb;

const USER_ID = "user_test_1";

/** Seeds the minimum account row. No XP cache row — that is not this phase. */
async function seedUser(id: string): Promise<void> {
  // Inline insert rather than a repository: Phase 0 has no repository layer,
  // and adding one to make a test shorter would be the wrong abstraction.
  await db.insert(users).values({ id, username: `u_${id}` });
}

async function seedXpAward(sourceType: XpSourceType, amount: number): Promise<void> {
  await db.insert(systemConfig).values({
    key: `xp.award.${sourceType}`,
    value: amount,
    valueType: "number",
    description: `XP for ${sourceType}`,
  });
}

async function ledgerRows(userId = USER_ID) {
  return db
    .select()
    .from(xpTransactions)
    .where(sql`${xpTransactions.userId} = ${userId}`)
    .orderBy(xpTransactions.createdAt);
}

/**
 * Raw SQL for catalog and count queries, normalised across drivers.
 *
 * `neon-http` returns a bare array; PGlite returns an envelope with `.rows`.
 * `extractRows` is the single place that difference is handled — see
 * `src/server/database/client.ts`.
 */
async function raw<TRow>(query: ReturnType<typeof sql>): Promise<TRow[]> {
  return extractRows<TRow>((await db.execute(query)) as RawQueryResult<TRow>);
}

async function ledgerCount(userId = USER_ID): Promise<number> {
  const rows = await raw<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM xp_transactions WHERE user_id = ${userId}`,
  );
  return rows[0]?.count ?? 0;
}

beforeEach(async () => {
  await resetProgressionTables();
  await seedUser(USER_ID);
});

describe("awardXp — idempotency", () => {
  it("credits the ledger row on the first call", async () => {
    await seedXpAward("task_completed", 10);

    const result = await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_123",
    });

    expect(result.credited).toBe(true);
    expect(result.transactionId).not.toBeNull();
    expect(result.amount).toBe(10);
    expect(await ledgerCount()).toBe(1);
  });

  it("yields exactly one ledger row when called twice with an identical (user, sourceType, sourceId)", async () => {
    // The core requirement. Same user, same activity type, same activity id.
    await seedXpAward("task_completed", 10);

    const input = {
      userId: USER_ID,
      sourceType: "task_completed" as const,
      sourceId: "task_123",
    };

    const first = await awardXp(db, input);
    const second = await awardXp(db, input);

    // First call created the row; second call observed the conflict.
    expect(first.credited).toBe(true);
    expect(first.transactionId).not.toBeNull();
    expect(second.credited).toBe(false);
    expect(second.transactionId).toBeNull();
    // A duplicate reports the payout it resolved, so a caller can distinguish
    // "already had this" from "this source is not configured" without a second
    // lookup — and without accidentally crediting it.
    expect(second.amount).toBe(first.amount);

    // The assertion that matters: one row, not two, and not a partial write.
    expect(await ledgerCount()).toBe(1);

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(10);
    expect(rows[0]?.sourceId).toBe("task_123");
  });

  it("stays at one row across many repeats", async () => {
    await seedXpAward("habit_completed", 10);

    const input = {
      userId: USER_ID,
      sourceType: "habit_completed" as const,
      sourceId: "habit_777",
    };

    for (let i = 0; i < 10; i++) {
      await awardXp(db, input);
    }

    expect(await ledgerCount()).toBe(1);
  });

  it("survives concurrent identical calls", async () => {
    // The case a read-then-write check would fail. All four callers observe
    // "not credited yet"; only the unique index can settle it. If this test
    // ever fails, the guarantee is application-level rather than structural, and
    // every comment claiming otherwise is wrong.
    //
    // PGlite serves a single connection, so these statements serialise rather
    // than genuinely interleave. That still exercises the index — what it does
    // not exercise is two OS-level connections racing. README §Testing points at
    // the server-backed run for that.
    await seedXpAward("task_completed", 10);

    const input = {
      userId: USER_ID,
      sourceType: "task_completed" as const,
      sourceId: "task_race",
    };

    const results = await Promise.all([
      awardXp(db, input),
      awardXp(db, input),
      awardXp(db, input),
      awardXp(db, input),
    ]);

    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(results.filter((r) => !r.credited)).toHaveLength(3);
    expect(await ledgerCount()).toBe(1);
  });

  it("distinguishes different sourceIds of the same sourceType", async () => {
    // Guards against an over-broad unique index: two different tasks are two
    // different events and both must be creditable.
    await seedXpAward("task_completed", 10);

    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_a",
    });
    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_b",
    });

    expect(await ledgerCount()).toBe(2);
  });

  it("distinguishes different users crediting the same sourceId", async () => {
    // Two people completing "task_123" in their own accounts are two events.
    await seedUser("user_test_2");
    await seedXpAward("task_completed", 10);

    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_123",
    });
    await awardXp(db, {
      userId: "user_test_2",
      sourceType: "task_completed",
      sourceId: "task_123",
    });

    expect(await ledgerRows(USER_ID)).toHaveLength(1);
    expect(await ledgerRows("user_test_2")).toHaveLength(1);
  });

  it("distinguishes different sourceTypes for the same sourceId", async () => {
    // An id is only unique within its table. A routine and a task can both be
    // "id 42" without being the same event.
    await seedXpAward("task_completed", 10);
    await seedXpAward("routine_completed", 20);

    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "42",
    });
    await awardXp(db, {
      userId: USER_ID,
      sourceType: "routine_completed",
      sourceId: "42",
    });

    expect(await ledgerCount()).toBe(2);
  });

  it("rejects a duplicate row inserted directly, bypassing awardXp()", async () => {
    // Proves the guarantee is the schema, not the service. If application code
    // somewhere later inserts without ON CONFLICT, the database still refuses.
    await seedXpAward("task_completed", 10);
    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_123",
    });

    await expect(
      db.insert(xpTransactions).values({
        userId: USER_ID,
        sourceType: "task_completed",
        sourceId: "task_123",
        amount: 10,
        reason: "smuggled in",
      }),
    ).rejects.toThrow();

    expect(await ledgerCount()).toBe(1);
  });
});

describe("awardXp — config is the only source of the amount", () => {
  it("reads the payout from system_config, not from the caller", async () => {
    // The signature has no `amount` parameter, so there is no code path by which
    // a caller nominates its own payout. This test pins the behaviour that
    // makes that structural: the same call yields different XP when config does.
    await seedXpAward("task_completed", 10);
    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_a",
    });

    await db
      .update(systemConfig)
      .set({ value: 25, updatedAt: new Date() })
      .where(sql`${systemConfig.key} = 'xp.award.task_completed'`);

    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_b",
    });

    const rows = await ledgerRows();
    expect(rows.map((r) => r.amount)).toEqual([10, 25]);
  });

  it("throws when the source type has no config row", async () => {
    // Fails loud rather than awarding zero. A silent zero looks identical, in
    // the product, to a broken feature — but it hides the cause.
    await expect(
      awardXp(db, {
        userId: USER_ID,
        sourceType: "goal_milestone",
        sourceId: "goal_1",
      }),
    ).rejects.toBeInstanceOf(UnknownXpSourceError);

    expect(await ledgerCount()).toBe(0);
  });

  it("throws when the config value is not a number", async () => {
    await db.insert(systemConfig).values({
      key: "xp.award.task_completed",
      value: "lots",
      valueType: "string",
      description: "misconfigured",
    });

    await expect(
      awardXp(db, {
        userId: USER_ID,
        sourceType: "task_completed",
        sourceId: "task_1",
      }),
    ).rejects.toBeInstanceOf(InvalidXpConfigError);

    expect(await ledgerCount()).toBe(0);
  });

  it("throws when the config value is not an integer", async () => {
    // `10.5` XP is a number and passes every typeof check. Rejecting it here
    // means `lifetimeXp` can only ever be a whole number of XP, which keeps
    // level arithmetic exact rather than approximately exact.
    await db.insert(systemConfig).values({
      key: "xp.award.task_completed",
      value: 10.5,
      valueType: "number",
      description: "fractional",
    });

    await expect(
      awardXp(db, {
        userId: USER_ID,
        sourceType: "task_completed",
        sourceId: "task_1",
      }),
    ).rejects.toBeInstanceOf(InvalidXpConfigError);

    expect(await ledgerCount()).toBe(0);
  });

  it("throws when the config value is zero or negative", async () => {
    await db.insert(systemConfig).values({
      key: "xp.award.task_completed",
      value: 0,
      valueType: "number",
      description: "zero",
    });

    await expect(
      awardXp(db, {
        userId: USER_ID,
        sourceType: "task_completed",
        sourceId: "task_1",
      }),
    ).rejects.toBeInstanceOf(InvalidXpConfigError);
  });

  it("rejects a config row whose value_type disagrees with its JSON type", async () => {
    // The CHECK constraint on system_config. If this passes, the declared type
    // is decorative and every `valueType` check in the reader is theatre.
    await expect(
      db.insert(systemConfig).values({
        key: "xp.award.task_completed",
        value: 10,
        valueType: "string", // claims string, holds a number
        description: "lying",
      }),
    ).rejects.toThrow();
  });
});

describe("schema invariants", () => {
  it("has a unique index over (user_id, source_type, source_id)", async () => {
    // Asserted by name and column, not just "a unique index exists somewhere".
    // A refactor that drops or narrows this index is the single most damaging
    // change anyone could make to this schema, so it deserves a tripwire.
    const rows = await raw<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'xp_transactions'
    `);

    const def = rows.find((r) => r.indexname === "xp_transactions_user_source_uidx");
    expect(def, "xp_transactions_user_source_uidx is missing").toBeDefined();
    expect(def?.indexdef).toContain("UNIQUE");
    for (const column of ["user_id", "source_type", "source_id"]) {
      expect(def?.indexdef).toContain(column);
    }
  });

  it("indexes created_at for the retention policy", async () => {
    // Roadmap §2.3: the ledger is append-only and grows forever. This index is
    // what keeps the eventual archive a range scan rather than a table scan.
    const rows = await raw<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'xp_transactions'
    `);
    expect(rows.map((r) => r.indexname)).toContain("xp_transactions_created_at_idx");
  });

  it("refuses UPDATE on the ledger", async () => {
    // Append-only is enforced by a trigger, not by convention. Without it,
    // "append-only" is a comment that a future migration can quietly undo.
    const rows = await raw<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'xp_transactions' AND NOT t.tgisinternal
    `);
    expect(rows[0]?.count ?? 0).toBeGreaterThan(0);
  });

  it("refuses DELETE on the ledger", async () => {
    await seedXpAward("task_completed", 10);
    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_123",
    });

    await expect(
      db.execute(sql`DELETE FROM xp_transactions WHERE user_id = ${USER_ID}`),
    ).rejects.toThrow();

    expect(await ledgerCount()).toBe(1);
  });

  it("refuses a delete of a user that would orphan the ledger", async () => {
    // ON DELETE RESTRICT, not CASCADE. The ledger is the audit trail (PRD §39)
    // and account erasure goes through the tombstone path on users.deleted_at.
    await seedXpAward("task_completed", 10);
    await awardXp(db, {
      userId: USER_ID,
      sourceType: "task_completed",
      sourceId: "task_123",
    });

    await expect(db.execute(sql`DELETE FROM users WHERE id = ${USER_ID}`)).rejects.toThrow();
  });

  it("has no character-stat column anywhere in the progression core", async () => {
    // PRD §8: characters must not confer any statistical advantage. There is
    // no legitimate version of this table that has a character multiplier, so
    // the check is a scan of every column in the schema rather than a review.
    const rows = await raw<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users','user_progression','xp_transactions','streaks',
                           'streak_events','achievements','user_achievements')
        AND (
          column_name ILIKE '%character%'
          OR column_name ILIKE '%multiplier%'
          OR column_name ILIKE '%bonus%'
          OR column_name ILIKE '%boost%'
          OR column_name ILIKE '%xp_rate%'
        )
    `);

    expect(rows).toEqual([]);
  });
});
