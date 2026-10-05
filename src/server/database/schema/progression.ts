import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { xpSourceTypeEnum } from "./_enums.ts";
import { users } from "./users.ts";

/**
 * `xp_transactions` — THE XP LEDGER. Append-only. This is the source of truth.
 *
 * PRD §39 forbids storing XP as a bare counter because a counter cannot be
 * audited, cannot be corrected without losing history, and cannot answer "why
 * does this user have 4,200 XP". Every XP event in the product is one row here.
 *
 * `user_progression` below is a cache of this table. It can be deleted and
 * rebuilt at any time without losing a fact.
 *
 * ## Idempotency — the load-bearing constraint
 *
 *   UNIQUE (user_id, source_type, source_id)
 *
 * PRD §12 requires that XP cannot be farmed and that the same real-world event
 * cannot be credited twice. Application-level "check then insert" cannot deliver
 * that guarantee: two concurrent requests — or one request retried by a mobile
 * client on a flaky connection, or a double-tap on a task — both observe "not yet
 * present" and both insert. Only a database constraint closes the race.
 *
 * So the guarantee lives here, in the schema, and `awardXp()` is written to
 * collide with it deliberately (`ON CONFLICT DO NOTHING`). Retrofitted later
 * this would mean deduplicating a live table and deciding which duplicate to
 * keep; designed now it costs one index.
 *
 * `source_id` is `NOT NULL` on purpose. Postgres treats NULLs as distinct inside
 * a unique index, so a nullable `source_id` would make the constraint silently
 * inert for exactly the rows that have no source — the double-award case.
 *
 * `amount` is signed. Negative rows are corrections, and because the table is
 * append-only a correction is a new negative transaction rather than an edit.
 * Summing the column always yields the true balance.
 *
 * ## Append-only
 *
 * Enforced by a trigger hand-appended to migration
 * `0000_progression_core.sql` (`xp_transactions_reject_mutation`), not by
 * convention: `UPDATE` and `DELETE` on this table raise. `TRUNCATE` is deliberately left
 * permitted so test fixtures can reset cheaply; production code never issues it.
 */
export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * `ON DELETE RESTRICT`, not CASCADE. The ledger must outlive the account
     * that produced it, because it is the audit trail (PRD §39, §44). Account
     * deletion goes through the tombstone path on `users.deleted_at`; any future
     * hard purge has to disable the append-only trigger explicitly, which makes
     * it a reviewed decision instead of a forgotten cascade.
     */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /** What kind of activity this was. See `_enums.ts`. */
    sourceType: xpSourceTypeEnum("source_type").notNull(),

    /** Id of the specific activity, e.g. the task row. Never null. See above. */
    sourceId: text("source_id").notNull(),

    /**
     * Signed XP delta. Resolved from `system_config` at `xp.award.<source_type>`,
     * never supplied by a caller and never hardcoded (PRD §11).
     */
    amount: integer("amount").notNull(),

    /**
     * Human-readable provenance, kept denormalised so an auditor reading only
     * this table does not have to join to configuration that may have since
     * changed. Default is written by `awardXp()` as the config key it read.
     */
    reason: text("reason").notNull(),

    /**
     * Indexed from day one (roadmap §2.3). The ledger is append-only and grows
     * forever: ~365k rows/year at 100 users. This index is what makes the
     * eventual archive/partition decision cheap, because "everything older than
     * X" stays a single sequential range scan instead of becoming a sequential
     * scan of the heap.
     */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // ── The anti-double-credit constraint. See the block comment above. ──
    uniqueIndex("xp_transactions_user_source_uidx").on(t.userId, t.sourceType, t.sourceId),

    // ── Retention / archive policy support (roadmap §2.3). ──
    index("xp_transactions_created_at_idx").on(t.createdAt),

    // Per-user history and lifetime totals without a full scan.
    index("xp_transactions_user_created_at_idx").on(t.userId, t.createdAt),

    // A zero-XP ledger row is always a bug (an unconfigured source, or a
    // mis-seeded config). Reject it at the boundary so it cannot quietly
    // pollute lifetime totals.
    check("xp_transactions_amount_nonzero", sql`${t.amount} <> 0`),
  ],
);

/**
 * `user_progression` — DERIVED CACHE. Not the source of truth.
 *
 * Read this table on every dashboard render because it is O(1). Never treat it
 * as authoritative: it exists purely to avoid summing the ledger on a request
 * that has a 10 ms CPU budget (ADR 0001). Phase 2 implements
 * `projectProgression()`, which rebuilds this table from `xp_transactions`;
 * the fact that a full rebuild is expected to reproduce these rows exactly is
 * the proof that the ledger is trustworthy.
 *
 * Every column here is derivable. None of them may be the origin of a fact.
 */
export const userProgression = pgTable(
  "user_progression",
  {
    /** One cache row per user. */
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Current level. Derived from `lifetimeXp` through the configured curve. */
    level: integer("level").notNull().default(1),

    /**
     * XP earned within the current level, i.e. `lifetimeXp` minus the curve's
     * cumulative total for `level`. Recomputed on every projection, because the
     * curve itself is configuration and can be edited (PRD §13).
     */
    xpIntoLevel: integer("xp_into_level").notNull().default(0),

    /**
     * The curve's requirement for the current level, snapshotted at projection
     * time. Denormalised so the UI can render "2,840 / 3,500 XP" (PRD §10) with
     * one row read instead of a curve evaluation per render.
     */
    xpForNextLevel: integer("xp_for_next_level").notNull(),

    /**
     * Total XP ever earned. `bigint` because a heavy user passes 2^31 XP within
     * a few years and an `int4` overflow here would be a total, unrecoverable
     * corruption of the product's central number.
     */
    lifetimeXp: bigint("lifetime_xp", { mode: "number" }).notNull().default(0),

    /** When this cache row was last rebuilt from the ledger. */
    projectedAt: timestamp("projected_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A level below 1 is unreachable; level 1 with zero XP into it is the
    // legitimate fresh-account state.
    check("user_progression_level_positive", sql`${t.level} >= 1`),
    check("user_progression_xp_into_level_nonnegative", sql`${t.xpIntoLevel} >= 0`),
  ],
);

export type XpTransactionRow = typeof xpTransactions.$inferSelect;
export type NewXpTransactionRow = typeof xpTransactions.$inferInsert;
export type UserProgressionRow = typeof userProgression.$inferSelect;
