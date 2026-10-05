import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { achievementRarityEnum, type Locale } from "./_enums.ts";
import { users } from "./users.ts";

/**
 * Localised copy, stored as `{ "en": "...", "id": "..." }`.
 *
 * The locked decision is a bilingual, user-selectable UI (roadmap §1). Retrofitting
 * i18n after the fact is a 3–5× cost, so the schema carries the translation from
 * the first migration even though Phase 0 writes no copy at all.
 *
 * Why `jsonb` and not a `achievement_translations` side table: the set of
 * translatable strings here is tiny and always read together with its parent
 * row. A join to fetch a name that the dashboard already fetched the id for
 * would be pure overhead. The trade-off is that a missing `id` key cannot be
 * enforced by a `NOT NULL` on a column — `readLocalized()` in
 * `src/server/services/` is what turns that into a type-safe guarantee, and it
 * falls back to `en` rather than rendering an empty string.
 */
export type LocalizedText = Record<Locale, string> & { en: string };

/**
 * Declarative unlock condition.
 *
 * PRD §28 gives every achievement a `condition` and PRD §11/§13 forbid hardcoding
 * progression rules in the client. Storing the condition as data rather than as
 * a code branch means an achievement can be added or rebalanced by a config
 * change instead of a deploy, and — more importantly — that the set of
 * conditions is enumerable. Phase 2 implements the evaluator; the closed set of
 * shapes below is what it will be written against.
 *
 * ```ts
 * type AchievementCondition =
 *   | { kind: "streak_days";      days: number }              // PRD §17
 *   | { kind: "tasks_completed";  count: number }             // PRD §28
 *   | { kind: "level_reached";    level: number }             // PRD §28
 *   | { kind: "focus_hours";      hours: number }             // PRD §28
 *   | { kind: "goals_completed";  count: number }             // PRD §28
 *   | { kind: "xp_lifetime";      amount: number }
 *   | { kind: "manual";           reason: string };
 * ```
 */
export type AchievementCondition =
  | { kind: "streak_days"; days: number }
  | { kind: "tasks_completed"; count: number }
  | { kind: "level_reached"; level: number }
  | { kind: "focus_hours"; hours: number }
  | { kind: "goals_completed"; count: number }
  | { kind: "xp_lifetime"; amount: number }
  | { kind: "manual"; reason: string };

/**
 * `achievements` — the catalogue. Static, seeded, shared by every user.
 *
 * PRD §28 calls an achievement a permanent milestone, so this table is
 * append-mostly: add a row, retire it with `isActive = false`. Never delete one,
 * because `user_achievements` rows reference it and a delete would take a user's
 * history with it.
 */
export const achievements = pgTable(
  "achievements",
  {
    /**
     * Stable slug, e.g. `streak_7d`, `level_25`. Text, not uuid: achievements are
     * referenced from config, from the roadmap, and from share cards by humans.
     * A stable readable key survives a re-seed where a generated uuid would not.
     */
    id: text("id").primaryKey(),

    name: jsonb("name").$type<LocalizedText>().notNull(),
    description: jsonb("description").$type<LocalizedText>().notNull(),

    /**
     * Icon key resolved against the design system (DESIGN §42 `AchievementBadge`).
     * A key rather than a path so the icon set can be restyled without a data
     * migration.
     */
    icon: text("icon").notNull(),

    /** Visual weight only. Never feeds a reward multiplier — see `_enums.ts`. */
    rarity: achievementRarityEnum("rarity").notNull().default("common"),

    condition: jsonb("condition").$type<AchievementCondition>().notNull(),

    /**
     * XP granted on unlock. `0` is the common case and is a legitimate value —
     * most achievements are recognition, not currency. Note this is awarded
     * through the same `xp_transactions` ledger as everything else, keyed on
     * source `achievement_unlocked`, so a retried unlock cannot double-pay.
     */
    xpReward: integer("xp_reward").notNull().default(0),

    /** Hidden until earned, so the collection has something to discover. */
    isSecret: boolean("is_secret").notNull().default(false),

    /** Retired achievements stop being evaluated; history is preserved. */
    isActive: boolean("is_active").notNull().default(true),

    /** Manual ordering, since achievement ids carry no natural sort order. */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("achievements_active_sort_idx").on(t.isActive, t.sortOrder),
    check("achievements_xp_reward_nonnegative", sql`${t.xpReward} >= 0`),
  ],
);

/**
 * `user_achievements` — unlock records.
 *
 * The composite primary key *is* the idempotency guarantee: an achievement
 * cannot be unlocked twice, so a duplicate evaluation, a replayed event, or a
 * concurrent streak milestone all collapse to the same no-op. This mirrors
 * `xp_transactions`' unique constraint for the same reason.
 */
export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    achievementId: text("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "restrict" }),

    /**
     * Progress at the moment of unlock, retained as an integer so a
     * "you beat your record by 3" message is possible later (PRD §29). Typed
     * loosely today because the meaning is per-condition; it is a display
     * detail, never a source of truth.
     */
    progressAtUnlock: integer("progress_at_unlock"),

    unlockedAt: timestamp("unlocked_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.achievementId] }),
    // "Recent unlocks" feed and the level-up moment (DESIGN §18).
    index("user_achievements_user_unlocked_at_idx").on(t.userId, t.unlockedAt),
  ],
);

export type AchievementRow = typeof achievements.$inferSelect;
export type UserAchievementRow = typeof userAchievements.$inferSelect;
